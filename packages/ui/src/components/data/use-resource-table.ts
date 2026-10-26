"use client";

/**
 * `useResourceTable`: ResourcePage's behaviour without its markup. Lives
 * apart from ResourcePage.tsx so importing the hook (e.g. from `/hooks`)
 * does not pull in the page's components and icons.
 */
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { DataTableColumn, DataTableSort } from "./DataTable";
import type {
  ResourceAction,
  ResourceDeleteConfirmCopy,
  ResourcePageProps,
} from "./ResourcePage";
import { useViewSettings } from "../../hooks/use-view-settings";
import { useKeyboardNavigation } from "../../hooks/use-keyboard-navigation";
import { useResourceUrlState } from "../../hooks/use-resource-url-state";
import {
  useResourcePage,
  type ResourceActions,
} from "../../hooks/use-resource-page";
import {
  useCapabilities,
  useInfiniteResource,
  useOne,
  useResource,
} from "@marktiderman/genesis-core/hooks";
import type {
  BaseRecord,
  Identifier,
} from "@marktiderman/genesis-core/provider";
import { writeModeOptions } from "./undo-toast";
import { toast } from "../ui/sonner";
import { defaultNavigate } from "../../navigation";

/**
 * Everything ResourcePage's markup reads. Internal: its names may change in
 * any release. Apps use {@link useResourceTable}.
 *
 * @internal
 */
export function useResourceTableModel<
  T extends Record<string, unknown> = Record<string, unknown>,
