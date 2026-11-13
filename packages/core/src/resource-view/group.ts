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
