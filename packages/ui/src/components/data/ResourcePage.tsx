"use client";

import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { LucideIcon } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "../ui/button";
import { DataPageShell } from "./DataPageShell";
import {
  DataFilters,
  type SavedViewItem,
  type DataFilterConfig,
} from "./DataFilters";
import { DataTable } from "./DataTable";
import { DataBulkBar } from "./DataBulkBar";
import { DataGrid } from "./DataGrid";
import { DetailPanel } from "./DetailPanel";
import { ResourceForm } from "./ResourceForm";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import type { ViewMode } from "../patterns/view-toggle";
import {
  useResource,
  type UseResourceOptions,
} from "@marktiderman/genesis-core/hooks";
import {
  useResourcePage,
  type ResourceColumnDef,
  type ResourceActions,
} from "../../hooks/use-resource-page";
import { useViewSettings } from "../../hooks/use-view-settings";
import { useKeyboardNavigation } from "../../hooks/use-keyboard-navigation";
import type {
  BaseRecord,
  FilterParam,
  SortParam,
} from "@marktiderman/genesis-core/provider";
import type { ResourceFormFieldDef } from "./ResourceFormField";
import type { WizardStep } from "@marktiderman/genesis-core/hooks";
import { defaultNavigate, type NavigateFn } from "../../navigation";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Row-bound actions handed to `renderCard`, on top of the resource-wide
 * `ResourceActions`. `open` is per-row, which is why it lives here rather
 * than on `ResourceActions` — that object is built once and shared by every
 * row and column, so it cannot carry a row-specific callback.
 *
 * @stability Beta
 */
export interface ResourceCardActions<T> extends ResourceActions<T> {
  /**
   * Activate this row — opens the configured detail panel / modal / route,
   * exactly as clicking the built-in card does. Wire it to your card's
   * `onClick` (and call `stopPropagation` on any nested control that should
   * not also activate the row).
   */
  open: () => void;
}

/**
 * Config-driven resource page: wires data-fetching (or a pre-fetched `data`
 * array), search/filter/sort, table/grid/list views, and a detail
 * panel/modal/route around a `DataProvider` resource — the CRUD page most
 * apps hand-roll, expressed as one component tree. `renderCard` lets a
 * consumer fully own item presentation while ResourcePage keeps handling
 * data-fetching, filtering, and layout; see also the built-in
 * `useKeyboardNavigation` wiring (`keyboardNavigation` prop) and `gridCols`.
 *
 * Three levels of control, and each option is available at all three:
 *
 * 1. **The primitive offers it** — table / grid / list views, search, sort,
 *    status chips, column visibility and resizing, density, page size,
 *    detail panel / modal / route, built-in create and edit forms.
 * 2. **The instance turns it on or off** — every one of those is a prop, so
 *    a given page decides which affordances it offers at all.
 * 3. **The end user picks their own, and it sticks** — for the options left
 *    on at level 2, the user's choice persists to their own storage:
 *    `viewSettingsKey` for page size and density, `columnVisibilityKey` and
 *    `resizeKey` for column layout, `savedViews` (pair with `useSavedViews`)
 *    for named filter sets. Persistence needs a key; without one the choice
 *    lasts only for the session.
 *
 * A server-paginated list drives the same component through the controlled
 * props (`page`, `perPage`, `onPageChange`, `onSortChange`, `onSearchChange`
 * and friends) — supplying any of them stops ResourcePage from searching,
 * sorting or paging the `data` a second time. See that block in
 * {@link ResourcePageProps}.
 *
 * @stability Beta
 */
