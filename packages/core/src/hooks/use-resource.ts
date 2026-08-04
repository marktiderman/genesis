import { useState, useCallback, useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type {
  BaseRecord,
  Identifier,
  SortParam,
  FilterParam,
  ListParams,
  ListResult,
} from "../provider/types";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseResourceOptions<T> {
  defaultSort?: SortParam;
  /**
   * Re-synced whenever its value changes (deep-equal, order-independent),
   * not just its identity — safe to pass a scope/audience-derived array that
   * changes across renders. This only covers CHANGES on an already-mounted
   * hook, though: if this starts `undefined` while the real value resolves
   * asynchronously, gate `enabled` on that same readiness signal too — the
   * hook cannot tell "no defaultFilters intended" apart from "not resolved
   * yet," so an ungated hook's very first fetch can still run unscoped.
   */
  defaultFilters?: FilterParam[];
  defaultPerPage?: number;
  /** Supabase select/join syntax, e.g. "*, author:profiles(name)". */
  select?: string;
  /** Fields to search across when setSearch is called. Required for server-side search. */
  searchFields?: string[];
  /** Disable auto-fetching. */
  enabled?: boolean;
  onCreateSuccess?: (data: T) => void;
  onUpdateSuccess?: (data: T) => void;
  onDeleteSuccess?: () => void;
  onError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseResourceReturn<T> {
  /** TanStack Query result for the list query. */
  list: UseQueryResult<ListResult<T>>;
  /** Current list params (pagination, sort, filters, search). */
  params: ListParams;
  setSort: (sort: SortParam | undefined) => void;
  setFilters: (filters: FilterParam[]) => void;
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  setSearch: (query: string) => void;
  /** Create a new record. Returns the created item. */
  create: (data: Partial<T>) => Promise<T>;
  /** Update an existing record by id. Returns the updated item. */
  update: (id: Identifier, data: Partial<T>) => Promise<T>;
  /** Delete a record by id. */
  remove: (id: Identifier) => Promise<void>;
  /** True when any mutation is in-flight. */
  isMutating: boolean;
  createMutation: UseMutationResult<T, Error, Partial<T>>;
  updateMutation: UseMutationResult<T, Error, { id: Identifier; data: Partial<T> }>;
  deleteMutation: UseMutationResult<void, Error, Identifier>;
}

// ---------------------------------------------------------------------------
// Filter identity — a deep-equality key independent of object-key order, so
// a caller that rebuilds the same logical filters via a differently-ordered
// spread (e.g. `{...base, operator: "eq"}` vs `{operator: "eq", ...base}`)
// doesn't trip a spurious resync + pagination reset on an unrelated rerender.
// ---------------------------------------------------------------------------

function stableFilterKey(filters: FilterParam[] | undefined): string | undefined {
  if (!filters) return undefined;
  return JSON.stringify(
    filters.map((f) => {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(f).sort()) {
        sorted[key] = (f as unknown as Record<string, unknown>)[key];
      }
      return sorted;
    }),
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useResource<T extends BaseRecord = BaseRecord>(
  resource: string,
  options: UseResourceOptions<T> = {},
): UseResourceReturn<T> {
  const {
    defaultSort,
    defaultFilters,
    defaultPerPage = 25,
    select,
    searchFields: searchFieldsOption,
    enabled = true,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    onError,
  } = options;

  const provider = useDataProvider();
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [sort, setSortRaw] = useState<SortParam | undefined>(defaultSort);
  const [filters, setFiltersRaw] = useState<FilterParam[]>(defaultFilters ?? []);
  const [page, setPage] = useState(1);
  const [perPage, setPerPageRaw] = useState(defaultPerPage);
  const [searchQuery, setSearchQuery] = useState("");

  // `defaultFilters` often resolves asynchronously — a caller's scope/audience
  // (team, project, ...) can still be loading on first render, so the array
  // it passes in changes value (not just identity) after mount, and may later
  // clear back to undefined (e.g. the scope itself is cleared). Re-syncing
  // here, during render rather than in an effect, means `filters` is already
  // correct by the time `params`/`list` below compute for this pass — no
  // stray unscoped fetch on the frame before an effect would have caught up.
  //
  // This only closes the gap for `defaultFilters` CHANGING across renders on
  // an already-mounted, already-enabled hook (e.g. a scope switch). It cannot
  // help the very first render: `filters` still seeds from whatever
  // `defaultFilters` is on mount, and `undefined` here is genuinely ambiguous
  // between "this caller never uses defaultFilters" (in which case forcing a
  // fetch to wait would break it forever) and "the real value hasn't resolved
  // yet." A caller in the second case MUST also gate `enabled` on that same
  // readiness signal for its very first fetch to be correctly scoped — this
  // hook has no way to tell the two cases apart on its own.
  const defaultFiltersKey = stableFilterKey(defaultFilters);
  const [syncedFiltersKey, setSyncedFiltersKey] = useState(defaultFiltersKey);
  if (defaultFiltersKey !== syncedFiltersKey) {
    setSyncedFiltersKey(defaultFiltersKey);
    setFiltersRaw(defaultFilters ?? []);
    setPage(1);
  }

  const setSort = useCallback((s: SortParam | undefined) => {
    setSortRaw(s);
    setPage(1);
  }, []);

  const setFilters = useCallback((f: FilterParam[]) => {
    setFiltersRaw(f);
    setPage(1);
  }, []);

  const setPerPage = useCallback((value: number) => {
    setPerPageRaw(value);
    setPage(1);
  }, []);

  const setSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
  }, []);

  // -------------------------------------------------------------------------
  // Params
  // -------------------------------------------------------------------------

  const params = useMemo<ListParams>(() => {
    const p: ListParams = {
      pagination: { page, perPage },
      sort,
      filters: filters.length > 0 ? filters : undefined,
      select,
    };
    if (searchQuery && searchFieldsOption && searchFieldsOption.length > 0) {
      p.search = { query: searchQuery, fields: searchFieldsOption };
    }
    return p;
  }, [page, perPage, sort, filters, select, searchQuery, searchFieldsOption]);

  // -------------------------------------------------------------------------
  // List query
  // -------------------------------------------------------------------------

  const listQueryKey = useMemo(
    () => [resource, "list", params] as const,
    [resource, params],
  );

  const list = useQuery<ListResult<T>>({
    queryKey: listQueryKey,
    queryFn: () => provider.getList<T>(resource, params),
    enabled,
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const invalidateResource = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [resource] }),
    [queryClient, resource],
  );

  const defaultOnError = useCallback(
    (error: Error) => {
      console.error(`[useResource] ${resource} mutation failed:`, error.message);
    },
    [resource],
  );

  const createMutation = useMutation<T, Error, Partial<T>>({
    mutationFn: async (data) => {
      const result = await provider.create<T>(resource, { data });
      return result.data;
    },
    onSuccess: (data) => {
      invalidateResource();
      onCreateSuccess?.(data);
    },
    onError: onError ?? defaultOnError,
  });

  const updateMutation = useMutation<
    T,
    Error,
    { id: Identifier; data: Partial<T> }
  >({
    mutationFn: async ({ id, data }) => {
      const result = await provider.update<T>(resource, { id, data });
      return result.data;
    },
    onSuccess: (data) => {
      invalidateResource();
      onUpdateSuccess?.(data);
    },
    onError: onError ?? defaultOnError,
  });

  const deleteMutation = useMutation<void, Error, Identifier>({
    mutationFn: async (id) => {
      await provider.deleteOne(resource, { id });
    },
    onSuccess: () => {
      invalidateResource();
      onDeleteSuccess?.();
    },
    onError: onError ?? defaultOnError,
  });

  // -------------------------------------------------------------------------
  // Convenience wrappers
  // -------------------------------------------------------------------------

  const create = useCallback(
    (data: Partial<T>) => createMutation.mutateAsync(data),
    [createMutation],
  );

  const update = useCallback(
    (id: Identifier, data: Partial<T>) =>
      updateMutation.mutateAsync({ id, data }),
    [updateMutation],
  );

  const remove = useCallback(
    (id: Identifier) => deleteMutation.mutateAsync(id),
    [deleteMutation],
  );

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  return {
    list,
    params,
    setSort,
    setFilters,
    setPage,
    setPerPage,
    setSearch,
    create,
    update,
    remove,
    isMutating,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