>(props: ResourcePageProps<T>) {
  const {
    resource: resourceName,
    data: dataProp,
    total: totalProp,
    pagination = "client",
    clientRowLimit = 1000,
    title,
    subtitle,
    icon,
    columns: columnsProp,
    getKey: getKeyProp,
    detail = "panel",
    detailWidth = "md",
    titleField: titleFieldProp,
    subtitleField: subtitleFieldProp,
    getTitle,
    getSubtitle,
    renderDetail: renderDetailProp,
    detailFields,
    statusFilter,
    searchFields,
    searchPlaceholder,
    initialFilters,
    onFiltersChange,
    filters: filtersProp,
    page: pageProp,
    perPage: perPageProp,
    onPageChange,
    onPerPageChange,
    onSortChange,
    onSearchChange,
    loading: loadingProp,
    error: errorProp,
    errorMessage,
    onRetry: onRetryProp,
    savedViews,
    onLoadView,
    onSaveView,
    onDeleteView,
    canSaveViews,
    columnVisibility,
    columnVisibilityKey,
    resizableColumns,
    resizeKey,
    stickyHeader,
    stickyFirstColumn,
    pageSizeOptions,
    onCreate,
    onEdit,
    onDelete,
    can,
    canEditItem,
    createLabel = "New",
    canEdit,
    canDelete,
    allowDelete,
    confirmDelete,
    onDeleted,
    secondaryActions,
    allowCreate,
    allowEdit,
    formFields,
    renderForm: renderFormProp,
    formMode,
    formSteps,
    formLayout: formLayoutProp,
    mutationMode: mutationModeProp,
    bulkActions,
    renderCard: renderCardProp,
    openOnCardClick = false,
    renderTable: renderTableProp,
    gridCols: gridColsProp,
    keyboardNavigation = props.variant !== "embedded",
    capabilities,
    toolbar,
    emptyState,
    emptyIcon,
    emptyMessage,
    emptyDescription,
    header: headerMode = "page",
    resourceOptions,
    live,
    urlState: urlStateProp,
    defaultView = "table",
    onNavigate = defaultNavigate,
    viewSettingsKey: viewSettingsKeyProp,
    slots,
    slotProps,
    className,
  } = props;

  // ── Determine mode ──
  const isClientMode = !!resourceName;

  /**
   * Server-controlled mode is entered by supplying ANY of the controlled
   * props — presence is the switch, so a caller that only pages (no server
   * search) still gets its `data` left alone.
   */
  // `resource` mode paging through the provider: ResourcePage owns both the
  // fetch and the page state, and reuses the server-controlled path below
  // (no client-side transform, the pager under the list) with useResource's
  // setters standing in for the caller's callbacks.
  const resourceServerPaging = isClientMode && pagination === "server";
  // `pagination="cursor"`: pages load by cursor and append ("Load more").
  const resourceCursorPaging = isClientMode && pagination === "cursor";

  // ── URL state (`urlState`): the open record, search, sort and page ──
  // An adapter has `setSearchParams`; the options object wraps one.
  const url = useResourceUrlState(
    urlStateProp
      ? "setSearchParams" in urlStateProp
        ? { searchParams: urlStateProp }
        : urlStateProp
      : undefined,
  );
  // Read once: the URL seeds the list when it mounts, then follows it.
  const [urlSeed] = useState(() => {
    if (!url) return null;
    // A URL sort only counts when it names a sortable column: a hand-edited
    // or stale link must not send an arbitrary field to the provider.
    const sortable =
      !url.sort || !columnsProp
        ? true
        : columnsProp.some((col) =>
            typeof col === "string"
              ? col === url.sort!.field
              : col.key === url.sort!.field && col.sortable !== false,
          );
    return { q: url.q, sort: sortable ? url.sort : null, page: url.page };
  });
  // The URL names the open record only where there is a peek to open.
  const urlPeek = detail === "panel" || detail === "modal" ? url : undefined;
  const urlSortKey = urlSeed?.sort
    ? `${urlSeed.sort.field}:${urlSeed.sort.order}`
    : "";

  const isServerControlled =
    resourceServerPaging ||
    pageProp !== undefined ||
    perPageProp !== undefined ||
    onPageChange !== undefined ||
    onPerPageChange !== undefined ||
    onSortChange !== undefined ||
    onSearchChange !== undefined;

  const viewSettingsKey =
    viewSettingsKeyProp ??
    resourceName ??
    title.toLowerCase().replace(/\s+/g, "-");
  const { settings, updateSetting } = useViewSettings(viewSettingsKey);

  // Server search needs the columns to match. Without them the provider
  // would get a query it ignores, so the search box hides instead of lying.
  const serverSearchFields = resourceOptions?.searchFields ?? searchFields;

  // ── Client-side mode: call useResource (hook is always called for rules-of-hooks) ──
  // Core's useResource constrains its row type to BaseRecord (rows carry an
  // `id`), which is stricter than ResourcePage's public `T extends
  // Record<string, unknown>`. Intersect at the call site so the public
  // ResourcePageProps<T> generic stays unchanged while satisfying the hook.
  const resourceHook = useResource<T & BaseRecord>(
    resourceName ?? "__noop__",
    isClientMode
      ? {
          ...resourceOptions,
          // Client paging fetches everything it can in one request; server
          // paging starts at the user's stored page size. An explicit
          // `defaultPerPage` wins over both.
          defaultPerPage:
            resourceOptions?.defaultPerPage ??
            (resourceServerPaging
              ? (perPageProp ?? settings.pageSize)
              : clientRowLimit),
          searchFields: resourceServerPaging
            ? serverSearchFields
            : resourceOptions?.searchFields,
          // Paging, searching and sorting change the query key; keep the
          // current page on screen while the next one loads.
          keepPreviousData:
            resourceOptions?.keepPreviousData ?? resourceServerPaging,
          // Start where the URL says, so restoring a link doesn't push a
          // search or sort that resets the page to 1.
          ...(resourceServerPaging && urlSeed
            ? {
                defaultSearch: urlSeed.q,
                ...(urlSeed.page ? { defaultPage: urlSeed.page } : {}),
                ...(urlSeed.sort ? { defaultSort: urlSeed.sort } : {}),
              }
            : {}),
          ...writeModeOptions(resourceOptions, mutationModeProp),
          // Cursor paging reads through useInfiniteResource below; this hook
          // only writes.
          ...(resourceCursorPaging ? { enabled: false } : {}),
          live: resourceOptions?.live ?? live,
        }
      : { enabled: false },
  );
  const infinite = useInfiniteResource<T & BaseRecord>(resourceName ?? "__noop__", {
    enabled: resourceCursorPaging && (resourceOptions?.enabled ?? true),
    perPage: resourceOptions?.defaultPerPage ?? perPageProp ?? settings.pageSize,
    defaultSort: resourceOptions?.defaultSort,
    defaultFilters: resourceOptions?.defaultFilters,
    select: resourceOptions?.select,
    live: resourceOptions?.live ?? live,
  });

  /** Explicit prop beats the per-user stored preference. */
  const effectivePageSize = resourceServerPaging
    ? (resourceHook.params.pagination?.perPage ?? settings.pageSize)
    : (perPageProp ?? settings.pageSize);

  // ── Resolve display data ──
  const displayData: T[] = resourceCursorPaging
    ? infinite.rows
    : isClientMode
    ? (resourceHook.list.data?.data ?? [])
    : (dataProp ?? []);
  const displayTotal: number = resourceCursorPaging
    ? (infinite.total ?? infinite.rows.length)
    : isClientMode
    ? (resourceHook.list.data?.total ?? 0)
    : (totalProp ?? 0);
  // Client-side mode reads the hook it owns; server-data mode reads the
  // caller's `loading` / `error` props, defaulting to false so a page that
  // supplies neither renders exactly as it did before they existed.
  const isLoading = resourceCursorPaging
    ? infinite.query.isLoading
    : isClientMode
    ? resourceHook.list.isLoading
    : (loadingProp ?? false);
  const hasError = resourceCursorPaging
    ? infinite.query.isError
    : isClientMode
    ? resourceHook.list.isError
    : (errorProp ?? false);

  // ── Call useResourcePage ──
  const page = useResourcePage<T>({
    resource: resourceName,
    data: displayData,
    total: displayTotal,
    columns: columnsProp,
    statusFilter,
    searchFields,
    initialFilters:
      initialFilters ??
      (urlSeed && (urlSeed.q || urlSeed.sort)
        ? [
            ...(urlSeed.q
              ? [{ field: "__search__", operator: "contains" as const, value: urlSeed.q }]
              : []),
            ...(urlSeed.sort
              ? [{ field: "__sort__", operator: "eq" as const, value: urlSortKey }]
              : []),
          ]
        : undefined),
    onFiltersChange,
    defaultView,
    // Each page remembers its own table/cards choice, under the same key as
    // its density and page size — not one key shared by every data page.
    viewKey: viewSettingsKey,
    detail,
    titleField: titleFieldProp,
    subtitleField: subtitleFieldProp,
    controlled: isServerControlled,
  });

  // ── `pagination="server"`: push the filter row's state into useResource ──
  // Effects rather than the change handlers, so `initialFilters` and "Clear
  // all" reach the provider by the same path as a keystroke. Each push is
  // skipped while its value still equals what the hook already has, so the
  // first render does not reset `defaultSort` or refetch for nothing.
  const {
    setSearch: setResourceSearch,
    setSort: setResourceSort,
    setFilters: setResourceFilters,
  } = resourceHook;
  // Seeded from the URL, which useResource already starts on (see above).
  const pushedSearchRef = useRef(resourceServerPaging ? (urlSeed?.q ?? "") : "");
  const searchEffectRanRef = useRef(false);
  useEffect(() => {
    if (!resourceServerPaging) return;
    const firstRun = !searchEffectRanRef.current;
    searchEffectRanRef.current = true;
    if (page.search === pushedSearchRef.current) return;
    const push = () => {
      pushedSearchRef.current = page.search;
      setResourceSearch(page.search);
    };
    // One request per pause in typing, not per keystroke — but an
    // `initialFilters` search (first run) or a cleared box ("Clear all")
    // goes out at once, landing with the sort / status pushes instead of
    // 300ms behind them.
    if (firstRun || page.search === "") {
      push();
      return;
    }
    const timer = setTimeout(push, 300);
    return () => clearTimeout(timer);
  }, [resourceServerPaging, page.search, setResourceSearch]);

  const defaultSort = resourceOptions?.defaultSort;
  const pushedSortRef = useRef<string>(resourceServerPaging ? urlSortKey : "");
  useEffect(() => {
    if (!resourceServerPaging) return;
    const key = page.sort ? `${page.sort.field}:${page.sort.order}` : "";
    if (key === pushedSortRef.current) return;
    pushedSortRef.current = key;
    // Clearing the sort returns to the resource's default order, not to
    // whatever order the provider happens to use.
    setResourceSort(page.sort ?? defaultSort);
  }, [resourceServerPaging, page.sort, defaultSort, setResourceSort]);

  const statusField = statusFilter
    ? typeof statusFilter === "string"
      ? statusFilter
      : statusFilter.field
    : undefined;
  const defaultFilters = resourceOptions?.defaultFilters;
  const pushedStatusRef = useRef<string>("");
  useEffect(() => {
    if (!resourceServerPaging || !statusField) return;
    // `defaultFilters` is part of the key: useResource re-syncs its filters
    // to a changed `defaultFilters` (dropping the status filter), so a
    // change there must re-push even when the chips did not move.
    const key = JSON.stringify([page.statusValue, defaultFilters ?? null]);
    if (key === pushedStatusRef.current) return;
    pushedStatusRef.current = key;
    setResourceFilters([
      ...(defaultFilters ?? []),
      ...(page.statusValue.length > 0
        ? [{ field: statusField, operator: "in" as const, value: page.statusValue }]
        : []),
    ]);
  }, [
    resourceServerPaging,
    statusField,
    page.statusValue,
    defaultFilters,
    setResourceFilters,
  ]);

  // ── `pagination="client"`: say so when the resource outgrew the fetch ──
  const clientTruncated =
    isClientMode &&
    !resourceServerPaging &&
    !resourceCursorPaging &&
    !isLoading &&
    !hasError &&
    displayTotal > displayData.length;
  const warnedTruncatedRef = useRef(false);
  useEffect(() => {
    if (!clientTruncated || warnedTruncatedRef.current) return;
    warnedTruncatedRef.current = true;
    console.warn(
      `ResourcePage: "${resourceName}" has ${displayTotal} rows but only ${displayData.length} were fetched. ` +
        `Pass \`pagination="server"\` to page through all of them, or raise \`clientRowLimit\` ` +
        `(no higher than the provider's \`maxPerPage\`, which refuses a larger page).`,
    );
  }, [clientTruncated, resourceName, displayTotal, displayData.length]);
  // ── Build ResourceActions for column render functions ──
  // `refetch` is stable; the query results around it are new each render.
  const refetchList = resourceHook.list.refetch;
  const refetchInfinite = infinite.query.refetch;
  const actions: ResourceActions<T> = useMemo(() => {
    if (isClientMode) {
      return {
        update: resourceHook.update as ResourceActions<T>["update"],
        remove: resourceHook.remove,
        refetch: () => (resourceCursorPaging ? refetchInfinite() : refetchList()),
      };
    }
    return {
      update: async () => {
        throw new Error(
          "ResourceActions.update not available in server-data mode",
        );
      },
      remove: async () => {
        throw new Error(
          "ResourceActions.remove not available in server-data mode",
        );
      },
      refetch: () => {
        /* no-op in server-data mode */
      },
    };
  }, [
    isClientMode,
    resourceHook.update,
    resourceHook.remove,
    refetchList,
    resourceCursorPaging,
    refetchInfinite,
  ]);

  // ── Row identity ──
  const keyOf = useCallback(
    (item: T): string =>
      getKeyProp ? getKeyProp(item) : String((item as Record<string, unknown>).id ?? ""),
    [getKeyProp],
  );

  // ── The peek's row, kept live ──
  // `page.selectedItem` is a snapshot taken at click time. Re-resolving it by
  // key against the current rows means a save (which refetches) shows its
  // new values in the open peek instead of the pre-edit copy. A row missing
  // from the current rows keeps the snapshot: paging, sorting, search and
  // filters all drop rows that still exist. A confirmed delete closes the
  // peek itself (`performDelete`).
  // An empty key (rows with no `id` and no `getKey`) identifies nothing, so
  // it keeps the snapshot rather than matching the first keyless row.
  // With `urlState` the URL names the open record (`?id=`): a link opens it,
  // and Back closes it. The click-time snapshot still covers a record that
  // isn't in the current rows.
  const snapshotKey = page.selectedItem ? keyOf(page.selectedItem) : null;
  const selectedKey = urlPeek ? urlPeek.detailId : snapshotKey;
  const snapshot =
    page.selectedItem && snapshotKey === selectedKey ? page.selectedItem : null;
  const rowOrSnapshot: T | null = !selectedKey
    ? snapshot
    : (displayData.find((row) => keyOf(row) === selectedKey) ?? snapshot);
  // A linked record that isn't in the loaded rows (another page, outside the
  // search) is fetched on its own; one that can't be read shows as missing.
  const linkedId = urlPeek && selectedKey && !rowOrSnapshot ? selectedKey : null;
  const linked = useOne<T & BaseRecord>(resourceName ?? "__noop__", linkedId, {
    enabled: isClientMode && !!linkedId,
  });
  const selectedItem: T | null =
    rowOrSnapshot ?? (linkedId && linked.data ? (linked.data as T) : null);
  // Missing only when that is known: the fetch failed (resource mode), or
  // `data` is the whole set (data mode without server paging). A record
  // absent from one server-controlled page may be on another.
  const linkMissing =
    !!linkedId &&
    !selectedItem &&
    !isLoading &&
    (isClientMode ? linked.isError : !isServerControlled);
  const detailOpen = urlPeek ? selectedItem !== null || linkMissing : page.detailOpen;

  // ── Bulk selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === page.data.length) return new Set();
      return new Set(page.data.map(keyOf));
    });
  }, [page.data, keyOf]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Built-in form state ──
  const [formOpen, setFormOpen] = useState(false);
  const [formAction, setFormAction] = useState<"create" | "edit">("create");
  const [formItem, setFormItem] = useState<T | null>(null);

  // Determine if built-in form should handle create/edit
  const useBuiltInCreate = allowCreate && !onCreate && isClientMode;
  const useBuiltInEdit = allowEdit && !onEdit && isClientMode;

  const handleCreate = useCallback(() => {
    if (useBuiltInCreate) {
      setFormAction("create");
      setFormItem(null);
      setFormOpen(true);
    } else if (onCreate) {
      onCreate();
    }
  }, [useBuiltInCreate, onCreate]);

  // One permission check: `can`, then the deprecated per-row predicates.
  const allows = useCallback(
    (action: ResourceAction, item?: T): boolean => {
      if (can && !can(action, item)) return false;
      if (!item) return true;
      if (canEditItem && !canEditItem(item)) return false;
      if (action === "edit" && canEdit && !canEdit(item)) return false;
      if (action === "delete" && canDelete && !canDelete(item)) return false;
      return true;
    },
    [can, canEditItem, canEdit, canDelete],
  );

  const handleEdit = useCallback(
    (item: T) => {
      if (!allows("edit", item)) return;
      if (useBuiltInEdit) {
        setFormAction("edit");
        setFormItem(item);
        setFormOpen(true);
      } else if (onEdit) {
        onEdit(item);
      }
    },
    [useBuiltInEdit, onEdit, allows],
  );

  const closeDetail = useCallback(() => {
    page.setDetailOpen(false);
    page.setSelectedItem(null);
    urlPeek?.setDetailId(null);
  }, [page, urlPeek]);

  // ── Delete: built-in, confirmed, or the caller's as-is ──
  const useBuiltInDelete = !!allowDelete && !onDelete && isClientMode;
  const deleteConfirmed =
    confirmDelete === undefined ? useBuiltInDelete : !!confirmDelete;
  const deleteCopy =
    typeof confirmDelete === "object" ? confirmDelete : undefined;
  // The row being confirmed, kept after the dialog closes so its copy does
  // not flip to the defaults during the exit animation; `deleteOpen` is what
  // actually opens and closes it.
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { remove: removeRecord } = resourceHook;
  // A recycle-bin resource says so in the confirm step instead of "can't be undone".
  const { data: providerCaps } = useCapabilities(resourceName, {
    enabled: useBuiltInDelete && deleteConfirmed,
  });
  const deleteKind: "recycle" | "permanent" = providerCaps?.softDelete ? "recycle" : "permanent";

  const performDelete = useCallback(
    async (item: T) => {
      if (useBuiltInDelete) {
        // A caller-supplied `getKey` (e.g. `encodeRecordKey` for a composite
        // key) is the row's identity to the provider too; otherwise `id`.
        await removeRecord(
          (getKeyProp
            ? keyOf(item)
            : (item as Record<string, unknown>).id) as Identifier,
        );
      } else if (onDelete) {
        await onDelete(item);
      }
      closeDetail();
      onDeleted?.(item);
    },
    [
      useBuiltInDelete,
      removeRecord,
      getKeyProp,
      keyOf,
      onDelete,
      closeDetail,
      onDeleted,
    ],
  );

  const deleteHandler: ((item: T) => void) | undefined = !(
    useBuiltInDelete || onDelete
  )
    ? undefined
    : deleteConfirmed
      ? (item: T) => {
          setPendingDelete(item);
          setDeleteOpen(true);
        }
      : useBuiltInDelete
        ? (item: T) => {
            performDelete(item).catch((err: unknown) => {
              // useResource has already handed the failure to
              // `resourceOptions.onError`; without one, the user is told.
              if (!resourceOptions?.onError) {
                toast.error(err instanceof Error ? err.message : "The delete failed.");
              }
            });
          }
        : // Unconfirmed `onDelete` keeps its original contract exactly:
          // called straight from the peek, nothing closed for it.
          (item: T) => {
            // A throw or a rejected promise is reported, never left unhandled,
            // even when `onError` itself throws (the toast is the fallback).
            const report = (err: unknown) => {
              const error = err instanceof Error ? err : new Error(String(err));
              if (resourceOptions?.onError) {
                try {
                  resourceOptions.onError(error);
                  return;
                } catch {
                  // fall through to the toast
                }
              }
              toast.error(error.message || "The delete failed.");
            };
            // Called right away, as before; a throw or a rejection is reported.
            try {
              Promise.resolve(onDelete?.(item)).catch(report);
            } catch (err) {
              report(err);
            }
          };

  // Per-row rights, evaluated against the row the peek is showing.
  const selectedEditable = !!selectedItem && allows("edit", selectedItem);
  const selectedDeletable = !!selectedItem && allows("delete", selectedItem);

  // ── Patch tableColumns to use real actions (client-side mode) ──
  const tableColumns = useMemo(() => {
    const base = isClientMode
      ? page.columns.map((col) => ({
          key: col.key,
          header: col.header ?? col.key,
          sortable: col.sortable ?? true,
          hideBelow: col.hideBelow,
          width: col.width,
          minWidth: col.minWidth,
          defaultVisible: col.defaultVisible,
          editable: col.editable,
          accessor: col.accessor,
          render: col.render
            ? (item: T, value: unknown) => col.render!(item, value, actions)
            : undefined,
        }))
      : page.tableColumns;
    if (!isServerControlled) return base;
    // The server owns the ordering. DataTable's header sort is client-side
    // and would only reorder the rows of the current page — a visibly wrong
    // answer presented as a sort — so the affordance is withdrawn rather
    // than left to lie. The DataFilters sort control drives `onSortChange`.
    return base.map((col) => ({ ...col, sortable: false }));
  }, [
    isClientMode,
    isServerControlled,
    page.columns,
    page.tableColumns,
    actions,
  ]);

  // ── Client mode: DataTable's header sort is `page.sort` ──
  // The primary header sort is the page's sort (and so the URL's); Shift-
  // click tie-breakers are kept here while that primary still matches, and
  // dropped when the sort changes elsewhere (the sort select, the URL).
  const [tableTieBreaks, setTableTieBreaks] = useState<{
    primary: string;
    rest: DataTableSort[];
  } | null>(null);
  const pageSort = page.sort;
  const setPageSort = page.setSort;
  const tableSort = useMemo<DataTableSort[]>(() => {
    if (!pageSort) return [];
    const primary: DataTableSort = { key: pageSort.field, dir: pageSort.order };
    const rest =
      tableTieBreaks && tableTieBreaks.primary === `${primary.key}:${primary.dir}`
        ? tableTieBreaks.rest
        : [];
    // Only the table's own columns: a sort-select option or a URL sort on a
    // field the table doesn't show still orders the rows (page.sort), but is
    // not a header sort.
    return [primary, ...rest].filter((s) => tableColumns.some((c) => c.key === s.key));
  }, [pageSort, tableTieBreaks, tableColumns]);
  const handleTableSort = useCallback(
    (next: DataTableSort[]) => {
      const [primary, ...rest] = next;
      setTableTieBreaks(primary ? { primary: `${primary.key}:${primary.dir}`, rest } : null);
      setPageSort(primary ? { field: primary.key, order: primary.dir } : null);
    },
    [setPageSort],
  );

  // ── Server-driven pager state, needed above for handleSearchChange's
  // already-on-page-1 check. ──
  // The pager's inputs: the caller's controlled props, or — for
  // `pagination="server"` — useResource's own page state.
  const pagerPage = resourceServerPaging
    ? (resourceHook.params.pagination?.page ?? 1)
    : pageProp;
  const pagerPerPage = resourceServerPaging
    ? resourceHook.params.pagination?.perPage
    : perPageProp;
  const pagerTotal = resourceServerPaging ? displayTotal : totalProp;
  const pagerOnPageChange = resourceServerPaging
    ? resourceHook.setPage
    : onPageChange;
  const currentPage = pagerPage ?? 1;

  // ── `urlState`: write search, sort and (server paging) page back ──
  // Replace-only, so Back steps through opened records rather than every
  // keystroke; an unchanged URL is not rewritten.
  const writeUrl = url?.write;
  useEffect(() => {
    writeUrl?.({
      q: page.search,
      sort: page.sort,
      ...(resourceServerPaging ? { page: currentPage } : {}),
    });
  }, [writeUrl, page.search, page.sort, currentPage, resourceServerPaging]);

  // ── Filter changes: keep the controlled UI state, and tell the server ──
  // In client-side mode these are exactly the hook's own setters; in
  // server-controlled mode they additionally notify the caller and reset to
  // page 1, since the previous page number is meaningless against a new
  // query. The reset is skipped when already on page 1 — nothing changed,
  // so there is nothing for the caller to do.
  const handleSearchChange = useCallback(
    (value: string) => {
      page.filterConfig.onSearchChange(value);
      if (!isServerControlled) return;
      onSearchChange?.(value);
      // `pagination="server"`: useResource's setSearch resets the page
      // itself once the debounce settles; resetting here too would fetch
      // page 1 of the OLD query first.
      if (currentPage !== 1 && !resourceServerPaging) onPageChange?.(1);
    },
    [
      page.filterConfig,
      isServerControlled,
      onSearchChange,
      onPageChange,
      resourceServerPaging,
      currentPage,
    ],
  );

  const handleSortSelect = useCallback(
    (value: string) => {
      page.filterConfig.onSortChange(value);
      if (!isServerControlled) return;
      const [field, order] = value.split(":");
      onSortChange?.(
        field && (order === "asc" || order === "desc")
          ? { field, order }
          : null,
      );
      // See handleSearchChange: useResource's setSort resets the page.
      if (!resourceServerPaging) onPageChange?.(1);
    },
    [
      page.filterConfig,
      isServerControlled,
      onSortChange,
      onPageChange,
      resourceServerPaging,
    ],
  );

  const handleClearFilters = useCallback(() => {
    page.clearFilters();
    if (!isServerControlled) return;
    // Clearing has to reach the server too — otherwise "Clear all" empties
    // the controls and leaves the same rows on screen.
    onSearchChange?.("");
    onSortChange?.(null);
    if (!resourceServerPaging) onPageChange?.(1);
  }, [
    page,
    isServerControlled,
    onSearchChange,
    onSortChange,
    onPageChange,
    resourceServerPaging,
  ]);

  // ── Status-chip changes: same page-1 reset as search/sort ──
  // In server-controlled mode `useResourcePage` skips client-side status
  // filtering, so a status change only reaches the caller through
  // `onFiltersChange`. Nothing else calls `onPageChange(1)` for it, so
  // selecting a more restrictive status while on page 3 could otherwise
  // fetch page 3 of the new result set and render an empty page while the
  // matching rows sit on page 1. Guarded the same way as
  // `handleSearchChange`, and not reachable from `handleClearFilters`
  // (which already does its own single reset).
  const handleStatusChange = useCallback(
    (values: string[]) => {
      page.filterConfig.statusChips?.onChange(values);
      if (!isServerControlled) return;
      if (currentPage !== 1 && !resourceServerPaging) onPageChange?.(1);
    },
    [
      page.filterConfig,
      isServerControlled,
      onPageChange,
      resourceServerPaging,
      currentPage,
    ],
  );

  const statusChipsConfig = useMemo(() => {
    const base = page.filterConfig.statusChips;
    if (!base) return undefined;
    return { ...base, onChange: handleStatusChange };
  }, [page.filterConfig.statusChips, handleStatusChange]);

  const handlePageSizeChange = useCallback(
    (size: number) => {
      updateSetting("pageSize", size);
      onPerPageChange?.(size);
      // useResource's setPerPage resets to page 1 itself.
      if (resourceServerPaging) resourceHook.setPerPage(size);
      else if (isServerControlled) onPageChange?.(1);
    },
    [
      updateSetting,
      onPerPageChange,
      resourceServerPaging,
      resourceHook.setPerPage,
      isServerControlled,
      onPageChange,
    ],
  );

  // ── Pagination-config error ──
  // `perPage` AND `total` are both required whenever `onPageChange` is
  // supplied. Neither can be derived from the other, and neither can be
  // derived from the rows:
  //   - `perPage`: see the prop doc on `perPage`. A short final page has
  //     fewer rows than the page size, so the row count of a page cannot
  //     stand in for the page size.
  //   - `total`: `displayTotal` falls back to `0` (Line 453). With `total`
  //     omitted the range span reads "No records" and `Next` stays
  //     disabled, while `page.data` renders rows directly below it. A
  //     surface that says "no records" above visible records is a lie, not
  //     a degraded view.
  // Rather than silently guess either one, the pager below refuses to
  // render and shows the error instead. Logged once per mount (not on
  // every render) so it's visible in a console without spamming it.
  const missingPerPage =
    isServerControlled && !!pagerOnPageChange && pagerPerPage === undefined;
  const missingTotal =
    isServerControlled && !!pagerOnPageChange && pagerTotal === undefined;
  const pagerMisconfigured = missingPerPage || missingTotal;
  const missingPagerProps = [
    ...(missingPerPage ? ["perPage"] : []),
    ...(missingTotal ? ["total"] : []),
  ];
  const loggedMissingPerPageRef = useRef(false);
  useEffect(() => {
    if (!pagerMisconfigured) return;
    if (loggedMissingPerPageRef.current) return;
    loggedMissingPerPageRef.current = true;
    console.error(
      `ResourcePage: ${missingPagerProps
        .map((name) => `\`${name}\``)
        .join(" and ")} ${
        missingPagerProps.length > 1 ? "are" : "is"
      } required when \`onPageChange\` is supplied.`,
    );
    // `missingPagerProps` is derived from `pagerMisconfigured`'s own inputs
    // and the ref makes this run at most once, so it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagerMisconfigured]);

  // ── Server-driven pager math ──
  // By the time the pager renders, `pagerMisconfigured` has already gated
  // it off, so `perPageProp` and `totalProp` are both present here.
  const pagerPageSize = pagerPerPage ?? effectivePageSize;
  const totalPages = Math.max(
    1,
    Math.ceil(displayTotal / Math.max(1, pagerPageSize)),
  );
  const rangeFrom =
    page.data.length === 0 ? 0 : (currentPage - 1) * pagerPageSize + 1;
  const rangeTo = rangeFrom === 0 ? 0 : rangeFrom + page.data.length - 1;

  // ── `pagination="server"`: never strand the user past the last page ──
  // Deleting the last row of the last page (or any shrink in `total`) would
  // otherwise leave `page` beyond the end: the list comes back empty, the
  // shell swaps in its empty state — pager included — and there is no way
  // back. Step back to the real last page instead.
  const { setPage: setResourcePage } = resourceHook;
  const settledPage =
    !isLoading && !hasError && !resourceHook.list.isPlaceholderData;
  useEffect(() => {
    if (!resourceServerPaging || !settledPage) return;
    if (currentPage > totalPages) setResourcePage(totalPages);
  }, [resourceServerPaging, settledPage, currentPage, totalPages, setResourcePage]);

  // ── Detail title/subtitle values ──
  const titleOf = (item: T): string =>
    getTitle
      ? getTitle(item)
      : String((item as Record<string, unknown>)[page.titleField] ?? "");
  const detailTitle = selectedItem ? titleOf(selectedItem) : "";
  const detailSubtitle = !selectedItem
    ? undefined
    : getSubtitle
      ? getSubtitle(selectedItem)
      : page.subtitleField
        ? String(
            (selectedItem as Record<string, unknown>)[page.subtitleField] ?? "",
          )
        : undefined;

  // ── Row click handler (route mode navigates) ──
  const handleRowClick = (item: T) => {
    if (detail === "route") {
      // Navigate to /{resource}/{id}
      const id = (item as Record<string, unknown>).id;
      if (resourceName && id) {
        onNavigate(`/${resourceName}/${id}`);
      }
      return;
    }
    page.handleRowClick(item);
    urlPeek?.setDetailId(keyOf(item));
  };

  // ── Keyboard navigation (j/k, Enter, Backspace, x) ──
  // Only engaged for grid/list views: table view runs its own independent
  // client-side sort + pagination (DataTable), so a flat index into
  // `page.data` can't reliably be mapped back onto its currently-visible,
  // possibly differently-ordered rows.
  const hasBulkSelect = !!bulkActions && bulkActions.length > 0;
  // A detail panel/modal or the built-in form is covering the list. Cursor
  // keys suspend (they'd otherwise drive the list behind the overlay, and
  // Enter would re-open the row instead of activating the focused control);
  // ⌫ stays live so it can dismiss the overlay.
  const overlayOpen = detailOpen || formOpen || deleteOpen;
  const keyboardNav = useKeyboardNavigation({
    itemCount: page.data.length,
    enabled: keyboardNavigation && page.viewMode !== "table",
    overlayOpen,
    onOpen: (index) => {
      const item = page.data[index];
      if (item) handleRowClick(item);
    },
    onToggleSelect: hasBulkSelect
      ? (index) => {
          const item = page.data[index];
          if (item) {
            handleToggleSelect(keyOf(item));
          }
        }
      : undefined,
    // Supplied only while there is an open detail to close — the hook
    // suppresses Backspace's default whenever this is present, so leaving it
    // wired up permanently would swallow the browser/app's Backspace on
    // every grid/list page (including detail="none" and detail="route",
    // which never open one). `detailOpen` is only ever true for the panel
    // and modal modes, so it is the precise precondition here.
    onBack: detailOpen ? closeDetail : undefined,
  });

  // `pagination="cursor"`: the "Load more" footer's state.
  const infinitePages = infinite.query.data?.pages;
  const loadMore = resourceCursorPaging
    ? {
        hasMore: infinite.hasNextPage,
        loading: infinite.isFetchingNextPage,
        load: infinite.fetchNextPage,
        loaded: infinite.rows.length,
        // Rows the latest "Load more" added; 0 before the first one.
        lastLoaded:
          infinitePages && infinitePages.length > 1
            ? infinitePages[infinitePages.length - 1]!.data.length
            : 0,
      }
    : undefined;

  // ── Create button ──

  return {
    actions,
    allows,
    clientTruncated,
    loadMore,
    closeDetail,
    currentPage,
    deleteConfirmed,
    deleteCopy,
    deleteHandler,
    deleteKind,
    deleteOpen,
    detailOpen,
    detailSubtitle,
    detailTitle,
    displayData,
    displayTotal,
    effectivePageSize,
    formAction,
    formItem,
    formOpen,
    handleClearFilters,
    handleClearSelection,
    handleCreate,
    handleEdit,
    handlePageSizeChange,
    handleRowClick,
    handleSearchChange,
    handleSortSelect,
    handleTableSort,
    handleToggleAll,
    handleToggleSelect,
    hasError,
    isClientMode,
    isLoading,
    isServerControlled,
    keyOf,
    keyboardNav,
    linkMissing,
    linked,
    missingPagerProps,
    page,
    pagerMisconfigured,
    pagerOnPageChange,
    pendingDelete,
    performDelete,
    rangeFrom,
    rangeTo,
    resourceHook,
    resourceServerPaging,
    selectedDeletable,
    selectedEditable,
    selectedIds,
    selectedItem,
    serverSearchFields,
    setDeleteOpen,
    setFormOpen,
    settings,
    statusChipsConfig,
    tableColumns,
    tableSort,
    titleOf,
    totalPages,
    updateSetting,
    useBuiltInCreate,
    useBuiltInDelete,
    useBuiltInEdit,
  };
}

