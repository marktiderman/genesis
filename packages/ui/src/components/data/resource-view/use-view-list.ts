"use client";

// useViewList: the headless view query (ADR 0019). A view's rows, one page at a time, with the
// view's scope and filters (useViewListParams), its sort, a search, a selection, the open record,
// the URL and the view's permissions: everything a list over a view does except drawing it. A
// custom view draws what this returns; `<CustomView type="list">` calls it for you.

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { resourceKeys, useDataProvider, useViewer, type BaseRecord, type DataRow, type ListParams, type ResourceContract, type SortParam } from "@marktiderman/genesis-core";
import { encodeRecordKey } from "@marktiderman/genesis-core/schema";
import { useLiveInvalidation } from "@marktiderman/genesis-core/hooks";
import type { Allowed, ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import type { SearchParamsAdapter } from "../../../navigation";
import { useResourceUrlState, type ResourceUrlStateOptions } from "../../../hooks/use-resource-url-state";
import { useViewListParams, type ViewListOptions, type ViewListParams } from "./view-list";

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
type AnyView<T extends Row> = View<ResourceContract<any>, T & DataRow>;

/** Rows per page a view list asks for by default. */
export const VIEW_LIST_PAGE = 25;

/**
 * A screen's own rule over the view's guards. It only narrows: `false` refuses, a sentence
 * refuses with that reason.
 *
 * @stability Beta
 */
export type ViewScreenCan<T extends Row = Row> = (action: "create" | "update" | "delete", row?: T) => Allowed | boolean;

/**
 * What the viewer may do here: the view's guards for this viewer, narrowed by the screen's
 * `can`. Each is `true` or the reason it isn't allowed.
 *
 * @stability Beta
 */
export interface ViewPermissions<T extends Row = Row> {
  create: Allowed;
  update: (row: T) => Allowed;
  delete: (row: T) => Allowed;
  /** One of the view's actions (`defineView`'s `actions`) on a row. */
  action: (name: string, row: T) => Allowed;
}

/** @stability Beta */
export interface UseViewListOptions<T extends Row = Row> extends Omit<ViewListOptions, "view"> {
  /** Rows per page. Default {@link VIEW_LIST_PAGE}. */
  perPage?: number;
  /** The first sort. Default the view's `orderBy`. */
  sort?: SortParam | null;
  /** The first search text. It searches the view's `labelField`. */
  search?: string;
  /**
   * Keep the page, sort, search and open record in the URL, as ResourcePage's `urlState`: your
   * router's search-params adapter, or `{ searchParams, params }` to rename the keys.
   */
  urlState?: SearchParamsAdapter | ResourceUrlStateOptions | undefined;
  /** The screen's own rule; it only narrows the view's guards. */
  can?: ViewScreenCan<T> | undefined;
}

/**
 * Which rows are picked. Keys are the rows' record keys (`keyOf`), so a selection survives a
 * refetch and paging.
 *
 * @stability Beta
 */
export interface ViewSelection<T extends Row = Row> {
  readonly keys: ReadonlySet<string>;
  isSelected: (row: T) => boolean;
  toggle: (row: T) => void;
  /** Pick exactly these keys. */
  set: (keys: Iterable<string>) => void;
  /** Pick every row on this page. */
  selectPage: () => void;
  clear: () => void;
}

/**
 * Everything a list over a view knows, headless: its rows and states, paging, sort, search,
 * selection, the open record, the URL and permissions.
 *
 * @stability Beta
 */
export interface ViewListState<T extends Row = Row> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: AnyView<T>;
  /** This page's rows. */
  rows: T[];
  /** Rows that match in all, when the provider counted them. */
  total: number | undefined;
  /** The first load (nothing to show yet). */
  loading: boolean;
  /** Any load, the first or a refetch (a new page, a live change). */
  fetching: boolean;
  error: unknown;
  refetch: () => void;
  /** Nothing matches (loaded, no error, no rows). */
  empty: boolean;
  page: number;
  perPage: number;
  /** Pages in all, when the total is known. */
  pageCount: number | undefined;
  hasMore: boolean;
  setPage: (page: number) => void;
  sort: SortParam | null;
  setSort: (sort: SortParam | null) => void;
  search: string;
  setSearch: (text: string) => void;
  selection: ViewSelection<T>;
  /** A row's record key (its key fields, composite keys encoded). */
  keyOf: (row: T) => string;
  /** The open record's key (the URL's `?id=` with `urlState`), or null. */
  openKey: string | null;
  /** The open record when it's on this page, else null. */
  openRow: T | null;
  open: (row: T) => void;
  close: () => void;
  can: ViewPermissions<T>;
  /** The scope, filters, select and live the list asks with (shared with every view type). */
  params: ViewListParams;
}

/**
 * The view's guards for the viewer, narrowed by a screen's own rule. Shared by every view type
 * and custom view, so they can't disagree.
 *
 * @stability Beta
 */
export function useViewPermissions<T extends Row>(view: AnyView<T>, can?: ViewScreenCan<T>): ViewPermissions<T> {
  const viewer = useViewer();
  return useMemo(() => {
    const narrow = (own: Allowed | boolean | undefined, then: () => Allowed): Allowed =>
      own === false ? "This isn't allowed." : typeof own === "string" ? own : then();
    return {
      create: narrow(can?.("create"), () => view.can("create", viewer)),
      update: (row: T) => narrow(can?.("update", row), () => view.can("update", row as T & DataRow, viewer)),
      delete: (row: T) => narrow(can?.("delete", row), () => view.can("delete", row as T & DataRow, viewer)),
      action: (name: string, row: T) => view.canAction(name, row as T & DataRow, viewer),
    };
  }, [view, can, viewer]);
}

