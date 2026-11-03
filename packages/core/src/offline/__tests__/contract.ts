// The LocalCache contract, as cases any adapter must pass. Not a test file itself: each
// adapter's test calls `localCacheContract(make)`.
import { expect, it } from "vitest";
import type { LocalCache, StoredQuery } from "../types";

const A = "u:ana|org:acme";
const A2 = "u:ana|none";
const B = "u:ben|org:acme";

const query = (key: string, resource = "tasks", data: unknown = { data: [{ $row: "1" }], total: 1 }): StoredQuery => ({
  key,
  queryKey: [resource, "list", { key }],
  resource,
  data,
  fetchedAt: 1000,
});

export function localCacheContract(make: () => LocalCache): void {
  it("stores rows once and queries by key, and reads them back by scope", async () => {
    const cache = make();
    await cache.write(A, [
      { kind: "row", row: { resource: "tasks", id: "1", row: { id: 1, title: "One" }, fetchedAt: 1000 } },
      { kind: "query", query: query("q1") },
    ]);
    expect((await cache.readQueries(A)).map((q) => q.key)).toEqual(["q1"]);
    expect(await cache.readRows(A, "tasks", ["1", "2"])).toEqual([{ resource: "tasks", id: "1", row: { id: 1, title: "One" }, fetchedAt: 1000 }]);
  });

  it("merges a narrower read into the stored row instead of dropping fields", async () => {
    const cache = make();
    await cache.write(A, [{ kind: "row", row: { resource: "tasks", id: "1", row: { id: 1, title: "One", notes: "n" }, fetchedAt: 1 } }]);
    await cache.write(A, [{ kind: "row", row: { resource: "tasks", id: "1", row: { id: 1, title: "Two" }, fetchedAt: 2 } }]);
    const [row] = await cache.readRows(A, "tasks", ["1"]);
    expect(row?.row).toEqual({ id: 1, title: "Two", notes: "n" });
    expect(row?.fetchedAt).toBe(2);
  });

  it("keeps scopes apart: another person's, or the same person's other workspace", async () => {
    const cache = make();
    await cache.write(A, [{ kind: "query", query: query("q1") }]);
    expect(await cache.readQueries(A2)).toEqual([]);
    expect(await cache.readQueries(B)).toEqual([]);
  });

  it("refuses a scope that doesn't belong to a person", async () => {
    const cache = make();
    await expect(cache.write("org:acme", [{ kind: "query", query: query("q1") }])).rejects.toThrow(/cache scope/);
    await expect(cache.readQueries("none")).rejects.toThrow(/cache scope/);
  });

  it("forgets a query, and replaces one written again under its key", async () => {
    const cache = make();
    await cache.write(A, [{ kind: "query", query: query("q1") }, { kind: "query", query: query("q2") }]);
    await cache.write(A, [{ kind: "forget", key: "q1" }, { kind: "query", query: { ...query("q2"), fetchedAt: 5 } }]);
    const left = await cache.readQueries(A);
    expect(left.map((q) => [q.key, q.fetchedAt])).toEqual([["q2", 5]]);
  });

  it("clears one scope, every scope of one person, or everything", async () => {
    const cache = make();
    for (const scope of [A, A2, B]) await cache.write(scope, [{ kind: "query", query: query("q1") }]);
    await cache.clear({ scope: A });
    expect(await cache.readQueries(A)).toEqual([]);
    expect(await cache.readQueries(A2)).toHaveLength(1);
    await cache.write(A, [{ kind: "query", query: query("q1") }]);
    await cache.clear({ user: "ana" });
    expect(await cache.readQueries(A)).toEqual([]);
    expect(await cache.readQueries(A2)).toEqual([]);
    expect(await cache.readQueries(B)).toHaveLength(1);
    await cache.clear();
    expect(await cache.readQueries(B)).toEqual([]);
  });

  it("clearing a person doesn't touch another whose id starts the same", async () => {
    const cache = make();
    await cache.write("u:an|none", [{ kind: "query", query: query("q1") }]);
    await cache.write(A, [{ kind: "query", query: query("q1") }]);
    await cache.clear({ user: "an" });
    expect(await cache.readQueries(A)).toHaveLength(1);
  });
}
