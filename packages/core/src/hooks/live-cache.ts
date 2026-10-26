// What a live event may do to cached reads before the refetch: patch a changed row in place, and
// tell which lists the change can't have touched. Only the fields a cached row already has are
// patched, so a list or record read with a narrower select never gains columns it didn't ask for.

import type { Query, QueryClient } from "@tanstack/react-query";
import type { BaseRecord, FilterParam, ListParams, ListResult } from "../provider/types";

type Row = Record<string, unknown>;

function isListResult(value: unknown): value is ListResult<BaseRecord> {
  return !!value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data);
}

function isInfinite(value: unknown): value is { pages: unknown[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { pages?: unknown }).pages);
}

const sameId = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);

/** `row` with the fields it already has taken from `record`; the same object when nothing changes. */
function merge(row: Row, record: Row): Row {
  let next: Row | null = null;
  for (const key of Object.keys(row)) {
    if (key in record && row[key] !== record[key]) (next ??= { ...row })[key] = record[key];
  }
  return next ?? row;
}

function patchList(list: ListResult<BaseRecord>, record: Row): ListResult<BaseRecord> {
  let changed = false;
  const data = list.data.map((row) => {
    if (!sameId(row.id, record.id)) return row;
    const next = merge(row, record);
    if (next !== row) changed = true;
    return next as BaseRecord;
  });
  return changed ? { ...list, data } : list;
}

/**
 * Patches a changed row into every cached read of `resource`: records read whole (no `select`),
 * and the rows of lists and infinite lists. Fields a cached row lacks are left out.
 */
export function patchCachedRow(queryClient: QueryClient, resource: string, record: Row): void {
  if (record.id == null) return;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [resource] })) {
    const [, kind, idOrParams, select] = query.queryKey as readonly unknown[];
    const data = query.state.data;
    if (data === undefined) continue;
    let next: unknown = data;
    if (kind === "detail" && select === undefined && sameId(idOrParams, record.id) && typeof data === "object" && data) {
      next = merge(data as Row, record);
    } else if (kind === "list" && isListResult(data)) {
      next = patchList(data, record);
    } else if (kind === "infinite" && isInfinite(data)) {
      let changed = false;
      const pages = data.pages.map((page) => {
        if (!isListResult(page)) return page;
        const patched = patchList(page, record);
        if (patched !== page) changed = true;
        return patched;
      });
      if (changed) next = { ...data, pages };
    }
    if (next !== data) queryClient.setQueryData(query.queryKey, next);
  }
}

/** Whether `record` passes the filters this function can read; any other filter counts as a pass. */
function passes(record: Row, filters: readonly FilterParam[] | undefined): boolean {
  for (const f of filters ?? []) {
    if (!(f.field in record)) continue;
    const v = record[f.field];
    if (f.operator === "eq" && String(v) !== String(f.value)) return false;
    if (f.operator === "neq" && String(v) === String(f.value)) return false;
    if (f.operator === "is_null" && v !== null) return false;
    if (f.operator === "is_not_null" && v === null) return false;
    if (f.operator === "in" && !f.value.map(String).includes(String(v))) return false;
  }
  return true;
}

function holds(data: unknown, id: unknown): boolean {
  const rows = isListResult(data) ? data.data : isInfinite(data) ? data.pages.flatMap((p) => (isListResult(p) ? p.data : [])) : [];
  return rows.some((row) => sameId(row.id, id));
}

/**
 * Whether a cached list could be changed by these rows: one of them matches its filters, or is in
 * it now (it may have left). Any read that isn't a list could always change.
 */
export function listCouldChange(query: Query, records: readonly Row[]): boolean {
  const [, kind, params] = query.queryKey as readonly unknown[];
  if (kind !== "list" && kind !== "infinite") return true;
  const filters = (params as ListParams | undefined)?.filters;
  if (!filters?.length) return true;
  return records.some((record) => passes(record, filters) || holds(query.state.data, record.id));
}