/**
 * A view's list, headless: the same scope, filters and permissions as `<ResourceView>`, one page
 * at a time, for a screen that draws the rows itself (a custom view, ADR 0019):
 *
 * ```tsx
 * const list = useViewList(playersView, { perPage: 10, sort: { field: "points", order: "desc" } });
 * if (list.loading) return null; // <CustomView> draws loading, empty and error for you
 * return list.rows.map((p) => <Row key={list.keyOf(p)} player={p} />);
 * ```
 *
 * Reads go under core's list keys, so a save to the resource refreshes it; `live` refetches on a
 * provider's change, as a list's does.
 *
 * @stability Beta
 */
export function useViewList<T extends Row = Row>(view: AnyView<T>, options: UseViewListOptions<T> = {}): ViewListState<T> {
  const { perPage = VIEW_LIST_PAGE, sort: firstSort, search: firstSearch = "", urlState, can, ...listOptions } = options;
  const params = useViewListParams({ view, ...listOptions });
  const provider = useDataProvider();
  const url = useResourceUrlState(urlState ? ("setSearchParams" in urlState ? { searchParams: urlState } : urlState) : undefined);
  const orderBy = view.definition.orderBy;
  const viewSort: SortParam | null = orderBy ? { field: orderBy.field, order: orderBy.direction ?? "asc", ...(orderBy.nulls ? { nulls: orderBy.nulls } : {}) } : null;

  // Without a URL, the state is ours; with one, the URL is the truth.
  const [ownPage, setOwnPage] = useState(1);
  const [ownSort, setOwnSort] = useState<SortParam | null>(firstSort === undefined ? viewSort : firstSort);
  const [ownSearch, setOwnSearch] = useState(firstSearch);
  const [ownOpen, setOwnOpen] = useState<string | null>(null);
  const page = url ? (url.page ?? 1) : ownPage;
  // A URL sort only counts when it names a field of the view: a hand-edited link can't send another.
  const urlSort = url?.sort && view.field(url.sort.field) ? url.sort : null;
  const sort = url ? (urlSort ?? (firstSort === undefined ? viewSort : firstSort)) : ownSort;
  const search = url ? url.q : ownSearch;
  const openKey = url ? url.detailId : ownOpen;

  const request: ListParams = {
    pagination: { page, perPage },
    ...(sort ? { sort } : {}),
    filters: params.filters,
    ...(search.trim() && view.labelField ? { search: { query: search.trim(), fields: [view.labelField] } } : {}),
    ...(params.select ? { select: params.select } : {}),
  };
  const query = useQuery({
    queryKey: [...resourceKeys(view.resource).lists, { view: request }],
    queryFn: () => provider.getList<BaseRecord>(view.resource, request),
    enabled: params.enabled,
    // The last page stays up while the next loads, but never across a change of filters.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey[2] as { view?: ListParams } | undefined)?.view;
      const beforeKey = before ? JSON.stringify([before.filters, before.select ?? null, before.sort ?? null, before.search?.query ?? "", before.pagination?.perPage]) : null;
      const nowKey = JSON.stringify([params.filters, params.select ?? null, sort, search.trim(), perPage]);
      return beforeKey === nowKey ? keepPreviousData(previous) : undefined;
    },
  });
  useLiveInvalidation(view.resource, params.live, params.enabled, { filters: [...params.filters] }, resourceKeys(view.resource).all);

  const rows = useMemo(() => (query.data?.data ?? []) as unknown as T[], [query.data]);
  const counted = query.data && query.data.total >= 0 ? query.data.total : undefined;
  const keyOf = useCallback((row: T) => String(encodeRecordKey(view.contract, row as DataRow)), [view]);

  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const selection: ViewSelection<T> = {
    keys: picked,
    isSelected: (row) => picked.has(keyOf(row)),
    toggle: (row) =>
      setPicked((current) => {
        const next = new Set(current);
        const key = keyOf(row);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    set: (keys) => setPicked(new Set(keys)),
    selectPage: () => setPicked(new Set(rows.map(keyOf))),
    clear: () => setPicked(new Set()),
  };

  const setPage = (next: number) => {
    const p = Math.max(1, Math.floor(next));
    if (url) url.write({ page: p });
    else setOwnPage(p);
  };
  const setSort = (next: SortParam | null) => {
    if (url) url.write({ sort: next, page: 1 });
    else {
      setOwnSort(next);
      setOwnPage(1);
    }
  };
  const setSearch = (text: string) => {
    if (url) url.write({ q: text, page: 1 });
    else {
      setOwnSearch(text);
      setOwnPage(1);
    }
  };

  const permissions = useViewPermissions(view, can);
  const loading = params.enabled && query.isPending;
  const error = query.error;
  return {
    view,
    rows,
    total: counted,
    loading,
    fetching: query.isFetching,
    error,
    refetch: () => void query.refetch(),
    empty: !loading && !error && rows.length === 0 && !query.isPlaceholderData,
    page,
    perPage,
    pageCount: counted !== undefined ? Math.max(1, Math.ceil(counted / perPage)) : undefined,
    hasMore: counted !== undefined ? page * perPage < counted : rows.length >= perPage,
    setPage,
    sort,
    setSort,
    search,
    setSearch,
    selection,
    keyOf,
    openKey,
    openRow: openKey === null ? null : (rows.find((row) => keyOf(row) === openKey) ?? null),
    open: (row) => (url ? url.setDetailId(keyOf(row)) : setOwnOpen(keyOf(row))),
    close: () => (url ? url.setDetailId(null) : setOwnOpen(null)),
    can: permissions,
    params,
  };
}
