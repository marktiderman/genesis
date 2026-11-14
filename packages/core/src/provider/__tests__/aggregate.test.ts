// @feat:widgets
/**
 * Totals over a list: a provider's own aggregate, and the fallback through getList.
 */
import { describe, expect, it, vi } from "vitest";
import { aggregateProblems, resolveAggregate, toAggregateValues } from "../aggregate";
import { createMockProvider } from "../mock-provider";
import { createSupabaseProvider } from "../supabase-provider";
import { isDataReadError } from "../../schema/read-outcome";
import type { DataProvider, ListParams } from "../types";

const deals = [
  { id: "1", stage: "open", amount: 100 },
  { id: "2", stage: "open", amount: "250.5" },
  { id: "3", stage: "won", amount: 400 },
  { id: "4", stage: "open", amount: null },
];

describe("toAggregateValues", () => {
  it("counts every row and totals only rows with a number, as SQL does", () => {
    expect(
      toAggregateValues(deals, {
        n: { fn: "count" },
        sum: { fn: "sum", field: "amount" },
        avg: { fn: "avg", field: "amount" },
        min: { fn: "min", field: "amount" },
        max: { fn: "max", field: "amount" },
      }),
    ).toEqual({ n: 4, sum: 750.5, avg: 750.5 / 3, min: 100, max: 400 });
  });

  it("is null for a total over no numbers, and 0 for a count of none", () => {
    expect(toAggregateValues([], { n: { fn: "count" }, s: { fn: "sum", field: "amount" } })).toEqual({ n: 0, s: null });
  });
});

describe("aggregateProblems", () => {
  it("names a missing metric list, an unknown function and a missing field", () => {
    expect(aggregateProblems({ metrics: {} })).toEqual(["metrics: at least one"]);
    expect(aggregateProblems({ metrics: { x: { fn: "median" as "sum", field: "a" } } })[0]).toMatch(/one of count/);
    expect(aggregateProblems({ metrics: { x: { fn: "sum", field: "" } } })[0]).toMatch(/numeric field/);
  });
});

describe("the mock provider's aggregate", () => {
  it("totals the rows its filters would list", async () => {
    const provider = createMockProvider({ deals });
    const result = await provider.aggregate!("deals", {
      metrics: { open: { fn: "count" }, value: { fn: "sum", field: "amount" } },
      filters: [{ field: "stage", operator: "eq", value: "open" }],
    });
    expect(result.values).toEqual({ open: 3, value: 350.5 });
  });
});

/** A provider with getList only: the fallback's path. */
function listOnly(rows: Record<string, unknown>[]): DataProvider & { calls: ListParams[] } {
  const mock = createMockProvider({ deals: rows });
  const calls: ListParams[] = [];
  return {
    calls,
    getList: (resource, params) => {
      calls.push(params);
      return mock.getList(resource, params);
    },
    getOne: mock.getOne,
    getMany: mock.getMany,
    create: mock.create,
    update: mock.update,
    deleteOne: mock.deleteOne,
  };
}

describe("resolveAggregate", () => {
  it("uses the provider's aggregate when it has one", async () => {
    const provider = createMockProvider({ deals });
    const spy = vi.spyOn(provider, "aggregate");
    await resolveAggregate(provider, "deals", { metrics: { n: { fn: "count" } } });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("counts from getList's total, reading one row", async () => {
    const provider = listOnly(deals);
    const result = await resolveAggregate(provider, "deals", { metrics: { n: { fn: "count" } } });
    expect(result.values).toEqual({ n: 4 });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.pagination).toEqual({ page: 1, perPage: 1 });
  });

  it("totals other metrics from the rows, paged", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i), amount: i }));
    const provider = listOnly(rows);
    const result = await resolveAggregate(provider, "deals", { metrics: { s: { fn: "sum", field: "amount" } } }, { pageSize: 10 });
    expect(result.values).toEqual({ s: 300 });
    expect(provider.calls.map((c) => c.pagination?.page)).toEqual([1, 2, 3]);
  });

  it("refuses rather than leave rows out past maxRows", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), amount: i }));
    const error = await resolveAggregate(listOnly(rows), "deals", { metrics: { s: { fn: "sum", field: "amount" } } }, { pageSize: 10, maxRows: 15 }).catch((e: unknown) => e);
    expect(isDataReadError(error)).toBe(true);
  });

  it("refuses a request that isn't sound", async () => {
    const error = await resolveAggregate(listOnly(deals), "deals", { metrics: {} }).catch((e: unknown) => e);
    expect(isDataReadError(error) && error.outcome).toBe("invalid");
  });
});

/** A fake PostgREST builder that records the calls and answers with `answer`. */
function fakeClient(answer: (calls: [string, unknown[]][]) => { data?: unknown; count?: number | null; error?: unknown }) {
  const queries: [string, unknown[]][][] = [];
  const builder = (calls: [string, unknown[]][]): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const result = { data: null, error: null, ...answer(calls) };
            return (resolve: (v: unknown) => unknown) => resolve(result);
          }
          return (...args: unknown[]) => {
            calls.push([prop, args]);
            return builder(calls);
          };
        },
      },
    );
  return {
    queries,
    client: {
      from: (table: string) => {
        const calls: [string, unknown[]][] = [["from", [table]]];
        queries.push(calls);
        return builder(calls);
      },
    },
  };
}

describe("the Supabase provider's aggregate", () => {
  it("counts in the database, under the same filters", async () => {
    const { client, queries } = fakeClient(() => ({ count: 7 }));
    const provider = createSupabaseProvider(client as never);
    const result = await provider.aggregate!("deals", {
      metrics: { n: { fn: "count" } },
      filters: [{ field: "stage", operator: "eq", value: "open" }],
    });
    expect(result).toEqual({ values: { n: 7 } });
    const calls = queries[0]!;
    expect(calls).toContainEqual(["select", ["*", { count: "exact" }]]);
    expect(calls).toContainEqual(["eq", ["stage", "open"]]);
  });

  it("uses PostgREST's aggregate functions when they're on", async () => {
    const { client, queries } = fakeClient(() => ({ data: [{ value: "1250.50" }] }));
    const provider = createSupabaseProvider(client as never, { aggregateFunctions: true });
    const result = await provider.aggregate!("deals", { metrics: { value: { fn: "sum", field: "amount" } } });
    expect(result.values).toEqual({ value: 1250.5 });
    expect(queries[0]).toContainEqual(["select", ["value:amount.sum()"]]);
  });

  it("refuses a metric name or field that isn't a plain column name", async () => {
    const { client } = fakeClient(() => ({ data: [{}] }));
    const provider = createSupabaseProvider(client as never, { aggregateFunctions: true });
    const error = await provider.aggregate!("deals", { metrics: { "v,x": { fn: "sum", field: "amount" } } }).catch((e: unknown) => e);
    expect(isDataReadError(error)).toBe(true);
  });

  it("totals from the rows when aggregate functions are off", async () => {
    const { client, queries } = fakeClient(() => ({ data: [{ id: 1, amount: 5 }, { id: 2, amount: 7 }], count: null }));
    const provider = createSupabaseProvider(client as never);
    const result = await provider.aggregate!("deals", { metrics: { s: { fn: "sum", field: "amount" } } });
    expect(result.values).toEqual({ s: 12 });
    expect(queries[0]).toContainEqual(["range", [0, 499]]);
  });
});
