// groupRows: a view's rows under headers by its `groupBy` field (or another), with no React, so a
// custom view on the web, a phone screen and a server export group the same way.

import type { DataRow, ResourceContract } from "../schema/types";
import type { ResourceView } from "./types";

/**
 * One group of rows: the value they share, its words and the rows, in the order they came.
 *
 * @stability Beta
 */
export interface RowGroup<Row extends DataRow = DataRow> {
  /** Stable, for list keys: the value as text, or `""` for rows with no value. */
  readonly key: string;
  /** The value the rows share (`null` for the group with none). */
  readonly value: unknown;
  /** The value in words (`view.valueLabel`), or `emptyLabel` for the group with none. */
  readonly label: string;
  readonly rows: readonly Row[];
}

/** @stability Beta */
export interface GroupRowsOptions {
  /** The field to group by. Default the view's `groupBy`. */
  field?: string;
  /** The words for rows with no value. Default "No {field label}". */
  emptyLabel?: string;
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

/**
 * A view's rows in groups, in the order each group first appears (the server's sort, so loading
 * more never reorders what's on screen). Without a field (no `groupBy` and none given), one group
 * holding every row, with an empty label.
 *
 * ```ts
 * for (const group of groupRows(tasksView, rows)) console.log(group.label, group.rows.length);
 * ```
 *
 * @stability Beta
 */
export function groupRows<Row extends DataRow>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: ResourceView<ResourceContract<any>, Row>,
  rows: readonly Row[],
  options: GroupRowsOptions = {},
): RowGroup<Row>[] {
  const field = options.field ?? (view.definition.groupBy as string | undefined);
  if (!field) return rows.length ? [Object.freeze({ key: "", value: null, label: "", rows: Object.freeze([...rows]) })] : [];
  const groups = new Map<string, { key: string; value: unknown; label: string; rows: Row[] }>();
  for (const row of rows) {
    const value = row[field];
    const key = isEmpty(value) ? "" : String(value);
    let group = groups.get(key);
    if (!group) {
      const label = isEmpty(value) ? (options.emptyLabel ?? `No ${view.label(field).toLowerCase()}`) : view.valueLabel(field, value);
      group = { key, value: isEmpty(value) ? null : value, label, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()].map((g) => Object.freeze({ ...g, rows: Object.freeze(g.rows) }));
}

/**
 * The view's `totals` over some rows (a group's, or every loaded row for a footer): per field, its
 * sum, average, lowest, highest or count, `null` when no row has a number. Fields the view names
 * no total for are left out.
 *
 * ```ts
 * groupTotals(tasksView, group.rows); // { estimate_hours: 12.5 }
 * ```
 *
 * @stability Beta
 */
export function groupTotals<Row extends DataRow>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: ResourceView<ResourceContract<any>, Row>,
  rows: readonly Row[],
): Readonly<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const [field, fn] of Object.entries((view.definition.totals ?? {}) as Readonly<Record<string, string>>)) {
    if (fn === "count") {
      out[field] = rows.filter((r) => !isEmpty(r[field])).length;
      continue;
    }
    const numbers = rows.map((r) => (isEmpty(r[field]) ? NaN : Number(r[field]))).filter((n) => Number.isFinite(n));
    if (!numbers.length) {
      out[field] = null;
      continue;
    }
    const sum = numbers.reduce((a, b) => a + b, 0);
    out[field] = fn === "sum" ? sum : fn === "avg" ? sum / numbers.length : fn === "min" ? Math.min(...numbers) : Math.max(...numbers);
  }
  return Object.freeze(out);
}
