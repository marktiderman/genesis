import { useState, useCallback, useMemo } from "react";
import {
  keepPreviousData as keepPreviousPlaceholder,
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
  InvalidationKey,
  WriteEvent,
} from "../provider/types";
import { relatedKeys } from "./related-keys";
import {
  cachedRecord,
  executeWrite,
  invalidateResource,
  useDelayedWrites,
  type MutationModeOptions,
} from "./mutation-mode";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseResourceOptions<T> extends MutationModeOptions {
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
  /** The page to start on (from 1), e.g. restored from the URL. Default 1. */
  defaultPage?: number;
  /** The search to start with, e.g. restored from the URL. Default "". */
  defaultSearch?: string;
  /** Supabase select/join syntax, e.g. "*, author:profiles(name)". */
  select?: string;
  /** Fields to search across when setSearch is called. Required for server-side search. */
  searchFields?: string[];
  /** Disable auto-fetching. */
  enabled?: boolean;
  /**
   * Other query keys to invalidate after a create, update or delete, on top
   * of `[resource]` and the provider's own `invalidates` (e.g. `[["me"]]`
   * when a write changes the signed-in user's roles).
   */
  invalidates?: InvalidationKey[];
  /**
   * While the next page / sort / search is loading, keep returning the
   * previous result (`list.isPlaceholderData` is true meanwhile) instead of
   * dropping to `undefined`. A paged list then stays on screen between pages
   * rather than flashing a skeleton. Default false.
   */
  keepPreviousData?: boolean;
  /**
   * After the write commits, with the provider's row. In `optimistic` and
   * `undoable` modes that is after `create` / `update` / `remove` have
   * already resolved.
   */
  onCreateSuccess?: (data: T) => void;
  onUpdateSuccess?: (data: T) => void;
  onDeleteSuccess?: () => void;
  /**
   * A write failed. In `optimistic` and `undoable` modes this is the only
   * place a failure is reported (the cache has already been put back), so
   * show it to the user here.
   */
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
  /**
   * Create a new record. Returns the created item. In `optimistic` and
   * `undoable` modes it resolves at once with the values given (no `id` yet;
   * `onCreateSuccess` gets the stored row).
   */
  create: (data: Partial<T>) => Promise<T>;
  /**
   * Update an existing record by id. Returns the updated item. In
   * `optimistic` and `undoable` modes it resolves at once with the cached
   * row merged with `data`.
   */
  update: (id: Identifier, data: Partial<T>) => Promise<T>;
  /** Delete a record by id. Resolves at once in `optimistic` / `undoable` modes. */
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
    defaultPage = 1,
    defaultSearch = "",
    select,
    searchFields: searchFieldsOption,
    enabled = true,
    invalidates,
    keepPreviousData = false,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    onError,
    mutationMode = "pessimistic",
    undoDelayMs,
    onUndoable,
  } = options;

  const provider = useDataProvider();
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [sort, setSortRaw] = useState<SortParam | undefined>(defaultSort);
  const [filters, setFiltersRaw] = useState<FilterParam[]>(defaultFilters ?? []);
  const [page, setPage] = useState(Math.max(1, Math.floor(defaultPage)));
  const [perPage, setPerPageRaw] = useState(defaultPerPage);
  const [searchQuery, setSearchQuery] = useState(defaultSearch);

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
    placeholderData: keepPreviousData ? keepPreviousPlaceholder : undefined,
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const invalidateAfter = useCallback(
    (event: WriteEvent) => {
      // Waits while an optimistic/undoable write on the resource is pending.
      void invalidateResource(queryClient, resource);
      for (const queryKey of relatedKeys(provider, event, invalidates)) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    },
    [queryClient, resource, provider, invalidates],
  );

  const defaultOnError = useCallback(
    (error: Error) => {
      console.error(`[useResource] ${resource} mutation failed:`, error.message);
    },
    [resource],
  );
  const reportError = onError ?? defaultOnError;

  const delayed = useDelayedWrites();
  const modeArgs = {
    queryClient,
    provider,
    resource,
    mode: mutationMode,
    undoDelayMs,
    onUndoable,
    delayed,
    failedLater: reportError,
  };

  const createMutation = useMutation<T, Error, Partial<T>>({
    mutationFn: async (data) => {
      const outcome = await executeWrite<T>({
        ...modeArgs,
        kind: "create",
        data: data as Record<string, unknown>,
        send: async () => {
          const result = await provider.create<T>(resource, { data });
          return { record: result.data, audit: result.audit };
        },
        committed: (record) => {
          invalidateAfter({ resource, kind: "create", id: record.id, record });
          onCreateSuccess?.(record);
        },
      });
      return outcome.status === "committed" ? outcome.record : (data as T);
    },
    onError: reportError,
  });

  const updateMutation = useMutation<
    T,
    Error,
    { id: Identifier; data: Partial<T> }
  >({
    mutationFn: async ({ id, data }) => {
      const before = cachedRecord(queryClient, resource, id);
      const outcome = await executeWrite<T>({
        ...modeArgs,
        kind: "update",
        id,
        data: data as Record<string, unknown>,
        send: async () => {
          const result = await provider.update<T>(resource, { id, data });
          return { record: result.data, audit: result.audit };
        },
        committed: (record) => {
          invalidateAfter({ resource, kind: "update", id, record });
          onUpdateSuccess?.(record);
        },
      });
      return outcome.status === "committed"
        ? outcome.record
        : ({ ...(before ?? {}), ...data, id: before?.id ?? id } as T);
    },
    onError: reportError,
  });

  const deleteMutation = useMutation<void, Error, Identifier>({
    mutationFn: async (id) => {
      await executeWrite<void>({
        ...modeArgs,
        kind: "delete",
        id,
        send: async () => {
          const result = await provider.deleteOne(resource, { id });
          return { record: undefined, audit: result?.audit };
        },
        committed: () => {
          invalidateAfter({ resource, kind: "delete", id });
          onDeleteSuccess?.();
        },
      });
    },
    onError: reportError,
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
