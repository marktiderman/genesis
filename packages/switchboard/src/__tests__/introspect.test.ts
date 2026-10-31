// =====================================================================
// WC46.015 — wholesale / zero-config introspection.
//
// describe() now DERIVES the schema from the backing source's actual DATA
// (not a hand-authored contract echo). The proofs:
//   • a field present in the DATA but ABSENT from the contract surfaces in
//     describe() — i.e. adding a field requires NO contract edit;
//   • types/optionality/array-ness are inferred from the values;
//   • an EMPTY source falls back to the declared contract fields;
//   • the new introspection makes SCHEMA DRIFT detectable — a column that
//     exists on one Level but not the other now shows up in driftReport
//     (impossible when both sides echoed the same contract).
// =====================================================================

import { describe, expect, it } from "vitest";
import {
  CodeAdapter,
  Registry,
  driftReport,
  inferFieldType,
  introspectFields,
  type ResourceContract,
} from "../index";

interface Widget extends Record<string, unknown> {
  id: string;
  label: string;
}

const widgetContract: ResourceContract<Widget> = {
  name: "widgets",
  key: "id",
  sourceOfTruth: "L1",
  fields: [
    { name: "id", type: "string", description: "identity" },
    { name: "label", type: "string" },
  ],
};

describe("inferFieldType — value → canonical type", () => {
  it("infers scalars, datetimes, json and arrays", () => {
    expect(inferFieldType("hello")).toEqual({ type: "string", array: false });
    expect(inferFieldType(42)).toEqual({ type: "number", array: false });
    expect(inferFieldType(true)).toEqual({ type: "boolean", array: false });
    expect(inferFieldType("2026-06-25T09:48:40Z")).toEqual({ type: "datetime", array: false });
    expect(inferFieldType("2026-06-25")).toEqual({ type: "datetime", array: false });
    expect(inferFieldType({ a: 1 })).toEqual({ type: "json", array: false });
    expect(inferFieldType(["a", "b"])).toEqual({ type: "string", array: true });
    expect(inferFieldType([1, 2])).toEqual({ type: "number", array: true });
  });
});

describe("introspectFields — schema from data, not echo", () => {
  it("surfaces a field present in the DATA but ABSENT from the contract", () => {
    const rows = [
      { id: "w1", label: "Alpha", priority: 3, shipped: true },
      { id: "w2", label: "Beta", priority: 1, shipped: false },
    ];
    const fields = introspectFields(rows, widgetContract);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    // The two NEW columns appear with NO contract edit — the whole point.
    expect(byName.priority).toMatchObject({ name: "priority", type: "number" });
    expect(byName.shipped).toMatchObject({ name: "shipped", type: "boolean" });
    // Contract description is carried through as enrichment.
    expect(byName.id?.description).toBe("identity");
  });

  it("marks a field optional when some rows omit it", () => {
    const rows = [
      { id: "w1", label: "Alpha", note: "hi" },
      { id: "w2", label: "Beta" }, // no `note`
    ];
    const note = introspectFields(rows).find((f) => f.name === "note")!;
    expect(note.optional).toBe(true);
  });

  it("prefers a more-specific contract type over a generic string inference", () => {
    const dateContract: ResourceContract = {
      name: "events",
      key: "id",
      sourceOfTruth: "L1",
      fields: [
        { name: "id", type: "string" },
        { name: "when", type: "datetime" },
      ],
    };
    // The value is a date-less string → inference would say "string"; the
    // contract's declared "datetime" wins so the semantic type survives.
    const fields = introspectFields([{ id: "e1", when: "tbd" }], dateContract);
    expect(fields.find((f) => f.name === "when")!.type).toBe("datetime");
  });

  it("falls back to the declared contract fields when the source is EMPTY", () => {
    expect(introspectFields([], widgetContract)).toEqual(widgetContract.fields);
    expect(introspectFields([])).toEqual([]);
  });
});

describe("CodeAdapter.describe() introspects fixtures", () => {
  it("reports a fixture-only field the contract never declared", async () => {
    const adapter = new CodeAdapter({
      fixtures: { widgets: [{ id: "w1", label: "Alpha", extra: 99 }] },
    });
    const result = await adapter.describe(widgetContract);
    expect(result.fields.map((f) => f.name)).toContain("extra");
    expect(result.fields.find((f) => f.name === "extra")).toMatchObject({ type: "number" });
  });

  it("falls back to the contract when fixtures are empty", async () => {
    const adapter = new CodeAdapter({ fixtures: { widgets: [] } });
    const result = await adapter.describe(widgetContract);
    expect(result.fields).toEqual(widgetContract.fields);
  });
});

describe("introspection makes SCHEMA DRIFT detectable", () => {
  it("driftReport surfaces a column present in one Level but not the other", async () => {
    const registry = new Registry().register(widgetContract);

    // L2 has an EXTRA `curatorNote` column the contract never declared.
    const from = new CodeAdapter({
      fixtures: { widgets: [{ id: "w1", label: "Alpha", curatorNote: "needs review" }] },
    });
    Object.defineProperty(from, "level", { value: "L2" });
    Object.defineProperty(from, "kind", { value: "airtable" });

    // L3 lacks it.
    const to = new CodeAdapter({
      fixtures: { widgets: [{ id: "w1", label: "Alpha" }] },
    });
    Object.defineProperty(to, "level", { value: "L3" });
    Object.defineProperty(to, "kind", { value: "supabase" });

    const report = await driftReport(registry, "widgets", from, to);
    // Pre-WC46.015 (both echoing the contract) this was ALWAYS empty.
    expect(report.schema).toContainEqual({ field: "curatorNote", in: "L2", missingIn: "L3" });
    expect(report.inSync).toBe(false);
  });
});
