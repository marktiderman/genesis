// @feat:supabase-provider
import { beforeEach, describe, expect, it } from "vitest";
import { isDataReadError } from "../../schema/read-outcome";
import { createSupabaseProvider, type SupabaseProviderOptions } from "../supabase-provider";

// A stand-in client recording every call, answering each awaited query from a queue.
type Response = { data: unknown; error: { message: string; code?: string } | null; count?: number };
let queue: Response[] = [];
let calls: { method: string; args: unknown[] }[] = [];

function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const m of ["update", "insert", "delete", "select", "eq", "in", "order", "range", "single", "or", "ilike", "gt"]) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b["then"] = (resolve: (r: Response) => unknown) => Promise.resolve(queue.shift() ?? { data: [], error: null }).then(resolve);
  return b;
}

const client = {
  from: (table: string) => {
    calls.push({ method: "from", args: [table] });
    return builder();
  },
  rpc: (fn: string, args?: Record<string, unknown>, options?: unknown) => {
    calls.push({ method: "rpc", args: [fn, args, options] });
    return builder();
  },
};

const provider = (options: SupabaseProviderOptions) => createSupabaseProvider(client, options);
const call = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

beforeEach(() => {
  queue = [];
  calls = [];
});

describe("resource source", () => {
  it("reads lists, records and many from a view, and writes to the table", async () => {
    const p = provider({ resources: { tasks: { source: "tasks_with_people" } } });
    queue.push({ data: [{ id: "t1" }], error: null, count: 1 });
    expect(await p.getList("tasks", { pagination: { page: 1, perPage: 10 } })).toEqual({ data: [{ id: "t1" }], total: 1 });
    queue.push({ data: { id: "t1" }, error: null });
    await p.getOne("tasks", { id: "t1" });
    queue.push({ data: [{ id: "t1" }], error: null });
    await p.getMany("tasks", { ids: ["t1"] });
    expect(call("from")).toEqual([["tasks_with_people"], ["tasks_with_people"], ["tasks_with_people"]]);

    // An update writes only the table's own columns: the view's joined ones stay behind.
    calls = [];
    queue.push({ data: [{ id: "t1", title: "a" }], error: null }); // the table's row
    queue.push({ data: [{ id: "t1", title: "x" }], error: null }); // the update
    await p.update("tasks", { id: "t1", data: { title: "x", person_name: "Ann", comment_count: 3 } });
    expect(call("from").every(([t]) => t === "tasks")).toBe(true);
    expect(call("update")).toEqual([[{ title: "x" }]]);
  });

  it("writeColumns limits creates and updates to the table's columns", async () => {
    const p = provider({ resources: { tasks: { source: "tasks_with_people", writeColumns: ["title", "status"] } } });
    queue.push({ data: { id: "t2", title: "n" }, error: null });
    await p.create("tasks", { data: { title: "n", person_name: "Ann" } });
    queue.push({ data: [{ id: "t2", title: "m" }], error: null });
    await p.update("tasks", { id: "t2", data: { title: "m", comment_count: 1 } });
    expect(call("insert")).toEqual([[{ title: "n" }]]);
    expect(call("update")).toEqual([[{ title: "m" }]]);
  });

  it("a view with no id column lists without the key order instead of failing", async () => {
    const p = provider({ resources: { stats: { source: "practice_stats" } } });
    queue.push({ data: null, error: { code: "42703", message: "column practice_stats.id does not exist" } });
    queue.push({ data: [{ practice: "a", n: 2 }], error: null, count: 1 });
    expect((await p.getList("stats", { pagination: { page: 1, perPage: 10 } })).data).toEqual([{ practice: "a", n: 2 }]);
  });

  it("reads from a set-returning function, keeping filters, search, sort, paging and the total", async () => {
    let group = "g1";
    const p = provider({
      resources: { progress: { source: { rpc: "group_progress", args: () => ({ group_id: group }) }, searchFields: ["name"] } },
    });
    queue.push({ data: [{ id: "p1" }], error: null, count: 7 });
    const page = await p.getList("progress", {
      pagination: { page: 2, perPage: 5 },
      sort: { field: "name", order: "asc" },
      filters: [{ field: "done", operator: "gt", value: 2 }],
      search: { query: "ann", fields: ["name"] },
    });
    expect(page.total).toBe(7);
    expect(call("rpc")).toEqual([["group_progress", { group_id: "g1" }, { count: "exact" }]]);
    expect(call("select")).toEqual([["*"]]);
    expect(call("gt")).toEqual([["done", 2]]);
    expect(call("or")[0]![0]).toContain("name.ilike");
    expect(call("range")).toEqual([[5, 9]]);

    // The arguments are read on each request.
    group = "g2";
    calls = [];
    queue.push({ data: { id: "p1" }, error: null });
    await p.getOne("progress", { id: "p1" });
    expect(call("rpc")).toEqual([["group_progress", { group_id: "g2" }, undefined]]);
    expect(call("eq")).toEqual([["id", "p1"]]);
  });

  it("uses the resource's default columns unless the caller names some", async () => {
    const p = provider({ resources: { tasks: { select: "*, person:people(full_name)" } } });
    queue.push({ data: [], error: null, count: 0 });
    await p.getList("tasks", {});
    queue.push({ data: { id: "t1" }, error: null });
    await p.getOne("tasks", { id: "t1", select: "id" });
    expect(call("select")).toEqual([["*, person:people(full_name)", { count: "exact" }], ["id"]]);
  });

  it("says so when a function source has no rpc on the client", async () => {
    const p = createSupabaseProvider({ from: client.from }, { resources: { progress: { source: { rpc: "group_progress" } } } });
    const error = await p.getList("progress", {}).catch((e: unknown) => e);
    expect(isDataReadError(error)).toBe(true);
    expect((error as Error).message).toMatch(/no rpc/);
  });

  it("counts exactly by default, or as the resource or the caller asks", async () => {
    const p = provider({ resources: { big: { count: "estimated" }, quiet: { count: "none" } } });
    queue.push({ data: [], error: null, count: 3 });
    expect(await p.getList("tasks", {})).toEqual({ data: [], total: 3 });
    queue.push({ data: [], error: null, count: 90000 });
    expect(await p.getList("big", {})).toEqual({ data: [], total: 90000, totalIsEstimate: true });
    queue.push({ data: [], error: null, count: null as never });
    expect(await p.getList("quiet", {})).toEqual({ data: [], total: -1 });
    queue.push({ data: [], error: null, count: 5 });
    expect((await p.getList("big", { count: "exact" })).totalIsEstimate).toBeUndefined();
    expect(call("select")).toEqual([
      ["*", { count: "exact" }],
      ["*", { count: "estimated" }],
      ["*"],
      ["*", { count: "exact" }],
    ]);
  });

  it("a function source counts as asked too", async () => {
    const p = provider({ resources: { progress: { source: { rpc: "group_progress" }, count: "planned" } } });
    queue.push({ data: [], error: null, count: 12 });
    expect(await p.getList("progress", {})).toEqual({ data: [], total: 12, totalIsEstimate: true });
    expect(call("rpc")).toEqual([["group_progress", {}, { count: "planned" }]]);
  });
});
