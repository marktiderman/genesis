import { useCallback, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type {
  BaseRecord,
  FilterParam,
  ListParams,
  ListResult,
  SortParam,
} from "../provider/types";
import { useLiveInvalidation, type LiveOptions } from "./use-live";

// ---------------------------------------------------------------------------
// useInfiniteResource — a list that grows with "Load more", by cursor.
//
// Asks for the first page with `cursor: null`. A provider that serves cursor
// paging answers with `nextCursor` and is paged by keyset from then on; one
// that doesn't answers without it and is paged by `page` (offset) until
// `total` rows are loaded. Pages live under `[resource, "infinite", params]`,
// so writes on the resource (which invalidate `[resource]`) refetch them,
// and pending optimistic and undoable writes are patched into every page.
// ---------------------------------------------------------------------------

export interface UseInfiniteResourceOptions {
  defaultSort?: SortParam;
  /** Re-synced when its value changes, like `useResource`'s. */
  defaultFilters?: FilterParam[];
  /** Rows per page. Default 25. */
  perPage?: number;
  /** The search to start with. Default "". */
  defaultSearch?: string;
  /** Supabase select/join syntax. Must include the sort and key columns. */
  select?: string;
  /** Fields to search across when `setSearch` is called. */
  searchFields?: string[];
  /** Disable fetching. */
  enabled?: boolean;
  /** Refetch the loaded pages when the provider reports a change. See `UseResourceOptions.live`. */
  live?: boolean | LiveOptions;
}

/** Where one page starts: its offset page, and its cursor (`null` for the first). */
export interface InfinitePageParam {
  page: number;
  cursor: string | null;
}

export interface UseInfiniteResourceReturn<T> {
  /** The TanStack infinite query. */
  query: UseInfiniteQueryResult<InfiniteData<ListResult<T>, InfinitePageParam>>;
  /** Every loaded row, in order. */
  rows: T[];
  /** Rows matching the filters and search, from the first page's count. */
  total: number | undefined;
  /** Loads the next page. Does nothing while one is loading or none is left. */
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** The params every page is asked with (without its page and cursor). */
  params: Omit<ListParams, "pagination"> & { perPage: number };
  setSort: (sort: SortParam | undefined) => void;
  setFilters: (filters: FilterParam[]) => void;
  setSearch: (query: string) => void;
}

function filterKey(filters: FilterParam[] | undefined): string {
  return JSON.stringify(
    (filters ?? []).map((f) =>
      Object.fromEntries(Object.entries(f).sort(([a], [b]) => a.localeCompare(b))),
    ),
  );
}

export function useInfiniteResource<T extends BaseRecord = BaseRecord>(
  resource: string,
  options: UseInfiniteResourceOptions = {},
): UseInfiniteResourceReturn<T> {
  const {
    defaultSort,
    defaultFilters,
    perPage = 25,
    defaultSearch = "",
    select,
    searchFields,
    enabled = true,
    live,
  } = options;
  const provider = useDataProvider();

  const [sort, setSort] = useState<SortParam | undefined>(defaultSort);
  const [filters, setFiltersRaw] = useState<FilterParam[]>(defaultFilters ?? []);
  const [search, setSearch] = useState(defaultSearch);

  // Follow `defaultFilters` by value, during render (see useResource).
  const defaultKey = filterKey(defaultFilters);
  const [syncedKey, setSyncedKey] = useState(defaultKey);
  if (defaultKey !== syncedKey) {
    setSyncedKey(defaultKey);
    setFiltersRaw(defaultFilters ?? []);
  }

  const setFilters = useCallback((next: FilterParam[]) => setFiltersRaw(next), []);

  const params = useMemo(() => {
    const p: Omit<ListParams, "pagination"> & { perPage: number } = {
      perPage,
      sort,
      filters: filters.length > 0 ? filters : undefined,
      select,
    };
    if (search && searchFields && searchFields.length > 0) {
      p.search = { query: search, fields: searchFields };
    }
    return p;
  }, [perPage, sort, filters, select, search, searchFields]);

  const query = useInfiniteQuery<
    ListResult<T>,
    Error,
    InfiniteData<ListResult<T>, InfinitePageParam>,
    readonly unknown[],
    InfinitePageParam
  >({
    queryKey: [resource, "infinite", params],
    initialPageParam: { page: 1, cursor: null },
    queryFn: ({ pageParam }) => {
      const { perPage: size, ...rest } = params;
      return provider.getList<T>(resource, {
        ...rest,
        pagination: { page: pageParam.page, perPage: size, cursor: pageParam.cursor },
      });
    },
    getNextPageParam: (last, pages, lastParam) => {
      if (last.nextCursor !== undefined) {
        // Cursor mode: the provider says whether there is more.
        return last.nextCursor ? { page: lastParam.page + 1, cursor: last.nextCursor } : undefined;
      }
      // Offset mode: more while fewer than `total` rows are loaded and the
      // last page was full.
      const loaded = pages.reduce((n, p) => n + p.data.length, 0);
      const total = pages[0]?.total ?? 0;
      if (last.data.length < params.perPage || loaded >= total) return undefined;
      return { page: lastParam.page + 1, cursor: null };
    },
    enabled,
  });

  useLiveInvalidation(resource, live, enabled, { filters: params.filters }, [resource]);

  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.data),
    [query.data],
  );
  const firstTotal = query.data?.pages[0]?.total;
  const total = firstTotal === undefined || firstTotal < 0 ? undefined : firstTotal;

  const { fetchNextPage: fetchNext, hasNextPage, isFetchingNextPage } = query;
  const fetchNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNext();
  }, [fetchNext, hasNextPage, isFetchingNextPage]);

  return {
    query,
    rows,
    total,
    fetchNextPage,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    params,
    setSort,
    setFilters,
    setSearch,
  };
}
