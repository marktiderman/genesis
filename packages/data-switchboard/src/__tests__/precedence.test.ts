// =====================================================================
// Resolution precedence C > B > A, plus Tier C field federation.
//
// The registry resolves, per resource and per field, which provider serves
// it. A field binding (C) wins over a resource binding (B), which wins over
// the environment default (A). Tier C is a field-level JOIN by the resource
// `key`: the base provider supplies identity + unclaimed fields, federated
// fields come from another provider and are merged in.
// =====================================================================

import { describe, expect, it } from "vitest";
import { CodeAdapter, Registry, Switchboard, type ResourceContract } from "../index";

interface Widget extends Record<string, unknown> {
  id: string;
  label: string;
  scratch: string;
}

const widgetContract: ResourceContract<Widget> = {
  name: "widgets",
  key: "id",
  sourceOfTruth: "L1",
  fields: [
    { name: "id", type: "string" },
    { name: "label", type: "string" },
    { name: "scratch", type: "string", optional: true },
  ],
};

describe("resolution precedence C > B > A", () => {
  function registryWith(): Registry {
    // Two L1 adapters standing in for two different providers so we can
    // observe which one a resolution picked. (CodeAdapter is `code`; we add a
    // second under a different kind via a thin subclass.)
    const airtableLike = new CodeAdapter({ fixtures: { widgets: [] } });
    Object.defineProperty(airtableLike, "kind", { value: "airtable" });
    const supabaseLike = new CodeAdapter({ fixtures: { widgets: [] } });
    Object.defineProperty(supabaseLike, "kind", { value: "supabase" });
    const codeAdapter = new CodeAdapter({ fixtures: { widgets: [] } });

    return new Registry()
      .register(widgetContract)
      .useAdapter(codeAdapter)
      .useAdapter(airtableLike)
      .useAdapter(supabaseLike);
  }

  it("A only — environment default applies to every resource", () => {
    const r = registryWith().setEnvironmentDefault("airtable");
    expect(r.resolve("widgets")).toMatchObject({ base: "airtable", baseTier: "A" });
  });

  it("B over A — a resource binding overrides the environment default", () => {
    const r = registryWith().setEnvironmentDefault("airtable").bindResource("widgets", "supabase");
    expect(r.resolve("widgets")).toMatchObject({ base: "supabase", baseTier: "B" });
  });

  it("C over B over A — a field binding wins outright for the base", () => {
    const r = registryWith()
      .setEnvironmentDefault("airtable") // A
      .bindResource("widgets", "supabase") // B
      .bindFields("widgets", "supabase", { scratch: "code" }); // C
    const plan = r.resolve("widgets");
    expect(plan.baseTier).toBe("C");
    expect(plan.base).toBe("supabase");
    expect(plan.federated).toEqual({ scratch: "code" });
  });

  it("throws when no binding applies", () => {
    const r = registryWith();
    expect(() => r.resolve("widgets")).toThrow(/no Tier A\/B\/C binding/);
  });
});

describe("Tier C field federation — merge by `key`", () => {
  it("base supplies identity + label; scratch federated from another provider", async () => {
    // Base (supabase-like) has id+label; the `code` provider supplies scratch.
    const base = new CodeAdapter({
      fixtures: {
        widgets: [
          { id: "w1", label: "Alpha", scratch: "BASE_IGNORED" },
          { id: "w2", label: "Beta", scratch: "BASE_IGNORED" },
        ],
      },
    });
    Object.defineProperty(base, "kind", { value: "supabase" });

    const scratchProvider = new CodeAdapter({
      fixtures: {
        widgets: [
          { id: "w1", label: "n/a", scratch: "from-code-1" },
          { id: "w2", label: "n/a", scratch: "from-code-2" },
        ],
      },
    });
    // kind stays "code".

    const registry = new Registry()
      .register(widgetContract)
      .useAdapter(scratchProvider)
      .useAdapter(base)
      .setEnvironmentDefault("supabase")
      .bindFields("widgets", "supabase", { scratch: "code" });

    const data = new Switchboard(registry);
    const rows = await data.resource<Widget>("widgets").list();

    // Identity + label from base; scratch FEDERATED from the code provider.
    expect(rows).toHaveLength(2);
    const w1 = rows.find((r) => r.id === "w1")!;
    expect(w1.label).toBe("Alpha"); // base
    expect(w1.scratch).toBe("from-code-1"); // federated, overrode BASE_IGNORED
    const w2 = rows.find((r) => r.id === "w2")!;
    expect(w2.scratch).toBe("from-code-2");
  });

  it("federated field is undefined when the contributor has no matching key", async () => {
    const base = new CodeAdapter({
      fixtures: { widgets: [{ id: "orphan", label: "Lone", scratch: "x" }] },
    });
    Object.defineProperty(base, "kind", { value: "supabase" });
    const scratchProvider = new CodeAdapter({ fixtures: { widgets: [] } });

    const registry = new Registry()
      .register(widgetContract)
      .useAdapter(scratchProvider)
      .useAdapter(base)
      .setEnvironmentDefault("supabase")
      .bindFields("widgets", "supabase", { scratch: "code" });

    const rows = await new Switchboard(registry).resource<Widget>("widgets").list();
    expect(rows[0]!.scratch).toBeUndefined();
  });
});
