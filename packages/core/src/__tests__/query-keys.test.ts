import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { defineQueryKeys, resourceKeys } from "../query-keys";

const worksheetKeys = defineQueryKeys("worksheet-items", {
  lessonParts: (people: string[]) => ({ people: [...people].sort() }),
  byEntry: (entryId: string) => ({ entryId }),
  mine: () => ({}),
});

/** A client holding `keys`, and which of them an invalidation marks stale. */
async function staleAfter(keys: readonly (readonly unknown[])[], run: (client: QueryClient) => Promise<void>) {
  const client = new QueryClient();
  for (const key of keys) await client.fetchQuery({ queryKey: key, queryFn: () => 1, staleTime: Infinity });
  await run(client);
  const stale = keys.filter((key) => client.getQueryState(key)?.isInvalidated).map((k) => JSON.stringify(k));
  client.clear();
  return stale;
}

describe("defineQueryKeys", () => {
  const ann = worksheetKeys.for({ viewer: "ann" });
  const bob = worksheetKeys.for({ viewer: "bob", group: "g1", day: "2026-10-26" });

  it("builds [domain, kind, fields] with the scope in the fields", () => {
    expect(ann.lessonParts(["p2", "p1"])).toEqual(["worksheet-items", "lessonParts", { people: ["p1", "p2"], viewer: "ann" }]);
    expect(bob.byEntry("e1")).toEqual([
      "worksheet-items",
      "byEntry",
      { entryId: "e1", viewer: "bob", group: "g1", day: "2026-10-26" },
    ]);
    expect(worksheetKeys.for({ viewer: null }).mine()).toEqual(["worksheet-items", "mine", { viewer: null }]);
  });

  it("keeps scopes apart: the scope is part of the key", () => {
    const p1 = worksheetKeys.for({ viewer: "ann", scope: { orgId: "p1" } }).mine();
    const p2 = worksheetKeys.for({ viewer: "ann", scope: { orgId: "p2" } }).mine();
    expect(p1).not.toEqual(p2);
    expect(p1[2]).toEqual({ viewer: "ann", scope: { orgId: "p1" } });
    // An empty scope adds nothing, and key order inside it doesn't matter to the cache.
    expect(worksheetKeys.for({ viewer: "ann", scope: {} }).mine()).toEqual(ann.mine());
    const client = new QueryClient();
    client.setQueryData(worksheetKeys.for({ viewer: "ann", scope: { orgId: "p1", personId: "x" } }).mine(), 1);
    expect(client.getQueryData(worksheetKeys.for({ viewer: "ann", scope: { personId: "x", orgId: "p1" } }).mine())).toBe(1);
    client.clear();
  });

  it("keeps viewers apart", () => {
    expect(ann.mine()).not.toEqual(worksheetKeys.for({ viewer: "bob" }).mine());
  });

  it("needs a viewer, and keeps scope fields for the scope", () => {
    expect(() => worksheetKeys.for({} as never)).toThrow(/scope with a viewer/);
    const bad = defineQueryKeys("x", { q: () => ({ viewer: "someone-else" }) });
    expect(() => bad.for({ viewer: "ann" }).q()).toThrow(/scope's/);
    expect(() => defineQueryKeys("x", { all: () => ({}) })).toThrow(/query named "all"/);
  });

  it("invalidates by domain and by kind with plain prefixes", async () => {
    const keys = [ann.lessonParts(["p1"]), ann.byEntry("e1"), resourceKeys("tasks").list({})];
    expect(await staleAfter(keys, (c) => c.invalidateQueries({ queryKey: worksheetKeys.all }))).toEqual(
      [keys[0], keys[1]].map((k) => JSON.stringify(k)),
    );
    expect(await staleAfter(keys, (c) => c.invalidateQueries({ queryKey: worksheetKeys.lessonParts.all }))).toEqual([
      JSON.stringify(keys[0]),
    ]);
  });

  it("where() reaches one person inside multi-person keys", async () => {
    const keys = [ann.lessonParts(["p1", "p2"]), ann.lessonParts(["p3"]), bob.lessonParts(["p2"]), ann.byEntry("p2")];
    const stale = await staleAfter(keys, (c) => c.invalidateQueries(worksheetKeys.where({ people: "p2" })));
    expect(stale).toEqual([keys[0], keys[2]].map((k) => JSON.stringify(k)));
  });

  it("where() narrows by kind, viewer, group and day", async () => {
    const keys = [ann.lessonParts(["p1"]), ann.byEntry("e1"), bob.byEntry("e1")];
    expect(await staleAfter(keys, (c) => c.invalidateQueries(worksheetKeys.where({ viewer: "ann" })))).toEqual(
      [keys[0], keys[1]].map((k) => JSON.stringify(k)),
    );
    expect(await staleAfter(keys, (c) => c.invalidateQueries(worksheetKeys.where({ day: "2026-10-26" }, "byEntry")))).toEqual(
      [JSON.stringify(keys[2])],
    );
    expect(await staleAfter(keys, (c) => c.invalidateQueries(worksheetKeys.where({ entryId: "nope" })))).toEqual([]);
  });
});

describe("where() matching", () => {
  const k = defineQueryKeys("items", {
    one: (n: number) => ({ n }),
    tagged: (tags: string[], meta: Record<string, unknown>) => ({ tags, meta, kind: "x" }),
  });
  const ann = k.for({ viewer: "ann" });

  it("matches numbers and their text, objects in any key order, and array subsets", async () => {
    const keys = [ann.one(1), ann.tagged(["a", "b", "c"], { x: 1, y: 2 })];
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ n: "1" })))).toEqual([JSON.stringify(keys[0])]);
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ meta: { y: 2, x: 1 } })))).toEqual([JSON.stringify(keys[1])]);
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ tags: ["c", "a"] })))).toEqual([JSON.stringify(keys[1])]);
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ tags: ["a", "z"] })))).toEqual([]);
  });

  it("can match a field named kind", async () => {
    const keys = [ann.tagged([], {}), ann.one(2)];
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ kind: "x" })))).toEqual([JSON.stringify(keys[0])]);
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ kind: "x" }, "one")))).toEqual([]);
  });

  it("an empty list or an undefined value only matches itself", async () => {
    const keys = [ann.tagged(["a"], {}), ann.tagged([], {}), ann.one(1)];
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ tags: [] })))).toEqual([JSON.stringify(keys[1])]);
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ missing: undefined })))).toEqual([]);
  });

  it("never matches a substring", async () => {
    const keys = [ann.tagged(["abc"], {})];
    expect(await staleAfter(keys, (c) => c.invalidateQueries(k.where({ tags: "ab" })))).toEqual([]);
  });
});
