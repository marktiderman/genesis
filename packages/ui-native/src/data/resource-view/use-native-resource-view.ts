// useNativeResourceView: the headless NativeResourceView. Cursor paging through
// useInfiniteResource (onEndReached), search debounced 300 ms, writes through useResource (so they
// share its cache patching, rollback and refusal handling), and the view's rows, sections, swipe
// actions and form fields resolved once.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BaseRecord, DataRow, FilterParam } from "@marktiderman/genesis-core";
import { useCapabilities, useInfiniteResource, useResource } from "@marktiderman/genesis-core/hooks";
import type { Allowed } from "@marktiderman/genesis-core/resource-view";
import { useNativeResourceViewMessages } from "./display";
import {
  allowed,
  formFieldsFor,
  refusalFields,
  refusalMessage,
  rowItem,
  sectionsFor,
  swipeActionsFor,
  validateValues,
  writableValues,
  type AnyResourceView,
  type NativeFormField,
  type NativeResourceRowItem,
  type NativeResourceScreenCan,
  type NativeResourceSection,
  type NativeResourceSwipeAction,
} from "./mapping";
import { fill } from "./messages";

type Row = Record<string, unknown>;
type Filter = Readonly<Record<string, string | number | boolean | null>>;

/** How long typing waits before the search goes to the server. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface NativeResourceViewOptions<T extends Row = Row> {
  /** A column preset the view defines, for the rows' fallback subtitle. Default: the tab's, then `default`. */
  columns?: string;
  /** A tab the view defines: its columns and its server filter. */
  preset?: string;
  /** Equality filters sent to the server (`{ client_id: id }`); `null` means "is empty". */
  filter?: Filter;
  /** Rows per page. Default 25. */
  perPage?: number;
  /** Fields the search box searches. Default: the view's `labelField`. */
  searchFields?: string[];
  /** The screen's own rule. It only narrows the view's guards. */
  can?: NativeResourceScreenCan<T>;
  /** Refetch loaded pages when the provider reports a change. */
  live?: boolean;
}

export type SaveResult = { ok: true } | { ok: false; message?: string; fields: Record<string, string> };

export interface UseNativeResourceViewReturn<T extends Row = Row> {
  rows: T[];
  /** Rows in `groupBy` sections (one untitled section when the view doesn't group). */
  sections: NativeResourceSection<T>[];
  /** Rows matching the filters and search, when the provider counts them. */
  total: number | undefined;
  /** The first page is loading. */
  loading: boolean;
  /** The read failed: its message, in plain words. */
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Pass to the list's `onEndReached`: loads the next page by cursor. */
  loadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  /** What the search box shows (the server sees it 300 ms after the last keystroke). */
  search: string;
  setSearch: (text: string) => void;
  /** The last refused write, in plain words, shown inline until dismissed or the next write. */
  refusal: string | null;
  dismissRefusal: () => void;
  item: (row: T) => NativeResourceRowItem;
  /** The row's swipe actions. Edit and delete call `onEdit` / `onDelete` you pass here. */
  actions: (row: T, handlers: { onEdit: (row: T) => void; onDelete: (row: T) => void; onRefused: (label: string, reason: string) => void }) => NativeResourceSwipeAction[];
  /** Whether a new row may be created: true, or the guard's reason. False when the screen turns it off or there's no form. */
  canCreate: Allowed | false;
  /** The form sheet's fields. */
  formFields: (mode: "create" | "edit") => NativeFormField[];
  /** Check and save the form's values. Sends only writable keys. Stays pessimistic so the sheet can show refusals. */
  save: (mode: "create" | "edit", values: Readonly<Record<string, unknown>>, row?: T) => Promise<SaveResult>;
  /** Delete a row optimistically: it leaves the list at once and comes back if the server refuses. */
  remove: (row: T) => void;
  /** The provider bins deleted rows (they can be restored). */
  softDelete: boolean;
}

function filterParams(filter: Filter | undefined): FilterParam[] {
  return Object.entries(filter ?? {}).map(([field, value]) =>
    value === null ? { field, operator: "is_null" as const } : { field, operator: "eq" as const, value },
  );
}

