"use client";

// The data side of a board: one paged `getList` per column, each narrowed to its value. Shared by
// ResourceView's `mode="board"` and studio's board, so there is one way a board loads (G5): both
// draw what this returns with KanbanBoard.

import { useMemo, useState } from "react";
import { useQueries, type QueryKey } from "@tanstack/react-query";
import { resourceKeys, type BaseRecord, type DataProvider, type FilterParam, type ListParams, type SortParam } from "@marktiderman/genesis-core";

/** The column for rows whose field is empty. */
export const BOARD_NONE = "__genesis_none__";

/** Cards per column page. */
export const BOARD_PAGE = 50;

/** @stability Beta */
export interface UseBoardColumnsOptions {
  provider: DataProvider;
  resource: string;
  /** The field each column narrows on. */
  field: string;
  /** The columns, in order, as values of `field`; {@link BOARD_NONE} is the column for empty ones. */
  values: readonly string[];
  /** Filters every column shares. One on `field` itself is set aside: each column has its own. */
  filters?: readonly FilterParam[];
  sorts?: readonly SortParam[];
  search?: ListParams["search"];
  select?: string;
  /** Cards per column page. Default {@link BOARD_PAGE}. */
  perPage?: number;
  /** False while the screen waits (on its scope, say). Default true. */
  enabled?: boolean;
  /**
   * A column page's query key. Default core's list keys (`[resource, "list", …]`), so a save to the
   * resource refreshes the board like any list, and a write finds the row it changes in the cache.
   */
  queryKey?: (request: ListParams, column: { value: string; page: number }) => QueryKey;
  /** Retry failed reads (TanStack's `retry`). Default TanStack's. */
  retry?: boolean;
}

/** One column's rows so far. @stability Beta */
export interface BoardColumnData<T> {
  value: string;
  items: T[];
  /** Rows in the column in all, once its first page has loaded and the provider counted. */
  total?: number;
  /** More pages to load. */
  hasMore: boolean;
  loading: boolean;
}

/** @stability Beta */
export interface UseBoardColumnsReturn<T> {
  columns: BoardColumnData<T>[];
  /** Load the next page of one column. */
  loadMore: (value: string) => void;
  /** The first failed read, if any. */
  error: unknown;
  /** Some column is still on its first load. */
  loading: boolean;
  /** A filter on the board's own field was set aside. */
  ownFilterSetAside: boolean;
}

/** One column's own filter: its value, or "is empty". */
export function boardColumnFilter(field: string, value: string): FilterParam {
  return value === BOARD_NONE ? { field, operator: "is_null" } : { field, operator: "eq", value };
}

/**
 * Load a board: one request per column page, each with the shared filters, sort and search plus the
 * column's value. Columns page on their own (`loadMore`), and the pages a column has loaded reset
 * when the filters, sort or search change.
 *
 * @stability Beta
 */
export function useBoardColumns<T extends BaseRecord = BaseRecord>(options: UseBoardColumnsOptions): UseBoardColumnsReturn<T> {
  const { provider, resource, field, values, filters = [], sorts = [], search, select, perPage = BOARD_PAGE, enabled = true, queryKey, retry } = options;
  const shared = useMemo(() => filters.filter((f) => f.field !== field), [filters, field]);
  const resetKey = JSON.stringify([resource, field, shared, sorts, search ?? null, select ?? null, perPage]);
  const [pages, setPages] = useState<{ key: string; byValue: Record<string, number> }>({ key: resetKey, byValue: {} });
  const byValue = pages.key === resetKey ? pages.byValue : {};

  const specs = values.flatMap((value) => Array.from({ length: byValue[value] ?? 1 }, (_, i) => ({ value, page: i + 1 })));
  const requests = specs.map(({ value, page }): ListParams => ({
    pagination: { page, perPage },
    ...(sorts[0] ? { sort: sorts[0], sorts: [...sorts] } : {}),
    filters: [...shared, boardColumnFilter(field, value)],
    ...(search?.query ? { search } : {}),
    ...(select !== undefined ? { select } : {}),
  }));
  const results = useQueries({
    queries: specs.map((spec, i) => ({
      queryKey: queryKey ? queryKey(requests[i]!, spec) : [...resourceKeys(resource).lists, { board: field, column: spec.value, ...requests[i]! }],
      queryFn: () => provider.getList<T>(resource, requests[i]!),
      enabled,
      ...(retry !== undefined ? { retry } : {}),
    })),
  });

  const columns = values.map((value): BoardColumnData<T> => {
    const mine = specs.flatMap((s, i) => (s.value === value ? [results[i]!] : []));
    const items = mine.flatMap((r) => r.data?.data ?? []);
    const first = mine[0]?.data;
    const last = mine[mine.length - 1];
    // A total of -1 is uncounted: then a full last page means there may be more.
    const total = first && first.total >= 0 ? first.total : undefined;
    const hasMore = total !== undefined ? total > items.length : (last?.data?.data.length ?? 0) >= perPage;
    return { value, items, ...(total !== undefined ? { total } : {}), hasMore, loading: mine.some((r) => r.isLoading) };
  });

  return {
    columns,
    loadMore: (value) => setPages({ key: resetKey, byValue: { ...byValue, [value]: (byValue[value] ?? 1) + 1 } }),
    error: results.find((r) => r.error)?.error ?? null,
    loading: results.some((r) => r.isLoading),
    ownFilterSetAside: filters.some((f) => f.field === field),
  };
}
