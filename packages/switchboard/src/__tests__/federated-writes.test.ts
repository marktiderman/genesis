// =====================================================================
// WC46.016 — Tier-C federated WRITES.
//
// A Tier-C resource composes its row from MANY providers (base owns identity +
// unclaimed fields; each federated field is owned by another provider). A write
// must FAN OUT: each field routes to its owner, keyed by the shared `key`.
//
// Pre-WC46.016, writes targeted only the base provider — a federated-field edit
// was silently dropped. These tests prove create/update/delete now route each
// field slice to the provider that OWNS it, and that reads reflect both sides.
// =====================================================================

import { describe, expect, it } from "vitest";
import { CodeAdapter, Registry, Switchboard, type ResourceContract } from "../index";

interface Widget extends Record<string, unknown> {
  id: string;
  label: string; // base-owned
  scratch: string; // federated → code provider
}

const widgetContract: ResourceContract<Widget> = {
  name: "widgets",
  key: "id",
  sourceOfTruth: "L3",
  fields: [
    { name: "id", type: "string" },
    { name: "label", type: "string" },
    { name: "scratch", type: "string", optional: true },
  ],
};

/** Base = a supabase-like CodeAdapter (owns id+label); scratch federated to `code`. */
function federatedSetup() {
  const base = new CodeAdapter({ fixtures: { widgets: [] } });
  Object.defineProperty(base, "kind", { value: "supabase" });
  const scratchProvider = new CodeAdapter({ fixtures: { widgets: [] } }); // kind "code"

  const registry = new Registry()
    .register(widgetContract)
    .useAdapter(scratchProvider)
    .useAdapter(base)
    .setEnvironmentDefault("supabase")
    .bindFields("widgets", "supabase", { scratch: "code" });

  return { data: new Switchboard(registry), base, scratchProvider };
}

describe("Tier-C federated create", () => {
  it("routes base fields to base and federated fields to their owner", async () => {
    const { data, base, scratchProvider } = federatedSetup();

    const created = await data.resource<Widget>("widgets").create({
      id: "w1",
      label: "Alpha",
      scratch: "from-code",
    });

    // Returned row is the consolidated canonical shape.
    expect(created).toMatchObject({ id: "w1", label: "Alpha", scratch: "from-code" });

    // Base stored identity + label, but NOT the federated scratch value.
    const baseRow = (await base.list(widgetContract))[0]!;
    expect(baseRow).toMatchObject({ id: "w1", label: "Alpha" });
    expect(baseRow.scratch).toBeUndefined();

    // The `code` provider stored the federated field keyed by the shared id.
    const scratchRow = (await scratchProvider.list(widgetContract))[0]!;
    expect(scratchRow).toMatchObject({ id: "w1", scratch: "from-code" });
    expect(scratchRow.label).toBeUndefined();
  });
});

describe("Tier-C federated update", () => {
  it("routes a federated-field patch to its owning provider (not base)", async () => {
    const { data, base, scratchProvider } = federatedSetup();
    await data.resource<Widget>("widgets").create({ id: "w1", label: "Alpha", scratch: "v1" });

    const updated = await data.resource<Widget>("widgets").update("w1", { scratch: "v2" });
    expect(updated.scratch).toBe("v2");

    // The federated value changed in the `code` provider…
    expect((await scratchProvider.get(widgetContract, "w1"))!.scratch).toBe("v2");
    // …and base was untouched (still no scratch column on it).
    expect((await base.get(widgetContract, "w1"))!.scratch).toBeUndefined();
  });

  it("routes base + federated fields in one patch to BOTH providers", async () => {
    const { data, base, scratchProvider } = federatedSetup();
    await data.resource<Widget>("widgets").create({ id: "w1", label: "Alpha", scratch: "v1" });

    const updated = await data.resource<Widget>("widgets").update("w1", {
      label: "Renamed",
      scratch: "v2",
    });
    expect(updated).toMatchObject({ label: "Renamed", scratch: "v2" });

    expect((await base.get(widgetContract, "w1"))!.label).toBe("Renamed");
    expect((await scratchProvider.get(widgetContract, "w1"))!.scratch).toBe("v2");
  });
});

describe("Tier-C federated delete", () => {
  it("removes the keyed row from base AND every federated owner", async () => {
    const { data, base, scratchProvider } = federatedSetup();
    await data.resource<Widget>("widgets").create({ id: "w1", label: "Alpha", scratch: "v1" });

    await data.resource<Widget>("widgets").delete("w1");

    expect(await base.list(widgetContract)).toHaveLength(0);
    expect(await scratchProvider.list(widgetContract)).toHaveLength(0);
    expect(await data.resource<Widget>("widgets").get("w1")).toBeNull();
  });
});