export interface ResourcePageProps<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  // Data source — one or the other
  /** Client-side mode: resource name passed to useResource / DataProvider. */
  resource?: string;
  /** Server-data mode: pre-fetched data array. */
  data?: T[];
  /**
   * Server-data mode: total record count (before client-side filtering).
   *
   * Required whenever `onPageChange` is supplied. It cannot be derived from
   * `data`, which holds only the current page. Omitted, `displayTotal` falls
   * back to `0`, so the range span reads "No records" and `Next` stays
   * disabled while the rows render directly below it. Rather than show a
   * pager that contradicts the list, the component refuses to render the
   * pager and shows an error instead. See {@link perPage} and
   * {@link onPageChange}.
   */
  total?: number;

  // Page chrome
  title: string;
  /** Page subtitle shown below the title. */
  subtitle?: string;
  icon?: LucideIcon;

  // Columns — optional, string shorthand supported
  columns?: Array<string | ResourceColumnDef<T>>;

  // Detail view
  /** How row-click detail is shown. Default "panel". */
  detail?: "panel" | "modal" | "route" | "none";
  detailWidth?: "sm" | "md" | "lg";
  titleField?: string;
  subtitleField?: string;
  renderDetail?: (item: T) => ReactNode;
  detailFields?: Array<{
    key: string;
    label: string;
    render?: (value: unknown, item: T) => ReactNode;
  }>;

  // Filters
  /**
   * Adds a status-chip filter. There is no dedicated status-change
   * callback: chip clicks update the same filter state that already
   * reports through `onFiltersChange`, whether or not the page is in
   * server-controlled mode. A caller combining `statusFilter` with server
   * pagination (`onPageChange` et al.) must supply `onFiltersChange` — see
   * that prop — or status changes will update the chip UI without ever
   * reaching the server. In server-controlled mode a status change also
   * resets to page 1 via `onPageChange(1)` — see {@link onPageChange}.
   */
  statusFilter?: string | { field: string; options?: string[] };
  searchFields?: string[];
  searchPlaceholder?: string;
  initialFilters?: FilterParam[];
  onFiltersChange?: (filters: FilterParam[]) => void;
  /**
   * Extra multi-select filter comboboxes, handed straight to `DataFilters`
   * and rendered beside the status chips. Each config owns its own
   * `selected` array and `onChange` — ResourcePage never reads or writes
   * them, because it cannot know what a caller's "Grade" or "Subject"
   * combobox means against the row shape. That is deliberate rather than a
   * gap: the built-in machinery (`searchFields`, `statusFilter`) covers the
   * two shapes it *can* interpret, and this prop covers everything else by
   * getting out of the way.
   *
   * Two consequences of that hands-off stance, stated rather than hidden:
   * - These selections are invisible to `page.hasActiveFilters`, so the
   *   header's "Clear filters" affordance does not appear for them alone,
   *   and `onClearFilters` does not reset them. DataFilters' own "Clear all"
   *   does call each config's `onChange([])`, so wire real clearing there.
   * - In client-side mode the rows are NOT re-filtered by these selections.
   *   A caller using them is expected to filter its own `data` (or ask the
   *   server to), exactly as it already does in server-controlled mode.
   */
  filters?: DataFilterConfig[];

  // ─────────────────────────────────────────────────────────────────────────
  // Server-controlled list (opt-in, additive)
  //
  // Supplying ANY prop in this block puts the page in server-controlled
  // mode, in which ResourcePage renders `data` exactly as given: it does not
  // search it, sort it or paginate it a second time. That double-work is the
  // reason a server-paginated list could not previously adopt ResourcePage —
  // page 3 of 40 would be re-filtered and re-sorted against only its own 25
  // rows, and then re-paged on top of that.
  //
  // Consequences, stated rather than hidden:
  //  - Table column headers stop being sort triggers (a header click could
  //    only reorder the current page, which would be a lie about the sort).
  //    The sort control in `DataFilters` drives `onSortChange` instead.
  //  - `DataTable`'s own pagination is switched off; the pager below the list
  //    is driven by `page` / `perPage` / `total` / `onPageChange`, and is only
  //    rendered when `onPageChange` is supplied. BOTH `perPage` AND `total`
  //    are required for that pager's math, and neither can be derived from
  //    the rows: a short final page is smaller than the real page size, so
  //    `data.length` must not be used as the divisor, and `data` holds only
  //    the current page, so it cannot supply the total either.
  //  - Changing search or sort calls `onPageChange(1)` as well, so the caller
  //    is never left requesting page 7 of a one-page result.
  //  - Grid and list views are NOT forced to table view, and they render
  //    cards for the current server page only. That is accepted rather than
  //    worked around, because it is not actually wrong here: the pager is
  //    rendered OUTSIDE DataGrid precisely so it pages grid and list too, so
  //    "this view shows one page, and there is a pager under it" is the same
  //    contract the table view has. Forcing `viewMode="table"` would instead
  //    silently discard a `renderCard` the caller supplied, and silently
  //    overriding a user's own view choice is the worse failure. The one real
  //    caveat: DataGrid's infinite-scroll batching (48 at a time) tops out at
  //    the page size, so a server page smaller than 48 never scroll-loads —
  //    harmless, but it means infinite scroll and server paging do not
  //    compose into an endless list.
  // ─────────────────────────────────────────────────────────────────────────

  /** Current page, 1-based. Server-controlled mode only. */
  page?: number;
  /**
   * Rows per page the server was asked for. Required whenever
   * `onPageChange` is supplied: pager math (total pages, range start, Next)
   * cannot be inferred from `data.length`, because a short final page is
   * smaller than the real page size. Wins over the per-user page size
   * persisted by `viewSettingsKey` — an explicit prop always beats a stored
   * preference.
   *
   * Required whenever `onPageChange` is supplied. A short final page (the
   * server's last page returning fewer rows than its page size) is
   * indistinguishable from a small page size — there is no correct way to
   * infer the divisor from the rows handed back. Rather than guess and
   * render a wrong range or a stuck Next button, the component refuses to
   * render the pager and shows an error instead when `onPageChange` is
   * present without `perPage`.
   *
   * `total` is required on the same terms — see {@link total}. The error
   * names every missing prop, not just the first.
   */
  perPage?: number;
  /**
   * Called with the next 1-based page number. The pager only renders when
   * this is supplied AND both `perPage` and `total` are supplied — see
   * {@link perPage} and {@link total}. Supplying this without either one
   * renders an error naming the missing props instead of a pager.
   *
   * Status changes reach the server through `onFiltersChange` — not a
   * dedicated callback here — because `statusFilter` state is tracked by
   * the same filter machinery that already calls `onFiltersChange`
   * regardless of controlled mode (see {@link statusFilter}). In
   * server-controlled mode a status change also calls `onPageChange(1)`
   * directly, since the previous page number is meaningless against a new
   * filtered result set.
   */
  onPageChange?: (page: number) => void;
  /** Called when the user picks a different page size in the header's view settings. */
  onPerPageChange?: (perPage: number) => void;
  /** Called when the user changes the sort, with `null` when the sort is cleared. */
  onSortChange?: (sort: SortParam | null) => void;
  /** Called when the user changes the search text (including clearing it). */
  onSearchChange?: (search: string) => void;

  // ── Fetch state for server-data mode ──
  //
  // In client-side mode ResourcePage owns the fetch, so it knows on its own
  // when the list is in flight or has failed and renders the shell's spinner
  // or error panel accordingly. In server-data mode the caller owns the
  // fetch, and ResourcePage sees only the `data` array that comes out the
  // far end — which means a request that is still in flight and a request
  // that failed both arrive as `data={[]}`, indistinguishable from a
  // genuinely empty result. Left alone that renders a failed fetch as an
  // ordinary "no records" table: the page shows nothing and says nothing is
  // wrong, which is the worst of the three outcomes. These props let the
  // caller say which of the three it is. They are read only outside
  // client-side mode, so a `resource`-driven page behaves exactly as before
  // whether or not they are supplied.

  /**
   * Server-data mode: the caller's fetch is in flight, so render the shell's
   * loading skeleton instead of the (as yet meaningless) `data`. Ignored in
   * client-side mode, where `useResource`'s own loading state is used.
   */
  loading?: boolean;
  /**
   * Server-data mode: the caller's fetch failed, so render the shell's error
   * panel instead of an empty table. Takes effect even when `data` is
   * non-empty — stale rows beside no indication of failure are exactly the
   * silent-failure this prop exists to prevent. Ignored in client-side mode,
   * where `useResource`'s own error state is used.
   */
  error?: boolean;
  /**
   * Message shown in the error panel, in place of the shell's generic
   * "Failed to load …". Forwarded in both modes — it is inert unless an
   * error state is actually showing — so a client-side page can also give
   * its failure a human sentence.
   */
  errorMessage?: string;
  /**
   * Server-data mode: invoked by the error panel's Retry button. The button
   * only appears when this is supplied, so a caller with no way to retry
   * simply omits it and gets an error panel without a dead control. In
   * client-side mode the button is already wired to `useResource`'s own
   * `refetch` and this prop is ignored.
   */
  onRetry?: () => void;

  // ── Saved views — passed straight through to DataFilters ──
  /** Saved filter views to offer. Pair with `useSavedViews` for per-user storage. */
  savedViews?: SavedViewItem[];
  onLoadView?: (filters: Record<string, unknown>) => void;
  onSaveView?: (name: string) => void;
  onDeleteView?: (id: string) => void;
  /** Show the "save current view" affordance. */
  canSaveViews?: boolean;

  // ── Table chrome — passed straight through to DataTable ──
  /** Show the column-visibility dropdown. DataTable's default is `true`. */
  columnVisibility?: boolean;
  /** Persist key for the user's column-visibility picks. */
  columnVisibilityKey?: string;
  /** Allow drag-resizing columns. DataTable's default is `true`. */
  resizableColumns?: boolean;
  /** Persist key for the user's column widths. */
  resizeKey?: string;
  /** Keep the table header visible while scrolling. DataTable's default is `true`. */
  stickyHeader?: boolean;
  /** Keep the first column visible while scrolling horizontally. */
  stickyFirstColumn?: boolean;
  /**
   * Page-size choices offered by `DataTable`'s own pager. Client-side mode
   * only — server-controlled mode switches that pager off. (The header's
   * view-settings popover has its own fixed 10/25/50/100 list.)
   */
  pageSizeOptions?: number[];

  // CRUD — presence enables the action
  onCreate?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  createLabel?: string;

  // Built-in form support (Phase 2)
  /** Enable built-in create form (ignored if onCreate callback is provided). */
  allowCreate?: boolean;
  /** Enable built-in edit form (ignored if onEdit callback is provided). */
  allowEdit?: boolean;
  /** Field definitions for the built-in form. */
  formFields?: ResourceFormFieldDef[];
  /** Custom form renderer — receives form instance and resolved fields. */
  renderForm?: (
    form: UseFormReturn<Record<string, unknown>>,
    fields: ResourceFormFieldDef[],
  ) => ReactNode;

  /** Form presentation mode. Default "standard". */
  formMode?: "standard" | "wizard";
  /** Wizard step definitions. Required when formMode is "wizard". */
  formSteps?: WizardStep[];
  /** Layout mode for the built-in form container. If not set, defaults to sheet for edit, dialog for create. */
  formLayout?: "dialog" | "sheet" | "page";

  // Bulk actions
  bulkActions?: Array<{
    label: string;
    icon?: LucideIcon;
    variant?: "default" | "destructive";
    onAction: (ids: string[]) => void | Promise<void>;
    /**
     * Forwarded straight to the rendered bulk button (see `BulkAction`).
     * Exists so a consumer can kill every bulk action while one of them is
     * in flight — an early return inside `onAction` blocks the second call
     * but leaves the button looking live, which misstates what it will do.
     */
    disabled?: boolean;
  }>;

  // Grid/list rendering + keyboard nav
  /**
   * Override the default card renderer used for grid view (and, absent a
   * dedicated list layout, list view too — DataGrid falls back to the same
   * renderer there). ResourcePage still owns data-fetching, filtering,
   * sorting, and layout (grid columns, infinite-scroll batching, stagger
   * animation) — this only swaps what's rendered inside each item slot.
   *
   * Receives `ResourceCardActions`: the row's `update`/`remove`/`refetch`
   * plus `open()` to activate the row (opening the configured detail
   * panel/modal/route). Row activation is *not* applied automatically to a
   * custom card — wrapping it would double-fire against cards that bring
   * their own click handling and would hijack clicks on nested buttons — so
   * call `actions.open()` from wherever your card should activate.
   */
  renderCard?: (
    item: T,
    index: number,
    actions: ResourceCardActions<T>,
  ) => ReactNode;
  /**
   * Replace the built-in `DataTable` that table view renders, keeping every
   * other piece of the page — header, counts, view settings, filters,
   * bulk bar, detail panel, form, pager — exactly as it is. The counterpart
   * to `renderCard`, which does the same for grid and list view.
   *
   * Receives the rows for the current view, which in server-controlled mode
   * is precisely the page the server returned. Ownership is total: row
   * click-through, selection, density, column visibility and resizing are
   * all things the built-in table wires for you and a custom table must
   * wire for itself. That is the trade this prop makes, and it is why
   * `renderCard` remains the lighter option when only the *cells* need to
   * change — a `ResourceColumnDef.render` is lighter still.
   *
   * Omitted, the default `DataTable` render is used unchanged.
   */
  renderTable?: (items: T[]) => ReactNode;
  /**
   * Tailwind grid-column classes for the card grid, passed through to
   * `DataGrid`'s `gridCols` — e.g. `"grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"`.
   * Defaults to DataGrid's own responsive 1/2/3/4-column ramp.
   */
  gridCols?: string;
  /**
   * Built-in list keyboard navigation via `useKeyboardNavigation`: j/k (or
   * Arrow Up/Down) move a focus cursor, Enter opens the focused item,
   * Backspace (⌫) closes an open detail view, and x toggles the focused
   * item's selection when `bulkActions` are configured. Set to `false` to
   * opt out.
   *
   * Default-on, and scoped so that being on by default stays safe:
   * - Only while the grid or list view is showing. Table view keeps its own
   *   independent sort/pagination, so a flat focus index can't reliably map
   *   onto its visible rows.
   * - Cursor keys suspend while a detail panel/modal or the built-in form
   *   is open, so they can't drive the list behind the overlay; ⌫ stays
   *   live there so it can close it.
   * - Backspace is only intercepted while there's an open detail to close.
   * - Modified chords (Ctrl/Cmd/Alt) are never captured, so an app's
   *   Cmd+K-style shortcuts keep working.
   */
  keyboardNavigation?: boolean;

  // Slots
  toolbar?: ReactNode;
  emptyState?: ReactNode;

  /**
   * Imperative navigation used only when `detail="route"` (navigates to
   * `/{resource}/{id}` on row click). Defaults to a full-page navigation.
   * Router consumers pass their navigate fn — e.g. RR `useNavigate()` or
   * Next `router.push`.
   */
  onNavigate?: NavigateFn;

  // Data options (client-side mode only)
  resourceOptions?: UseResourceOptions<T>;
  defaultView?: ViewMode;
  /**
   * Persist key for density / page size via `useViewSettings`.
   * Defaults to `resource` or a slug of `title`.
   */
  viewSettingsKey?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResourcePage<
  T extends Record<string, unknown> = Record<string, unknown>,
