// =====================================================================
// Tier B (MERGE) — multi-source READ-TIME merge.
//
// A resource bound to an ORDERED list of sources (e.g. ["airtable","supabase"])
// returns, on EVERY read, the MERGED set:
//   1. UNION         — rows from every source.
//   2. DEDUP by key  — rows sharing the resource `key` collapse to ONE.
//   3. CONSOLIDATE   — a record's fields = the union across sources for its key.
//   4. CONFLICT      — same field in >1 source ⇒ the LAST-listed source WINS.
// This is a read-time QUERY merge, NOT a sync. Writes route to a single
// designated source (writeTo ?? last source) — never write-to-all.
//
// The owner's worked example is the load-bearing case here:
//   Airtable = 5 rows, Supabase = 10 rows, 4 Airtable rows share a key with
//   Supabase rows ⇒ the merged result is 11 records (15 union − 4 collapsed).
// =====================================================================

import { describe, expect, it } from "vitest";
import {
  AIRTABLE_BASE_ID,
  AirtableAdapter,
  CodeAdapter,
  Registry,
  SupabaseAdapter,
  Switchboard,
  isMergeBinding,
  type ResourceContract,
} from "../index";
import { makeAirtableFetch } from "./helpers/airtable-fetch";
import { FakeSupabaseClient } from "./helpers/fake-supabase";

// A tiny resource used across the merge cases.
interface Item extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  note: string;
}

const itemContract: ResourceContract<Item> = {
  name: "items",
  key: "id",
  sourceOfTruth: "L2",
  fields: [
    { name: "id", type: "string" },
    { name: "name", type: "string" },
    { name: "status", type: "string", optional: true },
    { name: "note", type: "string", optional: true },
  ],
};

/**
 * Build a registry with two CodeAdapters standing in for `airtable` and
 * `supabase` (same trick precedence.test.ts uses), seeded per source.
 */
function mergeRegistry(
  airtableRows: Record<string, unknown>[],
  supabaseRows: Record<string, unknown>[],
  sources: ("airtable" | "supabase")[] = ["airtable", "supabase"],
  writeTo?: "airtable" | "supabase",
): Registry {
  const airtableLike = new CodeAdapter({ fixtures: { items: airtableRows } });
  Object.defineProperty(airtableLike, "kind", { value: "airtable" });
  Object.defineProperty(airtableLike, "level", { value: "L2" });
  const supabaseLike = new CodeAdapter({ fixtures: { items: supabaseRows } });
  Object.defineProperty(supabaseLike, "kind", { value: "supabase" });
  Object.defineProperty(supabaseLike, "level", { value: "L3" });

  return new Registry()
    .register(itemContract)
    .useAdapter(airtableLike)
    .useAdapter(supabaseLike)
    .bindMerge("items", sources, writeTo);
}

describe("Tier B merge — resolution + binding plumbing", () => {
  it("resolve() returns ordered mergeSources + writeProvider (default = last source)", () => {
    const r = mergeRegistry([], []);
    const plan = r.resolve("items");
    expect(plan.baseTier).toBe("B");
    expect(plan.mergeSources).toEqual(["airtable", "supabase"]);
    expect(plan.base).toBe("supabase"); // last source = conflict winner.
    expect(plan.writeProvider).toBe("supabase"); // default write sink = last.
  });

  it("writeTo overrides the default write sink", () => {
    const r = mergeRegistry([], [], ["airtable", "supabase"], "airtable");
    expect(r.resolve("items").writeProvider).toBe("airtable");
  });

  it("isMergeBinding narrows the Tier-B merge variant", () => {
    expect(isMergeBinding({ tier: "B", merge: true, resource: "x", sources: ["code"] })).toBe(true);
    expect(isMergeBinding({ tier: "B", resource: "x", provider: "code" })).toBe(false);
    expect(isMergeBinding({ tier: "A", provider: "code" })).toBe(false);
  });

  it("rejects an empty source list, duplicate sources, and an out-of-set writeTo", () => {
    expect(() => mergeRegistry([], [], [])).toThrow(/needs ≥1 source/);
    expect(() => mergeRegistry([], [], ["airtable", "airtable"])).toThrow(/twice/);
    // writeTo not in sources:
    expect(() =>
      new Registry()
        .register(itemContract)
        .bind({ tier: "B", merge: true, resource: "items", sources: ["airtable"], writeTo: "supabase" }),
    ).toThrow(/writeTo="supabase" not in sources/);
  });

  it("a merge bind and a single-provider bind on the same resource are mutually exclusive (last wins)", () => {
    // merge → then single ⇒ single applies (no leftover mergeSources).
    const r1 = new Registry()
      .register(itemContract)
      .bindMerge("items", ["airtable", "supabase"])
      .bindResource("items", "airtable");
    const p1 = r1.resolve("items");
    expect(p1.base).toBe("airtable");
    expect(p1.mergeSources).toBeUndefined();

    // single → then merge ⇒ merge applies.
    const r2 = new Registry()
      .register(itemContract)
      .bindResource("items", "airtable")
      .bindMerge("items", ["airtable", "supabase"]);
    expect(r2.resolve("items").mergeSources).toEqual(["airtable", "supabase"]);
  });
});

