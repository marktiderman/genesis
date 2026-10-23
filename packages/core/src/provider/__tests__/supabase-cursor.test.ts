// @feat:supabase-provider
import { beforeEach, describe, expect, it } from "vitest";
import { createSupabaseProvider, keysetClauses, type SupabaseProviderOptions } from "../supabase-provider";
import { isDataReadError } from "../../schema/read-outcome";
import type { ListParams } from "../types";

// A stand-in client: each awaited query takes the next queued response, and
// every chained call is recorded.
type Response = { data: unknown; error: { message: string; code?: string } | null; count?: number };
let queue: Response[] = [];
let calls: { method: string; args: unknown[] }[] = [];

function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "range", "or", "is", "not", "gte", "lte"]) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b["then"] = (resolve: (r: Response) => unknown, reject?: (e: unknown) => unknown) => {
    const next = queue.shift();
    if (!next) return Promise.resolve().then(() => reject?.(new Error("no queued response")));
    return Promise.resolve(next).then(resolve);
  };
  return b;
}

const client = { from: () => builder() };
const provider = (options?: SupabaseProviderOptions) => createSupabaseProvider(client, options);
const callsOf = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

const rows = (...items: [string, string | null][]) => items.map(([id, title]) => ({ id, title }));

async function page(p: ReturnType<typeof provider>, params: ListParams, response: Response) {
  calls = [];
  queue.push(response);
  return p.getList("tasks", params);
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isDataReadError(error)) {
      expect(error.outcome).toBe("invalid");
      return String((error.cause as Error).message);
    }
    throw error;
  }
  throw new Error("expected a refusal");
}

beforeEach(() => {
  queue = [];
  calls = [];
});

describe("keysetClauses", () => {
  it("asc: later values, ties by key, then the nulls that sort last", () => {
    expect(keysetClauses({ s: "title", o: "asc", k: "id", v: "B", id: 2 })).toBe(
      'title.gt."B",and(title.eq."B",id.gt."2"),title.is.null',
    );
  });

  it("desc: earlier values and ties by key (nulls sorted first are behind)", () => {
    expect(keysetClauses({ s: "title", o: "desc", k: "id", v: "B", id: 2 })).toBe(
      'title.lt."B",and(title.eq."B",id.gt."2")',
    );
  });

  it("a null sort value: asc keeps only later nulls; desc adds every non-null", () => {
    expect(keysetClauses({ s: "title", o: "asc", k: "id", v: null, id: 7 })).toBe(
      'and(title.is.null,id.gt."7")',
    );
    expect(keysetClauses({ s: "title", o: "desc", k: "id", v: null, id: 7 })).toBe(
      'title.not.is.null,and(title.is.null,id.gt."7")',
    );
  });

  it("ordered by the key alone", () => {
    expect(keysetClauses({ s: null, o: "asc", k: "id", id: 5 })).toBe('id.gt."5"');
    expect(keysetClauses({ s: null, o: "desc", k: "id", id: 5 })).toBe('id.lt."5"');
  });

  it("quotes values so commas, dots, parens, quotes and backslashes stay literal", () => {
    expect(keysetClauses({ s: "name", o: "asc", k: "id", v: 'Acme, Inc. (the "best") \\o/', id: "a.b" })).toBe(
      'name.gt."Acme, Inc. (the \\"best\\") \\\\o/",and(name.eq."Acme, Inc. (the \\"best\\") \\\\o/",id.gt."a.b"),name.is.null',
    );
  });
});

