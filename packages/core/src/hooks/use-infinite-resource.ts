import { useCallback, useMemo, useRef, useState } from "react";
import {
  keepPreviousData as keepPrevious,
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
import { resourceKeys } from "../query-keys";

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
  /**
   * Keep at most this many pages loaded (TanStack Query's `maxPages`): scrolling far drops pages
   * from the front, and scrolling back loads them again, so a long feed and a live refetch stay
   * cheap. Needs a provider that pages by cursor both ways (`prevCursor`); offset paging ignores it.
   */
  maxPages?: number;
  /**
   * Keep the current rows on screen while a new search, sort or filter loads, instead of a
   * loading state for each change. Default false.
   */
  keepPreviousData?: boolean;
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
  /** True when `total` is the database's estimate, so a screen says "about". */
  totalIsEstimate: boolean;
  /** Loads the next page. Does nothing while one is loading or none is left. */
  fetchNextPage: () => void;
  hasNextPage: boolean;
  /** Load the page before the first loaded one (after `maxPages` dropped it). No-op when there is none. */
  fetchPreviousPage: () => void;
  hasPreviousPage: boolean;
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
    keepPreviousData = false,
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

  // Whether the provider pages by cursor (it sends `nextCursor`), learnt from the first page.
  const cursorMode = useRef(false);
  const query = useInfiniteQuery<
    ListResult<T>,
    Error,
    InfiniteData<ListResult<T>, InfinitePageParam>,
    readonly unknown[],
    InfinitePageParam
  >({
    queryKey: resourceKeys(resource).infinite(params),
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
      // Offset mode: more while the last page was full and, when the total is
      // an exact count, fewer than `total` rows are loaded. An uncounted
      // (`count: "none"`, total -1) or estimated total (RLS makes the planner
      // guess low) never stops the list early: only a short page does.
      const loaded = pages.reduce((n, p) => n + p.data.length, 0);
      const first = pages[0];
      const exact = !!first && first.total >= 0 && !first.totalIsEstimate;
      if (last.data.length < params.perPage || (exact && loaded >= first.total)) return undefined;
      return { page: lastParam.page + 1, cursor: null };
    },
    getPreviousPageParam: (first, _pages, firstParam) =>
      // Cursor mode only: offset pages aren't dropped from the front.
      first.prevCursor ? { page: firstParam.page - 1, cursor: first.prevCursor } : undefined,
    // Only once the provider is known to page by cursor: TanStack drops pages whenever maxPages is
    // set, and offset pages can't be loaded back, so they would be lost.
    ...(options.maxPages !== undefined && options.maxPages > 0 && cursorMode.current ? { maxPages: options.maxPages } : {}),
    enabled,
    ...(keepPreviousData ? { placeholderData: keepPrevious } : {}),
  });

  useLiveInvalidation(resource, live, enabled, { filters: params.filters }, [resource]);

  // A row can move between pages while the user scrolls (its sort value
  // changed, or rows before it were added): show it once, where it first appears.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const row of page.data) {
        const id = row?.id;
        if (id != null) {
          const key = String(id);
          if (seen.has(key)) continue;
          seen.add(key);
        }
        out.push(row);
      }
    }
    return out;
  }, [query.data]);
  const first = query.data?.pages[0];
  if (first && first.nextCursor !== undefined) cursorMode.current = true;
  // The count comes with the list's first page only. Once maxPages drops that page (or a refetch
  // starts from a back cursor) the loaded first page has no count, so keep the last one seen for
  // these params.
  const paramsKey = JSON.stringify(params);
  const lastCount = useRef<{ key: string; total: number; estimate: boolean } | null>(null);
  if (first && first.total >= 0) {
    lastCount.current = { key: paramsKey, total: first.total, estimate: !!first.totalIsEstimate };
  }
  const count = lastCount.current?.key === paramsKey ? lastCount.current : null;
  const total = count?.total;

  const {
    fetchNextPage: fetchNext,
    hasNextPage,
    isFetchingNextPage,
    fetchPreviousPage: fetchPrevious,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = query;
  const fetchNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNext();
  }, [fetchNext, hasNextPage, isFetchingNextPage]);
  const fetchPreviousPage = useCallback(() => {
    if (!hasPreviousPage || isFetchingPreviousPage) return;
    void fetchPrevious();
  }, [fetchPrevious, hasPreviousPage, isFetchingPreviousPage]);

  return {
    query,
    rows,
    total,
    totalIsEstimate: !!count?.estimate,
    fetchNextPage,
    hasNextPage: !!hasNextPage,
    fetchPreviousPage,
    hasPreviousPage: !!hasPreviousPage,
    isFetchingNextPage,
    params,
    setSort,
    setFilters,
    setSearch,
  };
}