export function useNativeResourceView<T extends Row = Row>(
  view: AnyResourceView<T>,
  options: NativeResourceViewOptions<T> = {},
): UseNativeResourceViewReturn<T> {
  const { columns: columnPreset, preset, filter, perPage, searchFields: searchOption, can, live } = options;
  const messages = useNativeResourceViewMessages();
  const tab = preset ? view.definition.presets?.[preset] : undefined;
  if (preset && !tab) throw new Error(`NativeResourceView(${view.resource}): no preset "${preset}"`);
  const columns = useMemo(() => view.columns(columnPreset ?? tab?.columns ?? "default"), [view, columnPreset, tab]);

  // ── Reads: cursor pages, server filters, server search ──────────────────
  const tabFilter = tab?.filter as Filter | undefined;
  const defaultFilters = useMemo(() => [...filterParams(tabFilter), ...filterParams(filter)], [tabFilter, filter]);
  const orderBy = view.definition.orderBy;
  const searchFields = useMemo(
    () => searchOption ?? (view.labelField ? [view.labelField] : undefined),
    [searchOption, view.labelField],
  );
  const pages = useInfiniteResource<T & BaseRecord>(view.resource, {
    defaultFilters,
    ...(orderBy ? { defaultSort: { field: orderBy.field as string, order: orderBy.direction ?? "asc" } } : {}),
    ...(perPage ? { perPage } : {}),
    ...(searchFields ? { searchFields } : {}),
    keepPreviousData: true,
    ...(live ? { live } : {}),
  });

  const [search, setSearchText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setSearch: sendSearch } = pages;
  const setSearch = useCallback(
    (text: string) => {
      setSearchText(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => sendSearch(text), SEARCH_DEBOUNCE_MS);
    },
    [sendSearch],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // ── Writes ────────────────────────────────────────────────────────────
  const [refusal, setRefusal] = useState<string | null>(null);
  const deleteFailed = fill(messages.refusal.deleteFailed, { noun: view.noun });
  const optimistic = useResource<T & BaseRecord>(view.resource, {
    enabled: false,
    mutationMode: "optimistic",
    // The row is already back in the list (the cache is put back); say why, inline.
    onError: (error) => setRefusal(refusalMessage(error, deleteFailed)),
  });
  const pessimistic = useResource<T & BaseRecord>(view.resource, { enabled: false, onError: () => {} });
  const capabilities = useCapabilities(view.resource);
  const softDelete = capabilities.data?.softDelete === true;

  const formFields = useCallback((mode: "create" | "edit") => formFieldsFor(view, mode), [view]);
  const editable = useMemo(() => formFieldsFor(view, "edit").some((f) => !f.readOnly), [view]);
  const canCreate = useMemo(
    () => (formFieldsFor(view, "create").length ? allowed(view, "create", undefined, can) : false),
    [view, can],
  );

  const { create, update } = pessimistic;
  const save = useCallback(
    async (mode: "create" | "edit", values: Readonly<Record<string, unknown>>, row?: T): Promise<SaveResult> => {
      const fields = formFieldsFor(view, mode);
      const errors = validateValues(fields, values, messages);
      if (Object.keys(errors).length) return { ok: false, fields: errors };
      const data = writableValues(view, mode, fields, values) as Partial<T & BaseRecord>;
      setRefusal(null);
      try {
        if (mode === "create") await create(data);
        else await update(row!.id as string, data);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: refusalMessage(error, fill(messages.form.saveFailed, { noun: view.noun })),
          fields: refusalFields(error),
        };
      }
    },
    [view, messages, create, update],
  );

  const { remove: removeRow } = optimistic;
  const remove = useCallback(
    (row: T) => {
      setRefusal(null);
      // Optimistic: resolves at once; a refusal arrives through onError after the rollback.
      removeRow(row.id as string).catch(() => {});
    },
    [removeRow],
  );

  const item = useCallback((row: T) => rowItem(view, row, columns, messages), [view, columns, messages]);
  const actions = useCallback<UseNativeResourceViewReturn<T>["actions"]>(
    (row, handlers) => swipeActionsFor(view, row, { messages, softDelete, editable, screen: can, ...handlers }),
    [view, messages, softDelete, editable, can],
  );

  const sections = useMemo(() => sectionsFor(view, pages.rows, messages), [view, pages.rows, messages]);

  const { query } = pages;
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const error = query.isError
    ? query.error?.name === "DataReadError" && query.error.message
      ? query.error.message
      : fill(messages.list.loadFailed, { nounPlural: view.nounPlural })
    : null;

  return {
    rows: pages.rows as T[],
    sections: sections as NativeResourceSection<T>[],
    total: pages.total,
    loading: query.isLoading,
    error,
    refreshing,
    refresh,
    loadMore: pages.fetchNextPage,
    loadingMore: pages.isFetchingNextPage,
    hasMore: pages.hasNextPage,
    search,
    setSearch,
    refusal,
    dismissRefusal: useCallback(() => setRefusal(null), []),
    item,
    actions,
    canCreate,
    formFields,
    save,
    remove,
    softDelete,
  };
}