describe("Tier B merge — union + dedup-by-key (the 5 + 10 → 11 case)", () => {
  it("UNION with NO shared keys ⇒ full count (5 + 10 = 15)", async () => {
    const airtable = Array.from({ length: 5 }, (_, i) => ({
      id: `at_${i}`,
      name: `airtable-${i}`,
      status: "from-airtable",
    }));
    const supabase = Array.from({ length: 10 }, (_, i) => ({
      id: `sb_${i}`,
      name: `supabase-${i}`,
      status: "from-supabase",
    }));
    const data = new Switchboard(mergeRegistry(airtable, supabase));
    const rows = await data.resource<Item>("items").list();
    expect(rows).toHaveLength(15); // disjoint keys ⇒ pure union.
  });

  it("DEDUP by key — Airtable 5 + Supabase 10 with 4 SHARED keys ⇒ 11 records", async () => {
    // Airtable: keys k0..k4 (5 rows).
    const airtable = Array.from({ length: 5 }, (_, i) => ({
      id: `k${i}`,
      name: `airtable-${i}`,
      status: "AT",
    }));
    // Supabase: 10 rows. Keys k1..k4 OVERLAP Airtable (4 shared); k5..k10 are new.
    const supabase = [
      ...[1, 2, 3, 4].map((i) => ({ id: `k${i}`, name: `supabase-${i}`, status: "SB" })),
      ...Array.from({ length: 6 }, (_, j) => ({ id: `k${j + 5}`, name: `supabase-${j + 5}`, status: "SB" })),
    ];
    expect(airtable).toHaveLength(5);
    expect(supabase).toHaveLength(10);

    const data = new Switchboard(mergeRegistry(airtable, supabase));
    const rows = await data.resource<Item>("items").list();

    // 15 union − 4 collapsed (k1..k4) = 11.
    expect(rows).toHaveLength(11);
    // Every key is unique in the merged set.
    const keys = rows.map((r) => r.id);
    expect(new Set(keys).size).toBe(11);
    // The 4 shared keys appear exactly once.
    for (const k of ["k1", "k2", "k3", "k4"]) {
      expect(rows.filter((r) => r.id === k)).toHaveLength(1);
    }
  });
});

