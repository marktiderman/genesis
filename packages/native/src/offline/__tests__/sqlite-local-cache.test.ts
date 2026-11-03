// @feat:data-offline
// sqliteLocalCache against a real SQLite (node:sqlite), behind expo-sqlite's async API.
import { createRequire } from "node:module";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { cacheScope, persistOffline } from "@marktiderman/genesis-core/offline";
import { sqliteLocalCache, type SQLiteDatabaseLike } from "../sqlite-local-cache";

// Loaded at run time: the test bundler can't bundle a Node built-in.
type Sync = { exec(sql: string): void; prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] } };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Sync };

/** expo-sqlite's async surface over node:sqlite. */
function expoLike(): SQLiteDatabaseLike {
  const db = new DatabaseSync(":memory:");
  const api: SQLiteDatabaseLike = {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql, params) => db.prepare(sql).run(...params),
    getAllAsync: async <T,>(sql: string, params: (string | number | null)[]) => db.prepare(sql).all(...params) as T[],
    withExclusiveTransactionAsync: async (task) => {
      db.exec("begin exclusive");
      try {
        await task(api);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
    },
  };
  return api;
}

const A = "u:ana|org:acme";
const query = (key: string) => ({ key, queryKey: ["tasks", "list", { key }], resource: "tasks", data: { data: [{ $row: "1" }] }, fetchedAt: 1 });

describe("sqliteLocalCache", () => {
  it("stores rows once, replaces a row with the newer read, and reads queries back", async () => {
    const cache = sqliteLocalCache({ db: expoLike() });
    await cache.write(A, [
      { kind: "row", row: { resource: "tasks", id: "1", row: { id: 1, title: "One", notes: "n" }, fetchedAt: 1 } },
      { kind: "query", query: query("q1") },
    ]);
    await cache.write(A, [{ kind: "row", row: { resource: "tasks", id: "1", row: { id: 1, title: "Two" }, fetchedAt: 2 } }]);
    expect(await cache.readRows(A, "tasks", ["1", "9"])).toEqual([{ resource: "tasks", id: "1", row: { id: 1, title: "Two" }, fetchedAt: 2 }]);
    expect(await cache.readQueries(A)).toEqual([query("q1")]);
  });

  it("drops a row, and prunes the rows of a resource that aren't kept", async () => {
    const cache = sqliteLocalCache({ db: expoLike() });
    const row = (resource: string, id: string) => ({ kind: "row" as const, row: { resource, id, row: { id }, fetchedAt: 1 } });
    await cache.write(A, [row("tasks", "1"), row("tasks", "2"), row("tasks", "3"), row("people", "1")]);
    await cache.write(A, [{ kind: "drop", resource: "tasks", id: "1" }, { kind: "prune", resource: "tasks", keep: ["3"] }]);
    expect((await cache.readRows(A, "tasks", ["1", "2", "3"])).map((r) => r.id)).toEqual(["3"]);
    expect(await cache.readRows(A, "people", ["1"])).toHaveLength(1);
  });

  it("rolls a failed write back whole", async () => {
    const db = expoLike();
    const cache = sqliteLocalCache({ db });
    await cache.write(A, [{ kind: "query", query: query("q1") }]);
    const bad = { ...query("q2"), queryKey: [BigInt(1)] as unknown as unknown[] }; // JSON.stringify throws on a bigint
    await expect(cache.write(A, [{ kind: "forget", key: "q1" }, { kind: "query", query: bad }])).rejects.toThrow();
    expect((await cache.readQueries(A)).map((q) => q.key)).toEqual(["q1"]);
  });

  it("keeps scopes apart, refuses one without a person, and clears by person exactly", async () => {
    const cache = sqliteLocalCache({ db: expoLike() });
    await cache.write(A, [{ kind: "query", query: query("q1") }]);
    await cache.write("u:a_a|none", [{ kind: "query", query: query("q1") }]);
    await cache.write("u:abba|none", [{ kind: "query", query: query("q1") }]);
    expect(await cache.readQueries("u:ana|none")).toEqual([]);
    await expect(cache.readQueries("org:acme")).rejects.toThrow(/cache scope/);
    // "_" is a LIKE wildcard: clearing "a_a" mustn't clear "abba".
    await cache.clear({ user: "a_a" });
    expect(await cache.readQueries("u:a_a|none")).toEqual([]);
    expect(await cache.readQueries("u:abba|none")).toHaveLength(1);
    await cache.clear({ scope: A });
    expect(await cache.readQueries(A)).toEqual([]);
    await cache.clear();
    expect(await cache.readQueries("u:abba|none")).toEqual([]);
  });

  it("reads many rows in chunks", async () => {
    const cache = sqliteLocalCache({ db: expoLike() });
    const ids = Array.from({ length: 1200 }, (_, i) => String(i));
    await cache.write(A, ids.map((id) => ({ kind: "row" as const, row: { resource: "tasks", id, row: { id }, fetchedAt: 1 } })));
    expect(await cache.readRows(A, "tasks", ids)).toHaveLength(1200);
  });

  it("restores a list into a fresh QueryClient through persistOffline", async () => {
    const cache = sqliteLocalCache({ db: expoLike() });
    const key = ["tasks", "list", {}];
    const first = new QueryClient();
    const p1 = persistOffline({ cache, resources: ["tasks"], buster: "v1", throttleMs: 0 })(first);
    await p1.restore("ana");
    const stop = p1.subscribe("ana");
    await first.fetchQuery({ queryKey: key, queryFn: async () => ({ data: [{ id: 1, title: "One" }], total: 1 }) });
    await new Promise((r) => setTimeout(r, 10));
    stop();
    const next = new QueryClient();
    await persistOffline({ cache, resources: ["tasks"], buster: "v1" })(next).restore(cacheScope("ana"));
    expect(next.getQueryData(key)).toEqual({ data: [{ id: 1, title: "One" }], total: 1 });
  });
});