/**
 * What {@link useResourceTable} returns: the list's rows and the handlers a
 * custom layout wires to its controls.
 *
 * @stability Beta
 */
export interface ResourceTableState<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  // ── Rows ──
  /**
   * The rows to show: filtered and sorted. With `pagination="client"` this
   * is every matching row (page it yourself); with server paging it is the
   * current page.
   */
  rows: T[];
  /**
   * How many rows match, across all pages. With `pagination="cursor"` it is
   * the server's count while no search or status filter is active; with one,
   * only loaded rows are filtered, so it counts the loaded rows that match.
   */
  total: number;
  loading: boolean;
  /** The read failed. */
  error: boolean;
  /** True when more than `clientRowLimit` rows exist and only that many were loaded. */
  truncated: boolean;
  /**
   * `pagination="cursor"`: whether more rows can be loaded, whether a page
   * is loading, and `load()` to append the next page. Undefined otherwise.
   */
  loadMore?: {
    hasMore: boolean;
    loading: boolean;
    load: () => void;
    /** Rows loaded so far. */
    loaded: number;
    /** Rows the latest load added (0 before the first "Load more"). */
    lastLoaded: number;
  };
  /** The columns, resolved to DataTable's format. */
  columns: DataTableColumn<T>[];
  /** Write actions for cell renderers (update, remove, …). */
  actions: ResourceActions<T>;
  /** A row's identity: `getKey`, else its `id`. */
  getKey: (item: T) => string;
  /** A row's title: `getTitle`, else its title field. */
  getTitle: (item: T) => string;
  /** The page's permission check (`can`, then the deprecated per-row predicates). */
  can: (action: ResourceAction, item?: T) => boolean;

  // ── Search, sort and filters ──
  search: string;
  setSearch: (value: string) => void;
  /** Sort keys, primary first. */
  sort: DataTableSort[];
  setSort: (sort: DataTableSort[]) => void;
  /** The status filter's choices, its selected values and its setter, when the list has one. */
  statusFilter:
    | { options: string[]; selected: string[]; onChange: (values: string[]) => void }
    | undefined;
  hasActiveFilters: boolean;
  clearFilters: () => void;

  // ── Paging (server or caller-controlled paging) ──
  /** The current page, from 1. */
  page: number;
  pageCount: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  /** Go to a page; undefined when the page is not controlled (client paging). */
  setPage: ((page: number) => void) | undefined;
  /** The 1-based range of the rows shown, for "21–40 of 95"; 0 when empty. */
  rangeFrom: number;
  rangeTo: number;

  // ── Selection ──
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;

  // ── The open record ──
  /** The open row, kept current as the data changes. */
  openItem: T | null;
  detailOpen: boolean;
  /** What clicking a row does: opens the peek, modal or route. */
  openRow: (item: T) => void;
  closeDetail: () => void;
  /** A record linked by URL that does not exist (or was deleted). */
  openItemMissing: boolean;

  // ── Create and edit ──
  /** Undefined when the page cannot create. */
  create: (() => void) | undefined;
  edit: (item: T) => void;
  /** The built-in form's state, for rendering your own form. */
  form: {
    open: boolean;
    setOpen: (open: boolean) => void;
    action: "create" | "edit";
    /** The row being edited; null when creating. */
    item: T | null;
  };

  // ── Delete ──
  /** Delete a row: asks first when the delete is confirmed. Undefined when the page cannot delete. */
  remove: ((item: T) => void) | undefined;
  /** The confirm step's state, when `remove` asks first. */
  deleteConfirm: {
    open: boolean;
    setOpen: (open: boolean) => void;
    /** The row being confirmed (kept through the close animation). */
    item: T | null;
    /** Run the delete; rejects with the failure. */
    confirm: () => Promise<void>;
    /** "recycle" when the provider soft-deletes, so the copy can say it can be restored. */
    kind: "recycle" | "permanent";
    copy: ResourceDeleteConfirmCopy<T> | undefined;
  };
}