describe("Tier B merge — field consolidation + last-source-wins on conflict", () => {
  it("CONSOLIDATE — a merged record unions fields from BOTH sources for one key", async () => {
    // Same key in both; each source carries a DIFFERENT field. The result is
    // one record carrying BOTH fields (some from Airtable, some from Supabase).
    const airtable = [{ id: "shared", name: "Curated name" /* note absent */ }];
    const supabase = [{ id: "shared", status: "active" /* name absent */, note: "db-note" }];
    const data = new Switchboard(mergeRegistry(airtable, supabase));
    const rows = await data.resource<Item>("items").list();

    expect(rows).toHaveLength(1);
    const rec = rows[0]!;
    expect(rec.id).toBe("shared");
    expect(rec.name).toBe("Curated name"); // only Airtable had it.
    expect(rec.status).toBe("active"); // only Supabase had it.
    expect(rec.note).toBe("db-note"); // only Supabase had it.
  });

  it("CONFLICT — same field in >1 source ⇒ LAST-listed source wins", async () => {
    // Both sources set `status` for key "x". sources=[airtable, supabase] ⇒
    // Supabase (last) wins; airtable provides `name` (no conflict).
    const airtable = [{ id: "x", name: "from-airtable", status: "AIRTABLE_STALE" }];
    const supabase = [{ id: "x", status: "SUPABASE_WINS" }];

    const supaWins = new Switchboard(mergeRegistry(airtable, supabase, ["airtable", "supabase"]));
    const r1 = (await supaWins.resource<Item>("items").list())[0]!;
    expect(r1.status).toBe("SUPABASE_WINS"); // last source wins the conflict.
    expect(r1.name).toBe("from-airtable"); // non-conflicting field preserved.

    // Reverse the order ⇒ Airtable now last ⇒ Airtable wins the same conflict.
    const airWins = new Switchboard(mergeRegistry(airtable, supabase, ["supabase", "airtable"]));
    const r2 = (await airWins.resource<Item>("items").list())[0]!;
    expect(r2.status).toBe("AIRTABLE_STALE");
  });

  it("a later source's UNDEFINED does not clobber an earlier real value", async () => {
    // Airtable sets status; Supabase row exists for the key but omits status.
    const airtable = [{ id: "x", name: "n", status: "kept" }];
    const supabase = [{ id: "x", note: "added" }]; // no status field.
    const data = new Switchboard(mergeRegistry(airtable, supabase, ["airtable", "supabase"]));
    const rec = (await data.resource<Item>("items").list())[0]!;
    expect(rec.status).toBe("kept"); // not clobbered by the absent later value.
    expect(rec.note).toBe("added");
  });

  it("get(key) consolidates the keyed record across sources (last wins)", async () => {
    const airtable = [{ id: "x", name: "AT-name", status: "AT" }];
    const supabase = [{ id: "x", status: "SB" }];
    const data = new Switchboard(mergeRegistry(airtable, supabase));
    const rec = await data.resource<Item>("items").get("x");
    expect(rec).toMatchObject({ id: "x", name: "AT-name", status: "SB" });
    // A key absent from every source ⇒ null.
    expect(await data.resource<Item>("items").get("nope")).toBeNull();
  });

  it("query(opts) merges the filtered survivors from each source", async () => {
    const airtable = [
      { id: "a", name: "A", status: "open" },
      { id: "b", name: "B", status: "closed" },
    ];
    const supabase = [
      { id: "b", name: "B", status: "open" }, // shares key b; flips it open.
      { id: "c", name: "C", status: "open" },
    ];
    const data = new Switchboard(mergeRegistry(airtable, supabase));
    const open = await data.resource<Item>("items").query({ where: { status: "open" } });
    // a (open, airtable) + b (open, supabase) + c (open, supabase) = 3, deduped.
    expect(open.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("Tier B merge — write routing (read-time merge ≠ write-to-all)", () => {
  it("writes route to the default sink (last source) and are readable via the merge", async () => {
    const reg = mergeRegistry([{ id: "k0", name: "seed", status: "AT" }], []);
    const data = new Switchboard(reg);

    const created = await data.resource<Item>("items").create({
      id: "new1",
      name: "Created",
      status: "open",
      note: "",
    });
    expect(created.name).toBe("Created");

    // Read-time merge surfaces both the Airtable seed and the new Supabase row.
    const rows = await data.resource<Item>("items").list();
    expect(rows.map((r) => r.id).sort()).toEqual(["k0", "new1"]);
  });

  it("writeTo redirects writes to the named source", async () => {
    const reg = mergeRegistry([], [], ["airtable", "supabase"], "airtable");
    const data = new Switchboard(reg);
    await data.resource<Item>("items").create({ id: "at1", name: "to-airtable", status: "", note: "" });
    const rows = await data.resource<Item>("items").list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "at1", name: "to-airtable" });
  });
});

describe("Tier B merge — real Airtable + Supabase adapters (network mocked)", () => {
  it("merges live-shaped Airtable (field-ID wire) + Supabase rows by key", async () => {
    // Reuse the worked-example field map but for a throwaway resource so the
    // adapters exercise their REAL translation seams (field IDs / query builder).
    const atMap = {
      table: "tblMERGEdemo000001",
      idField: "id",
      fields: { name: "fldNAME0000000001", status: "fldSTATUS00000001" },
    };
    const airtable = new AirtableAdapter({
      apiKey: "key-test",
      baseId: AIRTABLE_BASE_ID,
      maps: { items: atMap },
      ttlMs: 0,
      sleep: async () => {},
      fetch: makeAirtableFetch({
        [atMap.table]: [
          { id: "k1", fields: { [atMap.fields.name]: "Curated-1", [atMap.fields.status]: "AT" } },
          { id: "k2", fields: { [atMap.fields.name]: "Curated-2", [atMap.fields.status]: "AT" } },
        ],
      }),
    });

    const supabase = new SupabaseAdapter({
      client: new FakeSupabaseClient({
        items: [
          { id: "k2", status: "SB_WINS", note: "db-note" }, // shares k2 (conflict on status)
          { id: "k3", name: "DB-3", status: "SB" }, // new key
        ],
      }),
      maps: { items: { table: "items" } },
    });

    const registry = new Registry()
      .register(itemContract)
      .useAdapter(airtable)
      .useAdapter(supabase)
      .bindMerge("items", ["airtable", "supabase"]); // supabase last ⇒ wins conflicts.

    const rows = await new Switchboard(registry).resource<Item>("items").list();

    // k1 (AT only) + k2 (shared) + k3 (SB only) = 3 records.
    expect(rows).toHaveLength(3);
    const k2 = rows.find((r) => r.id === "k2")!;
    expect(k2.name).toBe("Curated-2"); // from Airtable (consolidated)
    expect(k2.status).toBe("SB_WINS"); // Supabase last ⇒ wins the conflict
    expect(k2.note).toBe("db-note"); // from Supabase (consolidated)
  });
});
