// ---------------------------------------------------------------------------
// Totals over a list (ADR 0023): count, and sum / avg / min / max of a field
//
// A provider that can total in the store implements `DataProvider.aggregate`.
// `resolveAggregate` uses it when it's there, and otherwise works the totals
// out from the provider's own reads: a count from `getList`'s total, anything
// else from the rows, paged, up to a limit. Either way the rows are the ones
// `getList` would return for the same filters, so row security still decides.
// ---------------------------------------------------------------------------

import { DataReadError } from "../schema/read-outcome";
import type { AggregateMetric, AggregateParams, AggregateResult, DataProvider } from "./types";

type Row = Record<string, unknown>;

/** The numbers a row's value stands for: a number, or numeric text (Postgres `numeric` arrives as text). */
function numeric(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * The metrics' values over rows already in hand: what an in-memory provider, a test, or the
 * paged fallback computes. `count` counts every row; the others skip rows with no number in the
 * field and are `null` when none has one.
 *
 * @stability Beta
 */
export function toAggregateValues(
  rows: readonly Row[],
  metrics: Readonly<Record<string, AggregateMetric>>,
): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  for (const [name, metric] of Object.entries(metrics)) {
    if (metric.fn === "count") {
      values[name] = rows.length;
      continue;
    }
    const nums: number[] = [];
    for (const row of rows) {
      const n = numeric(row[metric.field]);
      if (n !== undefined) nums.push(n);
    }
    if (nums.length === 0) {
      values[name] = null;
      continue;
    }
    switch (metric.fn) {
      case "sum":
        values[name] = nums.reduce((a, b) => a + b, 0);
        break;
      case "avg":
        values[name] = nums.reduce((a, b) => a + b, 0) / nums.length;
        break;
      case "min":
        values[name] = Math.min(...nums);
        break;
      case "max":
        values[name] = Math.max(...nums);
        break;
    }
  }
  return values;
}

/** Every problem with an aggregate request; empty when it is sound. */
export function aggregateProblems(params: AggregateParams): string[] {
  const problems: string[] = [];
  const entries = Object.entries(params?.metrics ?? {});
  if (entries.length === 0) problems.push("metrics: at least one");
  for (const [name, metric] of entries) {
    if (!metric || typeof metric !== "object") problems.push(`metrics.${name}: expected { fn }`);
    else if (metric.fn === "count") continue;
    else if (!["sum", "avg", "min", "max"].includes(metric.fn)) problems.push(`metrics.${name}.fn: one of count, sum, avg, min, max`);
    else if (typeof metric.field !== "string" || !metric.field) problems.push(`metrics.${name}.field: the numeric field to ${metric.fn}`);
  }
  return problems;
}

export interface ResolveAggregateOptions {
  /** Rows per page when the totals come from the rows (no `aggregate` on the provider). Default 500. */
  pageSize?: number;
  /**
   * The most rows the fallback reads before it gives up with a `DataReadError` ("invalid"),
   * rather than a total that quietly leaves rows out. Default 10 000. A provider with its own
   * `aggregate` has no such limit.
   */
  maxRows?: number;
}

/**
 * Totals over a resource's rows through any provider: its `aggregate` when it has one, else a
 * count from `getList`'s total (one row read), else the rows themselves, paged
 * (`toAggregateValues`). Throws `DataReadError` for a request that isn't sound, and when the
 * fallback would have to read more than `maxRows`.
 *
 * @stability Beta
 */
export async function resolveAggregate(
  provider: DataProvider,
  resource: string,
  params: AggregateParams,
  options: ResolveAggregateOptions = {},
): Promise<AggregateResult> {
  const problems = aggregateProblems(params);
  if (problems.length) {
    throw new DataReadError("invalid", "These totals couldn't be worked out.", {
      cause: new Error(`[genesis-core] aggregate of "${resource}": ${problems.join("; ")}`),
    });
  }
  if (typeof provider.aggregate === "function") return provider.aggregate(resource, params);

  const { filters, search } = params;
  const metrics = Object.values(params.metrics);
  if (metrics.every((m) => m.fn === "count")) {
    const page = await provider.getList(resource, {
      filters,
      search,
      pagination: { page: 1, perPage: 1 },
      count: params.count ?? "exact",
    });
    if (page.total >= 0) {
      const values = Object.fromEntries(Object.keys(params.metrics).map((name) => [name, page.total]));
      return page.totalIsEstimate ? { values, isEstimate: true } : { values };
    }
  }

  const pageSize = Math.max(1, options.pageSize ?? 500);
  const maxRows = Math.max(1, options.maxRows ?? 10_000);
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const result = await provider.getList<Row & { id: string | number }>(resource, {
      filters,
      search,
      pagination: { page, perPage: pageSize },
      count: "none",
    });
    rows.push(...result.data);
    if (rows.length > maxRows) {
      throw new DataReadError("invalid", "These totals couldn't be worked out.", {
        cause: new Error(
          `[genesis-core] aggregate of "${resource}" would read more than ${maxRows} rows; give the provider an aggregate() or narrow the filters.`,
        ),
      });
    }
    if (result.data.length < pageSize) break;
  }
  return { values: toAggregateValues(rows, params.metrics) };
}
