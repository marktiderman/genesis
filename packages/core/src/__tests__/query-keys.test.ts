import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { viewerChanged } from "../hooks/use-viewer-cache";
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
    expect(await staleAfter(keys, (c) => c.invalidateQueries(worksheetKeys.where({ kind: "byEntry", day: "2026-10-26" })))).toEqual(
      [JSON.stringify(keys[2])],
    );
    expect(await staleAfter(keys, (c) => c.invalidateQueries(worksheetKeys.where({ entryId: "nope" })))).toEqual([]);
  });
});

describe("resourceKeys", () => {
  it("matches the keys useResource, useOne and useInfiniteResource cache under", () => {
    const k = resourceKeys("tasks");
    expect(k.all).toEqual(["tasks"]);
    expect(k.list({ pagination: { page: 1, perPage: 25 } })).toEqual(["tasks", "list", { pagination: { page: 1, perPage: 25 } }]);
    expect(k.detail("t1")).toEqual(["tasks", "detail", "t1", undefined]);
    expect(k.infinite({})).toEqual(["tasks", "infinite", {}]);
  });
});

describe("viewerChanged", () => {
  it.each([
    [undefined, "ann", false],
    [undefined, null, false],
    ["ann", "ann", false],
    [null, null, false],
    ["ann", null, true],
    ["ann", "bob", true],
    [null, "bob", true],
    ["ann", undefined, true],
  ] as const)("%s → %s clears: %s", (a, b, clears) => expect(viewerChanged(a, b)).toBe(clears));
});
