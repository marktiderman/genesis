// =====================================================================
// Degraded reads are NEVER laundered into authoritative data (CMT-1742-002),
// and a Tier-C JOIN miss is NEVER silent (CMT-1742-011).
//
// CMT-1742-002 — when Airtable's refresh fails and the adapter degrades to a
// stale last-known-good snapshot, it (a) logs the failure with a correlation
// id and (b) STAMPS the rows stale so driftReport flags `degraded` (never
// inSync) and promote() REFUSES to backfill off them. No silent fallback.
//
// CMT-1742-011 — when a federated (Tier C) contributor row is missing for a
// key, the field still resolves to undefined (the base must not leak through)
// but the JOIN miss is LOGGED, distinct from "row present, field absent".
// =====================================================================

import { describe, expect, it, vi } from "vitest";
import {
  AirtableAdapter,
  CodeAdapter,
  Registry,
  Switchboard,
  driftReport,
  featuresAirtableMap,
  featuresContract,
  promote,
  staleInfo,
} from "../index";
import type { FieldSchema, ResourceContract } from "../index";
import { makeAirtableFetch } from "./helpers/airtable-fetch";

/** An Airtable adapter that succeeds once (priming lastGood) then 429s forever. */
function staleableAirtable() {
  let phase: "ok" | "fail" = "ok";
  const okFetch = makeAirtableFetch({
    [featuresAirtableMap.table]: [{ id: "rec_f1", fields: { [featuresAirtableMap.fields.name!]: "Cached" } }],
  });
  const failFetch = makeAirtableFetch({ [featuresAirtableMap.table]: [] }, { throttleFirst: 99 });
  const adapter = new AirtableAdapter({
    apiKey: "key-test",
    baseId: "appXXXXXXXXXXXXXX",
    maps: { features: featuresAirtableMap },
    ttlMs: 0, // force a refresh each call so the 2nd hits the (failing) network.
    maxRetries: 1,
    sleep: async () => {},
    fetch: (url, init) => (phase === "ok" ? okFetch(url, init) : failFetch(url, init)),
  });
  return { adapter, fail: () => (phase = "fail") };
}

describe("CMT-1742-002 — stale-while-error stamps + logs, never silent", () => {
  it("a fresh read is NOT stale-marked", async () => {
    const { adapter } = staleableAirtable();
    const rows = await adapter.list(featuresContract);
    expect(staleInfo(rows)).toBeUndefined();
  });

  it("a degraded read is stamped stale and logs an errorId + context", async () => {
    const { adapter, fail } = staleableAirtable();
    await adapter.list(featuresContract); // prime lastGood
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fail();
    const rows = await adapter.list(featuresContract); // refresh fails → stale served
    expect(rows[0]).toMatchObject({ name: "Cached" }); // still degrades gracefully
    const info = staleInfo(rows);
    expect(info).toBeDefined();
    expect(info?.resource).toBe("features");
    expect(info?.errorId).toMatch(/^swb-stale-/);
    expect(err).toHaveBeenCalledOnce();
    expect(err.mock.calls[0]?.[0]).toContain("Airtable refresh FAILED");
    err.mockRestore();
  });

  it("the stale marker never serializes into the data (non-enumerable)", async () => {
    const { adapter, fail } = staleableAirtable();
    await adapter.list(featuresContract);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fail();
    const rows = await adapter.list(featuresContract);
    // The symbol marker is invisible to JSON / Object iteration — it can't leak
    // into a column, a drift value, or a backfill literal.
    expect(JSON.parse(JSON.stringify(rows))).toEqual([{ id: "rec_f1", name: "Cached" }]);
    vi.restoreAllMocks();
  });

  it("driftReport flags `degraded` and is NEVER inSync on a stale read", async () => {
    const { adapter, fail } = staleableAirtable();
    await adapter.list(featuresContract);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fail();
    const registry = new Registry().register(featuresContract);
    // `to` mirrors the same single row — absent the stale flag this would be inSync.
    const to = new CodeAdapter({ fixtures: { features: [{ id: "rec_f1", name: "Cached" }] } });
    Object.defineProperty(to, "level", { value: "L3" });
    Object.defineProperty(to, "kind", { value: "supabase" });
    const report = await driftReport(registry, "features", adapter, to);
    expect(report.degraded).toHaveLength(1);
    expect(report.degraded[0]?.resource).toBe("features");
    expect(report.inSync).toBe(false); // stale data cannot read as "synced"
    vi.restoreAllMocks();
  });

  it("promote() REFUSES to backfill from a stale read", async () => {
    const { adapter, fail } = staleableAirtable();
    await adapter.list(featuresContract);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fail();
    const staleRows = await adapter.list(featuresContract);
    const registry = new Registry().register(featuresContract);
    expect(() => promote(registry, "features", { backfill: staleRows })).toThrow(/STALE\/degraded read/);
    vi.restoreAllMocks();
  });
});

describe("CMT-1742-011 — federated JOIN miss is logged, not silent", () => {
  const widgetContract: ResourceContract = {
    name: "widgets",
    key: "id",
    sourceOfTruth: "L1",
    fields: [
      { name: "id", type: "string" },
      { name: "label", type: "string" },
      { name: "scratch", type: "string", optional: true },
    ] satisfies FieldSchema[],
  };

  it("resolves the field to undefined AND warns when the contributor row is missing", async () => {
    const base = new CodeAdapter({ fixtures: { widgets: [{ id: "orphan", label: "Lone", scratch: "x" }] } });
    Object.defineProperty(base, "kind", { value: "supabase" });
    const scratchProvider = new CodeAdapter({ fixtures: { widgets: [] } }); // no matching key

    const registry = new Registry()
      .register(widgetContract)
      .useAdapter(scratchProvider)
      .useAdapter(base)
      .setEnvironmentDefault("supabase")
      .bindFields("widgets", "supabase", { scratch: "code" });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = await new Switchboard(registry).resource("widgets").list();
    // Base value must NOT leak through the federated field — it is undefined…
    expect(rows[0]!.scratch).toBeUndefined();
    // …but the JOIN miss was LOGGED (not silent).
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('has NO "code" contributor row');
    warn.mockRestore();
  });

  it("does NOT warn when the contributor row exists (field absence is legitimate)", async () => {
    const base = new CodeAdapter({ fixtures: { widgets: [{ id: "w1", label: "A", scratch: "base" }] } });
    Object.defineProperty(base, "kind", { value: "supabase" });
    // Contributor row EXISTS but omits `scratch` — a legitimate absence, not a miss.
    const scratchProvider = new CodeAdapter({ fixtures: { widgets: [{ id: "w1", label: "n/a" }] } });

    const registry = new Registry()
      .register(widgetContract)
      .useAdapter(scratchProvider)
      .useAdapter(base)
      .setEnvironmentDefault("supabase")
      .bindFields("widgets", "supabase", { scratch: "code" });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = await new Switchboard(registry).resource("widgets").list();
    expect(rows[0]!.scratch).toBeUndefined(); // absent on the existing contributor row
    expect(warn).not.toHaveBeenCalled(); // row present ⇒ no JOIN-miss warning
    warn.mockRestore();
  });
});