describe("getList by cursor", () => {
  const sorted = (cursor: string | null, order: "asc" | "desc" = "asc"): ListParams => ({
    pagination: { page: 1, perPage: 2, cursor },
    sort: { field: "title", order },
  });

  it("first page: counts, orders by the sort then the key, asks for one extra row", async () => {
    const p = provider();
    const result = await page(p, sorted(null), { data: rows(["1", "A"], ["2", "B"], ["3", "B"]), error: null, count: 9 });
    expect(callsOf("select")[0]).toEqual(["*", { count: "exact" }]);
    expect(callsOf("order")).toEqual([
      ["title", { ascending: true, nullsFirst: false }],
      ["id", { ascending: true }],
    ]);
    expect(callsOf("range")).toEqual([[0, 2]]);
    expect(callsOf("or")).toEqual([]);
    expect(result.data).toEqual(rows(["1", "A"], ["2", "B"]));
    expect(result.total).toBe(9);
    expect(typeof result.nextCursor).toBe("string");
  });

  it("round trip: the next page starts after the last row, ties broken by the key, and isn't counted", async () => {
    const p = provider();
    const first = await page(p, sorted(null), { data: rows(["1", "A"], ["2", "B"], ["3", "B"]), error: null, count: 3 });
    const second = await page(p, sorted(first.nextCursor!), { data: rows(["3", "B"]), error: null });
    expect(callsOf("select")[0]).toEqual(["*"]);
    expect(callsOf("or")).toEqual([['title.gt."B",and(title.eq."B",id.gt."2"),title.is.null']]);
    expect(second.data).toEqual(rows(["3", "B"]));
    expect(second.total).toBe(-1);
    expect(second.nextCursor).toBeNull();
  });

  it("descending: nulls first, then the keyset after the last row", async () => {
    const p = provider();
    const first = await page(p, sorted(null, "desc"), { data: rows(["1", null], ["4", "Z"], ["2", "Y"]), error: null, count: 3 });
    expect(callsOf("order")[0]).toEqual(["title", { ascending: false, nullsFirst: true }]);
    await page(p, sorted(first.nextCursor!, "desc"), { data: [], error: null });
    expect(callsOf("or")).toEqual([['title.lt."Z",and(title.eq."Z",id.gt."4")']]);
  });

  it("a page ending on a null sort value continues correctly", async () => {
    const p = provider();
    const first = await page(p, sorted(null), { data: rows(["1", "A"], ["5", null], ["6", null]), error: null, count: 3 });
    await page(p, sorted(first.nextCursor!), { data: [], error: null });
    expect(callsOf("or")).toEqual([['and(title.is.null,id.gt."5")']]);
  });

  it("without a sort, pages by the key (or orderKey) alone", async () => {
    const p = provider({ resources: { tasks: { orderKey: "slug" } } });
    const first = await page(p, { pagination: { page: 1, perPage: 1, cursor: null } }, {
      data: [{ id: 1, slug: "a" }, { id: 2, slug: "b" }],
      error: null,
      count: 2,
    });
    expect(callsOf("order")).toEqual([["slug", { ascending: true }]]);
    await page(p, { pagination: { page: 1, perPage: 1, cursor: first.nextCursor! } }, { data: [], error: null });
    expect(callsOf("or")).toEqual([['slug.gt."a"']]);
  });

  it("nests a search and the keyset so both must hold", async () => {
    const p = provider();
    const params = (cursor: string | null): ListParams => ({
      ...sorted(cursor),
      search: { query: "x", fields: ["title"] },
    });
    const first = await page(p, params(null), { data: rows(["1", "A"], ["2", "B"], ["3", "C"]), error: null, count: 3 });
    expect(callsOf("or")).toEqual([["title.ilike.%x%"]]);
    await page(p, params(first.nextCursor!), { data: [], error: null });
    expect(callsOf("or")).toEqual([
      ['and(or(title.ilike.%x%),or(title.gt."B",and(title.eq."B",id.gt."2"),title.is.null))'],
    ]);
  });

  it("refuses a cursor made for another sort", async () => {
    const p = provider();
    const first = await page(p, sorted(null), { data: rows(["1", "A"], ["2", "B"], ["3", "C"]), error: null, count: 3 });
    const why = await refusal(p.getList("tasks", sorted(first.nextCursor!, "desc")));
    expect(why).toMatch(/different sort/);
  });

  it("refuses a cursor it didn't make", async () => {
    expect(await refusal(provider().getList("tasks", sorted("not-a-cursor")))).toMatch(/not one this provider made/);
  });

  it("refuses when there is no key to break ties (orderKey: false)", async () => {
    const p = provider({ resources: { tasks: { orderKey: false } } });
    expect(await refusal(p.getList("tasks", sorted(null)))).toMatch(/orderKey is false/);
    expect((await p.capabilities!("tasks")).cursorPagination).toBe(false);
    expect((await provider().capabilities!("tasks")).cursorPagination).toBe(true);
  });

  it("refuses a sort on an embedded field", async () => {
    const why = await refusal(
      provider().getList("tasks", { pagination: { page: 1, perPage: 2, cursor: null }, sort: { field: "author.name", order: "asc" } }),
    );
    expect(why).toMatch(/plain column/);
  });

  it("refuses when the selected columns leave out the sort column", async () => {
    const p = provider();
    queue.push({ data: [{ id: "1" }, { id: "2" }, { id: "3" }], error: null, count: 3 });
    expect(await refusal(p.getList("tasks", { ...sorted(null), select: "id" }))).toMatch(/must include/);
  });

  it("still refuses more than maxPerPage", async () => {
    const p = provider({ maxPerPage: 1 });
    expect(await refusal(p.getList("tasks", sorted(null)))).toMatch(/maxPerPage/);
  });

  it("offset paging is unchanged when no cursor is given", async () => {
    const p = provider();
    await page(p, { pagination: { page: 2, perPage: 2 }, sort: { field: "title", order: "asc" } }, {
      data: [],
      error: null,
      count: 0,
    });
    expect(callsOf("range")).toEqual([[2, 3]]);
    expect(callsOf("order")[0]).toEqual(["title", { ascending: true }]);
  });
});