>(props: ResourcePageProps<T>) {
  const {
    resource: resourceName,
    data: dataProp,
    total: totalProp,
    title,
    subtitle,
    icon,
    columns: columnsProp,
    detail = "panel",
    detailWidth = "md",
    titleField: titleFieldProp,
    subtitleField: subtitleFieldProp,
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
    createLabel = "New",
    allowCreate,
    allowEdit,
    formFields,
    renderForm: renderFormProp,
    formMode,
    formSteps,
    formLayout: formLayoutProp,
    bulkActions,
    renderCard: renderCardProp,
    renderTable: renderTableProp,
    gridCols: gridColsProp,
    keyboardNavigation = true,
    toolbar,
    emptyState,
    resourceOptions,
    defaultView = "table",
    onNavigate = defaultNavigate,
    viewSettingsKey: viewSettingsKeyProp,
  } = props;

  // ── Determine mode ──
  const isClientMode = !!resourceName;

  /**
   * Server-controlled mode is entered by supplying ANY of the controlled
   * props — presence is the switch, so a caller that only pages (no server
   * search) still gets its `data` left alone.
   */
  const isServerControlled =
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

  /** Explicit prop beats the per-user stored preference. */
  const effectivePageSize = perPageProp ?? settings.pageSize;

  // ── Client-side mode: call useResource (hook is always called for rules-of-hooks) ──
  // Core's useResource constrains its row type to BaseRecord (rows carry an
  // `id`), which is stricter than ResourcePage's public `T extends
  // Record<string, unknown>`. Intersect at the call site so the public
  // ResourcePageProps<T> generic stays unchanged while satisfying the hook.
  const resourceHook = useResource<T & BaseRecord>(
    resourceName ?? "__noop__",
    isClientMode ? resourceOptions : { enabled: false },
  );

  // ── Resolve display data ──
  const displayData: T[] = isClientMode
    ? (resourceHook.list.data?.data ?? [])
    : (dataProp ?? []);
  const displayTotal: number = isClientMode
    ? (resourceHook.list.data?.total ?? 0)
    : (totalProp ?? 0);
  // Client-side mode reads the hook it owns; server-data mode reads the
  // caller's `loading` / `error` props, defaulting to false so a page that
  // supplies neither renders exactly as it did before they existed.
  const isLoading = isClientMode
    ? resourceHook.list.isLoading
    : (loadingProp ?? false);
  const hasError = isClientMode
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
    initialFilters,
    onFiltersChange,
    defaultView,
    detail,
    titleField: titleFieldProp,
    subtitleField: subtitleFieldProp,
    controlled: isServerControlled,
  });

  // ── Build ResourceActions for column render functions ──
  const actions: ResourceActions<T> = useMemo(() => {
    if (isClientMode) {
      return {
        update: resourceHook.update as ResourceActions<T>["update"],
        remove: resourceHook.remove,
        refetch: () => resourceHook.list.refetch(),
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
    resourceHook.list,
  ]);

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
      return new Set(
        page.data.map((item) =>
          String((item as Record<string, unknown>).id ?? ""),
        ),
      );
    });
  }, [page.data]);

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

  const handleEdit = useCallback(
    (item: T) => {
      if (useBuiltInEdit) {
        setFormAction("edit");
        setFormItem(item);
        setFormOpen(true);
      } else if (onEdit) {
        onEdit(item);
      }
    },
    [useBuiltInEdit, onEdit],
  );

  // ── Patch tableColumns to use real actions (client-side mode) ──
  const tableColumns = useMemo(() => {
    const base = isClientMode
      ? page.columns.map((col) => ({
          key: col.key,
          header: col.header ?? col.key,
          sortable: col.sortable ?? true,
          hideBelow: col.hideBelow,
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

  // ── Server-driven pager state, needed above for handleSearchChange's
  // already-on-page-1 check. ──
  const currentPage = pageProp ?? 1;

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
      if (currentPage !== 1) onPageChange?.(1);
    },
    [
      page.filterConfig,
      isServerControlled,
      onSearchChange,
      onPageChange,
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
      onPageChange?.(1);
    },
    [page.filterConfig, isServerControlled, onSortChange, onPageChange],
  );

  const handleClearFilters = useCallback(() => {
    page.clearFilters();
    if (!isServerControlled) return;
    // Clearing has to reach the server too — otherwise "Clear all" empties
    // the controls and leaves the same rows on screen.
    onSearchChange?.("");
    onSortChange?.(null);
    onPageChange?.(1);
  }, [page, isServerControlled, onSearchChange, onSortChange, onPageChange]);

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
      if (currentPage !== 1) onPageChange?.(1);
    },
    [page.filterConfig, isServerControlled, onPageChange, currentPage],
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
      if (isServerControlled) onPageChange?.(1);
    },
    [updateSetting, onPerPageChange, isServerControlled, onPageChange],
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
    isServerControlled && !!onPageChange && perPageProp === undefined;
  const missingTotal =
    isServerControlled && !!onPageChange && totalProp === undefined;
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
  const pagerPageSize = perPageProp ?? effectivePageSize;
  const totalPages = Math.max(
    1,
    Math.ceil(displayTotal / Math.max(1, pagerPageSize)),
  );
  const rangeFrom =
    page.data.length === 0 ? 0 : (currentPage - 1) * pagerPageSize + 1;
  const rangeTo = rangeFrom === 0 ? 0 : rangeFrom + page.data.length - 1;

  // ── Detail title/subtitle values ──
  const detailTitle = page.selectedItem
    ? String(
        (page.selectedItem as Record<string, unknown>)[page.titleField] ?? "",
      )
    : "";
  const detailSubtitle =
    page.selectedItem && page.subtitleField
      ? String(
          (page.selectedItem as Record<string, unknown>)[page.subtitleField] ??
            "",
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
  const overlayOpen = page.detailOpen || formOpen;
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
            handleToggleSelect(
              String((item as Record<string, unknown>).id ?? ""),
            );
          }
        }
      : undefined,
    // Supplied only while there is an open detail to close — the hook
    // suppresses Backspace's default whenever this is present, so leaving it
    // wired up permanently would swallow the browser/app's Backspace on
    // every grid/list page (including detail="none" and detail="route",
    // which never open one). `detailOpen` is only ever true for the panel
    // and modal modes, so it is the precise precondition here.
    onBack: page.detailOpen
      ? () => {
          page.setDetailOpen(false);
          page.setSelectedItem(null);
        }
      : undefined,
  });

  // ── Create button ──
  const showCreateButton = onCreate || useBuiltInCreate;
  const createButton = showCreateButton ? (
    <Button size="sm" onClick={handleCreate}>
      <Plus className="h-4 w-4 mr-1" />
      {createLabel}
    </Button>
  ) : null;

  const createAction =
    toolbar || createButton ? (
      <div className="flex items-center gap-2">
        {toolbar}
        {createButton}
      </div>
    ) : undefined;

  // ── Empty state ──
  const isEmpty = !isLoading && !hasError && page.data.length === 0;

  /**
   * Row-bound actions for a custom `renderCard`. The shared `actions` object
   * is memoized once for the whole resource, so the per-row `open()` is bound
   * here instead. Without it a custom card has no way to open the detail
   * panel/modal/route by pointer — the built-in cards get that from their own
   * onClick, which a custom card replaces.
   */
  const cardActionsFor = (item: T): ResourceCardActions<T> => ({
    ...actions,
    open: () => handleRowClick(item),
  });

  /**
   * Props that turn a plain `div`/`Card` into a real activatable row: a tab
   * stop, a button role, and Enter/Space activation to match the pointer
   * click. Without these the default card is reachable by mouse and by the
   * j/k cursor but not by Tab, which is the one path a keyboard-only user
   * actually has.
   *
   * Enter does not double-fire against the list cursor: `useKeyboardNavigation`
   * bails out whenever the event target owns its own keys, and `role="button"`
   * is one of the roles it checks (covered by a test in
   * `resource-page-render-card-keyboard-nav.test.tsx`).
   */
  const rowActivationProps = (item: T, label: string, testId: string) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": label || undefined,
    "data-testid": testId,
    onClick: () => handleRowClick(item),
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleRowClick(item);
      }
    },
  });

  /** Default card renderer (grid view) — used unless `renderCard` is given. */
  const renderDefaultCard = (item: T): ReactNode => {
    const cols = page.columns;
    const titleCol = cols[0];
    const titleVal = titleCol
      ? String((item as Record<string, unknown>)[titleCol.key] ?? "")
      : "";
    // Second column is typically the status badge
    const badgeCol = cols[1];
    const badgeVal = badgeCol
      ? (item as Record<string, unknown>)[badgeCol.key]
      : null;
    // Find a numeric-looking column for the price position
    const priceCol = cols.find(
      (c, i) => i > 1 && /price|cost|amount|total/i.test(c.key),
    );
    const priceVal = priceCol
      ? (item as Record<string, unknown>)[priceCol.key]
      : null;
    // Remaining metadata columns (skip title, badge, price)
    const metaCols = cols.filter(
      (c) => c !== titleCol && c !== badgeCol && c !== priceCol,
    );
    return (
      <Card
        {...rowActivationProps(item, titleVal, "resource-card")}
        className="h-full cursor-pointer hover:shadow-md motion-safe:transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base truncate">{titleVal}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              {badgeCol && (
                <span>
                  {badgeCol.render
                    ? badgeCol.render(item, badgeVal, actions)
                    : badgeVal != null
                      ? String(badgeVal)
                      : "—"}
                </span>
              )}
              {priceVal != null && (
                <span className="text-sm font-semibold">
                  {String(priceVal)}
                </span>
              )}
            </div>
            {metaCols.map((col) => {
              const val = (item as Record<string, unknown>)[col.key];
              return (
                <p
                  key={col.key}
                  className="text-xs text-muted-foreground truncate"
                >
                  {col.render
                    ? col.render(item, val, actions)
                    : val != null
                      ? String(val)
                      : "—"}
                </p>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  /** Default list-row renderer (list view) — used unless `renderCard` is given. */
  const renderDefaultListItem = (item: T): ReactNode => {
    const cols = page.columns;
    const titleCol = cols[0];
    const titleVal = titleCol
      ? String((item as Record<string, unknown>)[titleCol.key] ?? "")
      : "";
    return (
      <div
        {...rowActivationProps(item, titleVal, "resource-list-row")}
        className="flex items-center justify-between px-3 py-2 border-b cursor-pointer hover:bg-muted/50 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="font-medium text-sm truncate">{titleVal}</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {cols.slice(1, 4).map((col) => {
            const val = (item as Record<string, unknown>)[col.key];
            return (
              <span key={col.key}>
                {col.render
                  ? col.render(item, val, actions)
                  : val != null
                    ? String(val)
                    : "—"}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <DataPageShell
      title={title}
      subtitle={subtitle}
      icon={icon}
      count={page.data.length}
      totalCount={displayTotal}
      isLoading={isLoading}
      hasError={hasError}
      isEmpty={isEmpty}
      errorMessage={errorMessage}
      onRetry={isClientMode ? () => resourceHook.list.refetch() : onRetryProp}
      viewMode={page.viewMode}
      onViewModeChange={page.setViewMode}
      pageSize={effectivePageSize}
      onPageSizeChange={handlePageSizeChange}
      density={settings.density}
      onDensityChange={(d) => updateSetting("density", d)}
      createAction={createAction}
      hasActiveFilters={page.hasActiveFilters}
      onClearFilters={handleClearFilters}
      emptyAction={emptyState}
      filters={
        <DataFilters
          search={page.filterConfig.search}
          onSearchChange={handleSearchChange}
          searchPlaceholder={searchPlaceholder}
          sort={page.filterConfig.sort}
          onSortChange={handleSortSelect}
          sortOptions={page.filterConfig.sortOptions}
          filters={filtersProp}
          statusChips={statusChipsConfig}
          savedViews={savedViews}
          onLoadView={onLoadView}
          onSaveView={onSaveView}
          onDeleteView={onDeleteView}
          canSaveViews={canSaveViews}
          onClearAll={page.hasActiveFilters ? handleClearFilters : undefined}
        />
      }
    >
      {bulkActions && bulkActions.length > 0 && (
        <DataBulkBar
          selected={selectedIds}
          totalCount={page.data.length}
          onToggleAll={handleToggleAll}
          onClearSelection={handleClearSelection}
          actions={bulkActions.map((a) => ({
            label: a.label,
            icon: a.icon ?? Trash2,
            variant: a.variant,
            disabled: a.disabled,
            onClick: () => {
              void a.onAction(Array.from(selectedIds));
            },
          }))}
        />
      )}

      <DataGrid<T>
        items={page.data}
        viewMode={page.viewMode}
        gridCols={gridColsProp}
        getKey={(item) => String((item as Record<string, unknown>).id ?? "")}
        focusedIndex={keyboardNav.focusedIndex}
        keyboardContainerRef={keyboardNav.containerRef}
        renderTable={(items) =>
          renderTableProp ? (
            renderTableProp(items)
          ) : (
            <DataTable<T>
              items={items}
              columns={tableColumns}
              getKey={(item) =>
                String((item as Record<string, unknown>).id ?? "")
              }
              onRowClick={detail !== "none" ? handleRowClick : undefined}
              selectable={!!bulkActions && bulkActions.length > 0}
              selected={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleAll={handleToggleAll}
              density={settings.density}
              pageSize={effectivePageSize}
              pageSizeOptions={pageSizeOptions}
              columnVisibility={columnVisibility}
              columnVisibilityKey={columnVisibilityKey}
              resizableColumns={resizableColumns}
              resizeKey={resizeKey}
              stickyHeader={stickyHeader}
              stickyFirstColumn={stickyFirstColumn}
              // The server already cut the page window; DataTable's own
              // pagination would slice the slice.
              pagination={isServerControlled ? false : undefined}
            />
          )
        }
        renderCard={(item, index) =>
          renderCardProp
            ? renderCardProp(item, index, cardActionsFor(item))
            : renderDefaultCard(item)
        }
        renderListItem={(item, index) =>
          renderCardProp
            ? renderCardProp(item, index, cardActionsFor(item))
            : renderDefaultListItem(item)
        }
      />

      {/* Server-driven pager. Rendered only when `onPageChange` is supplied —
          without a handler the buttons would be decoration, and a control
          that does nothing is worse than no control. It sits outside
          DataGrid so it pages the grid and list views too, not just the
          table.

          When `onPageChange` is supplied without `perPage`, this renders an
          error instead of a pager computed from a guess — see the
          `pagerMisconfigured` comment above. A pager reporting the wrong range
          with a Next button that never disables is worse than one that
          says why it can't render. */}
      {isServerControlled && onPageChange && pagerMisconfigured && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="resource-page-pagination-error"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Pagination unavailable:{" "}
            {missingPagerProps.map((name, index) => (
              <Fragment key={name}>
                {index > 0 ? " and " : null}
                <code>{name}</code>
              </Fragment>
            ))}{" "}
            {missingPagerProps.length > 1 ? "are" : "is"} required when{" "}
            <code>onPageChange</code> is supplied.
          </span>
        </div>
      )}
      {isServerControlled && onPageChange && !pagerMisconfigured && (
        <nav
          aria-label="Pagination"
          className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 text-sm"
          data-testid="resource-page-pagination"
        >
          <span
            className="text-muted-foreground"
            data-testid="resource-page-range"
            aria-live="polite"
          >
            {displayTotal === 0
              ? "No records"
              : `Showing ${rangeFrom}-${rangeTo} of ${displayTotal}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              testID="resource-page-prev"
            >
              <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Previous
            </Button>
            <span
              className="text-muted-foreground"
              data-testid="resource-page-indicator"
            >
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              testID="resource-page-next"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}

      {/* Detail panel / modal — DetailPanel's `layout` prop picks the shell;
          "panel" gets its default fixed slide-in sheet, "modal" gets a
          centered dialog. Both share one implementation (header, content,
          edit/delete affordances) instead of ResourcePage hand-rolling a
          second Dialog. */}
      {(detail === "panel" || detail === "modal") && (
        <DetailPanel<T>
          item={page.selectedItem}
          open={page.detailOpen}
          onClose={() => {
            page.setDetailOpen(false);
            page.setSelectedItem(null);
          }}
          title={detailTitle}
          subtitle={detailSubtitle}
          onEdit={onEdit ?? (useBuiltInEdit ? handleEdit : undefined)}
          onDelete={onDelete}
          fields={detailFields}
          width={detailWidth}
          layout={detail === "modal" ? "dialog" : "sheet"}
        >
          {renderDetailProp ? (item: T) => renderDetailProp(item) : undefined}
        </DetailPanel>
      )}
      {/* Built-in create/edit form */}
      {(useBuiltInCreate || useBuiltInEdit) && resourceName && (
        <ResourceForm
          resource={resourceName}
          action={formAction}
          layout={
            formLayoutProp ?? (formAction === "edit" ? "sheet" : "dialog")
          }
          mode={formMode}
          steps={formSteps}
          item={
            formAction === "edit"
              ? ((formItem as Record<string, unknown> | null) ?? undefined)
              : page.data.length > 0
                ? Object.fromEntries(
                    Object.keys(page.data[0] as Record<string, unknown>)
                      .filter((k) => k !== "id")
                      .map((k) => [k, ""]),
                  )
                : undefined
          }
          open={formOpen}
          onOpenChange={setFormOpen}
          fields={formFields}
          listData={page.data as Record<string, unknown>[]}
          renderForm={renderFormProp}
          onSuccess={() => {
            // Data auto-refreshes via TanStack Query invalidation in useResourceForm
            page.setDetailOpen(false);
            page.setSelectedItem(null);
          }}
        />
      )}
    </DataPageShell>
  );
}