/**
 * The list behind {@link ResourcePage}, without any markup: where the rows
 * come from (a `resource` through the data provider, or `data` you pass),
 * search, sort, status filter and paging, selection, the open record (and
 * its URL state), the built-in create/edit form and confirmed delete, and
 * the row handlers. Takes the same options as `ResourcePage`.
 *
 * Use it to build a different layout over the same behaviour; `ResourcePage`
 * itself is this behaviour plus Genesis's markup.
 *
 * @stability Beta
 */
export function useResourceTable<
  T extends Record<string, unknown> = Record<string, unknown>,
>(props: ResourcePageProps<T>): ResourceTableState<T> {
  const m = useResourceTableModel<T>(props);
  const { pendingDelete, performDelete } = m;
  const confirm = useCallback(
    () => (pendingDelete ? performDelete(pendingDelete) : Promise.resolve()),
    [pendingDelete, performDelete],
  );
  return {
    rows: m.page.data,
    total:
      m.loadMore && m.page.search === "" && m.page.statusValue.length === 0
        ? m.displayTotal
        : m.page.total,
    loading: m.isLoading,
    error: m.hasError,
    truncated: m.clientTruncated,
    // Present only with `pagination="cursor"`.
    ...(m.loadMore ? { loadMore: m.loadMore } : {}),
    columns: m.tableColumns,
    actions: m.actions,
    getKey: m.keyOf,
    getTitle: m.titleOf,
    can: m.allows,
    search: m.page.search,
    setSearch: m.handleSearchChange,
    sort: m.tableSort,
    setSort: m.handleTableSort,
    statusFilter: m.statusChipsConfig,
    hasActiveFilters: m.page.hasActiveFilters,
    clearFilters: m.handleClearFilters,
    page: m.currentPage,
    pageCount: m.totalPages,
    pageSize: m.effectivePageSize,
    setPageSize: m.handlePageSizeChange,
    setPage: m.pagerOnPageChange,
    rangeFrom: m.rangeFrom,
    rangeTo: m.rangeTo,
    selectedIds: m.selectedIds,
    toggleSelected: m.handleToggleSelect,
    toggleAll: m.handleToggleAll,
    clearSelection: m.handleClearSelection,
    openItem: m.selectedItem,
    detailOpen: m.detailOpen,
    openRow: m.handleRowClick,
    closeDetail: m.closeDetail,
    openItemMissing: m.linkMissing,
    create: m.useBuiltInCreate || props.onCreate ? m.handleCreate : undefined,
    edit: m.handleEdit,
    form: {
      open: m.formOpen,
      setOpen: m.setFormOpen,
      action: m.formAction,
      item: m.formItem,
    },
    remove: m.deleteHandler,
    deleteConfirm: {
      open: m.deleteOpen,
      setOpen: m.setDeleteOpen,
      item: pendingDelete,
      confirm,
      kind: m.deleteKind,
      copy: m.deleteCopy,
    },
  };
}
