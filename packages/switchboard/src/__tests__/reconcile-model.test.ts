// =====================================================================
// WC46.016 — reconcileModel (the MODEL-LEVEL reconcile pass).
//
// driftReport compares ONE resource across two Levels. reconcileModel lifts
// that to the WHOLE registered model: every resource, one verdict. Proofs:
//   • a fully-aligned model reports inSync with per-resource reports;
//   • drift in ANY resource flips the model verdict and is itemized;
//   • a resource only ONE Level backs is recorded MISSING, not thrown.
// =====================================================================

import { describe, expect, it } from "vitest";
import { CodeAdapter, Registry, reconcileModel, type ResourceContract } from "../index";

const aContract: ResourceContract = {
  name: "alpha",
  key: "id",
  sourceOfTruth: "L2",
  fields: [
    { name: "id", type: "string" },
    { name: "label", type: "string" },
  ],
};
const bContract: ResourceContract = {
  name: "beta",
  key: "id",
  sourceOfTruth: "L2",
  fields: [
    { name: "id", type: "string" },
    { name: "status", type: "string" },
  ],
};

function adapter(
  level: "L2" | "L3",
  kind: "airtable" | "supabase",
  fixtures: Record<string, Record<string, unknown>[]>,
) {
  const a = new CodeAdapter({ fixtures });
  Object.defineProperty(a, "level", { value: level });
  Object.defineProperty(a, "kind", { value: kind });
  return a;
}

describe("reconcileModel — whole-model drift across two Levels", () => {
  it("reports inSync when every resource matches on both Levels", async () => {
    const registry = new Registry().register(aContract).register(bContract);
    const from = adapter("L2", "airtable", {
      alpha: [{ id: "a1", label: "A" }],
      beta: [{ id: "b1", status: "open" }],
    });
    const to = adapter("L3", "supabase", {
      alpha: [{ id: "a1", label: "A" }],
      beta: [{ id: "b1", status: "open" }],
    });

    const report = await reconcileModel(registry, from, to);
    expect(report.inSync).toBe(true);
    expect(report.summary).toMatchObject({ total: 2, inSync: 2, drifted: 0, missing: 0 });
    expect(report.resources.every((r) => r.report && r.presentIn.length === 2)).toBe(true);
  });

  it("flips the model verdict when ANY resource drifts, and itemizes it", async () => {
    const registry = new Registry().register(aContract).register(bContract);
    const from = adapter("L2", "airtable", {
      alpha: [{ id: "a1", label: "A" }],
      beta: [{ id: "b1", status: "open" }],
    });
    const to = adapter("L3", "supabase", {
      alpha: [{ id: "a1", label: "A" }],
      beta: [{ id: "b1", status: "merged" }], // value drift on beta.status
    });

    const report = await reconcileModel(registry, from, to);
    expect(report.inSync).toBe(false);
    expect(report.summary).toMatchObject({ total: 2, inSync: 1, drifted: 1 });
    const beta = report.resources.find((r) => r.resource === "beta")!;
    expect(beta.report!.values).toContainEqual({
      key: "b1",
      field: "status",
      fromValue: "open",
      toValue: "merged",
    });
  });

  it("records a resource only ONE Level backs as MISSING (not a throw)", async () => {
    const registry = new Registry().register(aContract).register(bContract);
    // `to` (supabase) has no map for `beta` → UnknownResourceError on probe.
    const from = adapter("L2", "airtable", {
      alpha: [{ id: "a1", label: "A" }],
      beta: [{ id: "b1", status: "open" }],
    });
    const to = adapter("L3", "supabase", { alpha: [{ id: "a1", label: "A" }] });

    const report = await reconcileModel(registry, from, to);
    expect(report.inSync).toBe(false);
    expect(report.summary).toMatchObject({ total: 2, missing: 1 });
    const beta = report.resources.find((r) => r.resource === "beta")!;
    expect(beta.report).toBeUndefined();
    expect(beta.presentIn).toEqual(["L2"]);
    expect(beta.skipped).toMatch(/not mapped in L3/);
  });

  it("can be scoped to a subset of resources", async () => {
    const registry = new Registry().register(aContract).register(bContract);
    const from = adapter("L2", "airtable", { alpha: [{ id: "a1", label: "A" }], beta: [{ id: "b1", status: "x" }] });
    const to = adapter("L3", "supabase", { alpha: [{ id: "a1", label: "A" }], beta: [{ id: "b1", status: "y" }] });

    const report = await reconcileModel(registry, from, to, { resources: ["alpha"] });
    expect(report.summary.total).toBe(1);
    expect(report.inSync).toBe(true); // beta's drift is out of scope.
  });
});
