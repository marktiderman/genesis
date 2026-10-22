"use client";

import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ComponentProps,
  type ComponentType,
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
import { cn } from "../../utils";
import { DataPageShell } from "./DataPageShell";
import type { PageHeaderAction } from "../layout/PageHeader";
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
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import {
  renderSlot,
  type Slots,
  type SlotPropsFor,
} from "../../slots";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import type { ViewModeDefault } from "../../hooks/use-view-preference";
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
import {
  useResourceUrlState,
  type ResourceUrlStateOptions,
} from "../../hooks/use-resource-url-state";
import {
  isDataReadError,
  type BaseRecord,
  type FilterParam,
  type Identifier,
  type SortParam,
} from "@marktiderman/genesis-core/provider";
import type { ResourceFormFieldDef } from "./ResourceFormField";
import { useCapabilities, type WizardStep } from "@marktiderman/genesis-core/hooks";
import { toast } from "../ui/sonner";
import {
  defaultNavigate,
  type NavigateFn,
  type SearchParamsAdapter,
} from "../../navigation";

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
/**
 * Every interior part `ResourcePage` composes, with the props it composes it
 * with. Each key is a slot: replace it via `slots`, feed it more props via
 * `slotProps`, or eject it with `null`.
 *
 * The map is the contract. A part that is not named here cannot be reached,
 * so adding a part to the render tree means adding it here in the same
 * change — otherwise the next surface that needs it forks the whole page.
 */
export type ResourcePageSlotMap<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** The page shell: header, count pill, loading / empty / error states. */
  shell: ComponentProps<typeof DataPageShell>;
  /** The filter row — search, sort, facets, saved views. */
  filters: ComponentProps<typeof DataFilters>;
  /** The selection bar. Ejecting it leaves selection working, just unshown. */
  bulkBar: ComponentProps<typeof DataBulkBar>;
  /** The card/table switch. */
  grid: ComponentProps<typeof DataGrid<T>>;
  /** The table inside the grid. `renderTable` stays the terser way to swap. */
  table: ComponentProps<typeof DataTable<T>>;
  /** The detail peek. */
  detail: ComponentProps<typeof DetailPanel<T>>;
  /** The create / edit form. */
  form: ComponentProps<typeof ResourceForm>;
  /**
   * The confirm step in front of a delete. Rendered only when a delete is
   * confirmed (`allowDelete`, or `onDelete` with `confirmDelete`).
   */
  deleteDialog: ComponentProps<typeof ConfirmDeleteDialog>;
};

/**
 * `slots` for {@link ResourcePage}, with one asymmetry the map cannot express:
 * every part may be ejected with `null` EXCEPT `shell`.
 *
 * The shell is not an interior part, it is the page — `Shell` is what the
 * render returns, so ejecting it does not remove a piece, it removes the
 * component (`const Shell = slots?.shell ?? DataPageShell` would become
 * `null`, and React throws on the element). A caller who wants no shell wants
 * rung 3 of the ladder, not a `null` here. Replacing it stays supported, which
 * is the way to wrap it and change one thing.
 */
export type ResourcePageSlots<
  T extends Record<string, unknown> = Record<string, unknown>,
> = Omit<Slots<ResourcePageSlotMap<T>>, "shell"> & {
  shell?: ComponentType<ComponentProps<typeof DataPageShell>>;
};

/**
 * `slotProps` for {@link ResourcePage}: extra props merged into a part you
 * are keeping, winning over ResourcePage's own.
 */
export type ResourcePageSlotProps<
  T extends Record<string, unknown> = Record<string, unknown>,
> = SlotPropsFor<ResourcePageSlotMap<T>>;

/**
 * Copy for the built-in delete confirmation. Every field is optional;
 * omitted ones fall back to `ConfirmDeleteDialog`'s defaults.
 *
 * @stability Beta
 */
export interface ResourceDeleteConfirmCopy<T> {
  /** Default "Delete this record?". A function receives the row. */
  title?: string | ((item: T) => string);
  /** Default "This can't be undone." */
  description?: ReactNode | ((item: T) => ReactNode);
  /** Default "Delete". */
  confirmLabel?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
}

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

  /**
   * How `resource` mode reaches rows past the first page. Ignored with
   * `data` (server-data mode pages through the controlled props instead).
   *
   * - `"client"` (default): fetch up to `clientRowLimit` rows in one request
   *   and search, sort, filter and page them in the browser — header-click
   *   sort and instant search keep working. If the resource holds more rows
   *   than that, a notice under the list says how many are shown (and a
   *   console warning names this prop), rather than silently truncating.
   * - `"server"`: fetch one page at a time. The pager under the list drives
   *   `useResource`'s page, the header's page size its `perPage`, and
   *   search / sort / status chips become provider queries (search is
   *   debounced), and the current page stays on screen while the next one
   *   loads. Give `statusFilter` explicit `options` here — derived ones can
   *   only see the current page's values. Search needs `searchFields` (or
   *   `resourceOptions.searchFields`) — the provider must be told which
   *   columns to match — so the search box is hidden without them. Table
   *   header sorting is withdrawn, as in server-data mode; the sort control
   *   in the filter row drives the query.
   */
  pagination?: "client" | "server";
  /**
   * `pagination="client"` only: the most rows fetched. Default 1000. An
   * explicit `resourceOptions.defaultPerPage` wins.
   */
  clientRowLimit?: number;

  // Page chrome
  title: string;
  /** Page subtitle shown below the title. */
  subtitle?: string;
  icon?: LucideIcon;

  // Columns — optional, string shorthand supported
  columns?: Array<string | ResourceColumnDef<T>>;

  /**
   * A row's identity, for React keys and bulk selection. Defaults to
   * `String(item.id)`. Supply it for rows keyed some other way — a composite
   * key (`encodeRecordKey` from `@marktiderman/genesis-core/schema`), or a
   * table whose key column isn't called `id`. Detail `route` mode still
   * navigates by `item.id`.
   */
  getKey?: (item: T) => string;

  // Detail view
  /** How row-click detail is shown. Default "panel". */
  detail?: "panel" | "modal" | "route" | "none";
  detailWidth?: "sm" | "md" | "lg";
  titleField?: string;
  subtitleField?: string;
  /**
   * Name a record from more than one field (`${first} ${last}`). Wins over
   * `titleField` for the detail title and the card's accessible name.
   */
  getTitle?: (item: T) => string;
  /**
   * The detail peek's subtitle, computed from the row ("2 staff", "Due
   * Friday"). Wins over `subtitleField`, which can only show one column
   * verbatim.
   */
  getSubtitle?: (item: T) => string | undefined;
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

  /**
   * What the data source can do. A control it can't serve is hidden rather
   * than left to error (DATA-STUDIO.md decision 9): `search: false` hides the
   * search box, `sort: false` the sort select. Pass a provider's
   * `capabilities()` straight in. Omitted, both show, as before.
   */
  capabilities?: { search?: boolean; sort?: boolean };

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
  /**
   * Delete handler, shown as the detail peek's Delete button. Called
   * directly, as before, unless `confirmDelete` is set — then it runs after
   * the confirm dialog, which shows its error if the returned promise
   * rejects, and closes the peek when it resolves.
   */
  onDelete?: (item: T) => void | Promise<void>;
  /**
   * Whether the signed-in user may change this record at all: shorthand for
   * `canEdit` and `canDelete` together. When it returns false the peek
   * offers neither Edit nor Delete.
   *
   * Precedence: `canEditItem` is checked first. A row it refuses gets no Edit
   * and no Delete, whatever `canEdit` / `canDelete` say. A row it allows is
   * then gated by `canEdit` (Edit) and `canDelete` (Delete) when given. Use
   * `canEditItem` alone for one owner rule, or the pair for separate rules.
   */
  canEditItem?: (item: T) => boolean;
  createLabel?: string;
  /**
   * Whether this row may be edited. The peek's Edit button is hidden for a
   * row that returns `false` (and the built-in edit form will not open for
   * it). Omitted, every row is editable, as before. A UI gate only: the
   * server must still refuse the write.
   */
  canEdit?: (item: T) => boolean;
  /**
   * Whether this row may be deleted. The peek's Delete button is hidden for
   * a row that returns `false`. Omitted, every row is deletable. A UI gate
   * only: the server must still refuse the write.
   */
  canDelete?: (item: T) => boolean;
  /**
   * Built-in delete for `resource` mode (ignored if `onDelete` is
   * provided): the peek's Delete button opens a confirm dialog, then calls
   * `useResource`'s `remove` with the row's `getKey` (when supplied) or its
   * `id` — which invalidates the list — and closes the peek. A failure shows
   * in the dialog.
   */
  allowDelete?: boolean;
  /**
   * Confirm before deleting. Defaults to `true` for `allowDelete` and
   * `false` for `onDelete` (which keeps its old, unconfirmed behaviour).
   * Pass an object to set the dialog's copy.
   */
  confirmDelete?: boolean | ResourceDeleteConfirmCopy<T>;
  /** Called after a confirmed or built-in delete succeeds — e.g. a toast. */
  onDeleted?: (item: T) => void;
  /**
   * Extra header actions beyond the create button, in one overflow menu.
   * See {@link PageHeaderAction} — the budget is one primary, the rest here.
   */
  secondaryActions?: PageHeaderAction[];

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
    /** `data-testid` on the rendered bulk button, so e2e can drive it. */
    testId?: string;
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
   * With a custom `renderCard`: make each whole card (and list row) one
   * keyboard-reachable button that opens the detail, so the card needs no
   * `actions.open()` wiring and no hand-rolled `div role="button"`. Links and
   * buttons inside the card keep their own clicks. Off by default, because
   * an existing card that already calls `open()` would fire it twice.
   */
  openOnCardClick?: boolean;
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
   * - The j/k cursor runs while the grid or list view is showing. Table view
   *   keeps its own sort/pagination, so there `DataTable` handles the keys on
   *   its focusable rows instead (↑/↓ or j/k, Home/End, Enter, x); this prop
   *   turns that off too.
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
  /** The empty state's action, e.g. the create button. */
  emptyState?: ReactNode;
  /** The empty state's icon. */
  emptyIcon?: LucideIcon;
  /** The empty state's title, e.g. "No tasks yet". Default "No results found". */
  emptyMessage?: string;
  /** A sentence under the empty-state title — forwarded to `DataPageShell`. */
  emptyDescription?: string;
  /**
   * `"page"` (default) renders the full header with the title. `"toolbar"`
   * keeps the header's actions (count, view toggle, settings, create) and
   * drops the title block — for a list inside a tab or card whose page
   * already has the heading. See `DataPageShell`'s `header`.
   */
  header?: "page" | "toolbar";

  /**
   * Imperative navigation used only when `detail="route"` (navigates to
   * `/{resource}/{id}` on row click). Defaults to a full-page navigation.
   * Router consumers pass their navigate fn — e.g. RR `useNavigate()` or
   * Next `router.push`.
   */
  onNavigate?: NavigateFn;

  // Data options (client-side mode only)
  resourceOptions?: UseResourceOptions<T>;
  /**
   * Keep the list's state in the URL: the open record (`?id=`), the search
   * (`q`), the sort (`sort=field:asc`) and, with `pagination="server"`, the
   * page. Pass your router's search-params adapter
   * (`useReactRouterSearchParams()`, `useTanStackRouterSearchParams()`, or
   * `useBrowserSearchParams()` with no router), or `{ searchParams, params }`
   * to rename the keys. A copied link reopens the same record, and Back
   * closes one that was opened. Search and sort are read when the page
   * mounts and written as they change. A server-controlled page owns its
   * own page, sort and search: use `useResourceUrlState` there.
   */
  urlState?: SearchParamsAdapter | ResourceUrlStateOptions;
  /**
   * The view shown until the user picks one with the view toggle. Default
   * `"table"`. Pass `{ mobile: "grid", desktop: "table" }` for cards on
   * phones and a table on desktops. Only an explicit pick is persisted, so
   * the responsive default stays responsive until the user chooses.
   */
  defaultView?: ViewModeDefault;
  /**
   * Persist key for density / page size via `useViewSettings`.
   * Defaults to `resource` or a slug of `title`.
   */
  viewSettingsKey?: string;

  /**
   * The interior parts `ResourcePage` composes, by name. Replace one with your
   * own component, or pass `null` to eject it entirely — see
   * {@link ResourcePageSlots}.
   *
   * This is the reason a surface that needs one part to differ does not have
   * to drop to the primitives and re-derive the pagination, selection and
   * detail wiring that were already correct.
   */
  slots?: ResourcePageSlots<T>;
  /** Extra props merged into a part you are KEEPING. Wins over ours. */
  slotProps?: ResourcePageSlotProps<T>;
  /** Merged onto the page shell's root. */
  className?: string;
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
    bulkActions,
    renderCard: renderCardProp,
    openOnCardClick = false,
    renderTable: renderTableProp,
    gridCols: gridColsProp,
    keyboardNavigation = true,
    capabilities,
    toolbar,
    emptyState,
    emptyIcon,
    emptyMessage,
    emptyDescription,
    header: headerMode = "page",
    resourceOptions,
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
  const [urlSeed] = useState(() =>
    url ? { q: url.q, sort: url.sort, page: url.page } : null,
  );
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
        }
      : { enabled: false },
  );

  /** Explicit prop beats the per-user stored preference. */
  const effectivePageSize = resourceServerPaging
    ? (resourceHook.params.pagination?.perPage ?? settings.pageSize)
    : (perPageProp ?? settings.pageSize);

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
    !isLoading &&
    !hasError &&
    displayTotal > displayData.length;
  const warnedTruncatedRef = useRef(false);
  useEffect(() => {
    if (!clientTruncated || warnedTruncatedRef.current) return;
    warnedTruncatedRef.current = true;
    console.warn(
      `ResourcePage: "${resourceName}" has ${displayTotal} rows but only ${displayData.length} were fetched. ` +
        `Pass \`pagination="server"\` to page through all of them, or raise \`clientRowLimit\`.`,
    );
  }, [clientTruncated, resourceName, displayTotal, displayData.length]);
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
  const selectedKey = url ? url.detailId : snapshotKey;
  const snapshot =
    page.selectedItem && snapshotKey === selectedKey ? page.selectedItem : null;
  const selectedItem: T | null = !selectedKey
    ? snapshot
    : (displayData.find((row) => keyOf(row) === selectedKey) ?? snapshot);
  const detailOpen = url ? selectedItem !== null : page.detailOpen;

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

  const handleEdit = useCallback(
    (item: T) => {
      if (canEdit && !canEdit(item)) return;
      if (canEditItem && !canEditItem(item)) return;
      if (useBuiltInEdit) {
        setFormAction("edit");
        setFormItem(item);
        setFormOpen(true);
      } else if (onEdit) {
        onEdit(item);
      }
    },
    [useBuiltInEdit, onEdit, canEdit, canEditItem],
  );

  const closeDetail = useCallback(() => {
    page.setDetailOpen(false);
    page.setSelectedItem(null);
    url?.setDetailId(null);
  }, [page, url]);

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
  const deleteKind = providerCaps?.softDelete ? "recycle" : "permanent";

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
            void onDelete?.(item);
          };

  // Per-row rights, evaluated against the row the peek is showing.
  const mayChange = (item: T) => (canEditItem ? canEditItem(item) : true);
  const selectedEditable =
    !!selectedItem &&
    mayChange(selectedItem) &&
    (canEdit ? canEdit(selectedItem) : true);
  const selectedDeletable =
    !!selectedItem &&
    mayChange(selectedItem) &&
    (canDelete ? canDelete(selectedItem) : true);

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
    if (url && (detail === "panel" || detail === "modal")) url.setDetailId(keyOf(item));
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

  // The root slot. Unlike the interior parts it cannot be ejected — a page
  // with no shell is not a page — so it resolves to a component, never null.
  // `slotProps.shell` merges last and wins, except `className`, which is
  // merged rather than replaced so a consumer adding a class does not
  // silently drop the shell's own layout.
  const Shell = slots?.shell ?? DataPageShell;
  const shellSlotProps = slotProps?.shell;

  return (
    <Shell
      title={title}
      subtitle={subtitle}
      icon={icon}
      count={page.data.length}
      totalCount={displayTotal}
      isLoading={isLoading}
      hasError={hasError}
      isEmpty={isEmpty}
      errorMessage={
        errorMessage ??
        // A provider's read error carries a sentence users can be shown.
        (isClientMode && isDataReadError(resourceHook.list.error)
          ? resourceHook.list.error.message
          : undefined)
      }
      onRetry={isClientMode ? () => resourceHook.list.refetch() : onRetryProp}
      viewMode={page.viewMode}
      onViewModeChange={page.setViewMode}
      pageSize={effectivePageSize}
      onPageSizeChange={handlePageSizeChange}
      density={settings.density}
      onDensityChange={(d) => updateSetting("density", d)}
      createAction={createAction}
      secondaryActions={secondaryActions}
      hasActiveFilters={page.hasActiveFilters}
      onClearFilters={handleClearFilters}
      emptyAction={emptyState}
      emptyIcon={emptyIcon}
      emptyMessage={emptyMessage}
      emptyDescription={emptyDescription}
      {...(headerMode === "toolbar" ? { header: "toolbar" as const } : {})}
      filters={renderSlot(
        DataFilters,
        slots?.filters,
        {
          search: page.filterConfig.search,
          onSearchChange: handleSearchChange,
          searchPlaceholder,
          sort: page.filterConfig.sort,
          onSortChange: handleSortSelect,
          sortOptions: page.filterConfig.sortOptions,
          filters: filtersProp,
          statusChips: statusChipsConfig,
          savedViews,
          onLoadView,
          onSaveView,
          onDeleteView,
          canSaveViews,
          onClearAll: page.hasActiveFilters ? handleClearFilters : undefined,
          showSearch:
            capabilities?.search !== false &&
            !(resourceServerPaging && !serverSearchFields?.length),
          showSort: capabilities?.sort !== false,
        },
        slotProps?.filters,
      )}
      {...shellSlotProps}
      className={cn(className, shellSlotProps?.className)}
    >
      {bulkActions &&
        bulkActions.length > 0 &&
        renderSlot(
          DataBulkBar,
          slots?.bulkBar,
          {
            selected: selectedIds,
            totalCount: page.data.length,
            onToggleAll: handleToggleAll,
            onClearSelection: handleClearSelection,
            actions: bulkActions.map((a) => ({
              label: a.label,
              icon: a.icon ?? Trash2,
              variant: a.variant,
              disabled: a.disabled,
              testId: a.testId,
              onClick: () => {
                void a.onAction(Array.from(selectedIds));
              },
            })),
          },
          slotProps?.bulkBar,
        )}

      {renderSlot(
        DataGrid<T>,
        slots?.grid,
        {
          items: page.data,
          viewMode: page.viewMode,
          gridCols: gridColsProp,
          getKey: keyOf,
          focusedIndex: keyboardNav.focusedIndex,
          keyboardContainerRef: keyboardNav.containerRef,
          renderTable: (items: T[]) =>
          renderTableProp ? (
            renderTableProp(items)
          ) : (
            renderSlot(
              DataTable<T>,
              slots?.table,
              {
                items,
                columns: tableColumns,
                getKey: keyOf,
                onRowClick: detail !== "none" ? handleRowClick : undefined,
                selectable: !!bulkActions && bulkActions.length > 0,
                selected: selectedIds,
                onToggleSelect: handleToggleSelect,
                onToggleAll: handleToggleAll,
                density: settings.density,
                pageSize: effectivePageSize,
                pageSizeOptions,
                columnVisibility,
                columnVisibilityKey,
                resizableColumns,
                resizeKey,
                stickyHeader,
                stickyFirstColumn,
                keyboardNavigation,
                // The server already cut the page window; DataTable's own
                // pagination would slice the slice.
                pagination: isServerControlled ? false : undefined,
              },
              slotProps?.table,
            )
          )
          ,
          ...(openOnCardClick && renderCardProp && detail !== "none"
            ? {
                onItemClick: handleRowClick,
                getItemLabel: (item: T) => `Open ${titleOf(item)}`.trim(),
              }
            : {}),
          renderCard: (item: T, index: number) =>
            renderCardProp
              ? renderCardProp(item, index, cardActionsFor(item))
              : renderDefaultCard(item),
          renderListItem: (item: T, index: number) =>
            renderCardProp
              ? renderCardProp(item, index, cardActionsFor(item))
              : renderDefaultListItem(item),
        },
        slotProps?.grid,
      )}

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
      {clientTruncated && (
        <p
          role="status"
          className="px-3 py-2 text-sm text-muted-foreground"
          data-testid="resource-page-truncated"
        >
          Showing the first {displayData.length.toLocaleString()} of{" "}
          {displayTotal.toLocaleString()} records.
        </p>
      )}
      {isServerControlled && pagerOnPageChange && pagerMisconfigured && (
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
      {isServerControlled && pagerOnPageChange && !pagerMisconfigured && (
        <nav
          aria-label="Pagination"
          // The previous page stays on screen while the next one loads.
          aria-busy={
            (resourceServerPaging && resourceHook.list.isPlaceholderData) ||
            undefined
          }
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
              onClick={() => pagerOnPageChange(currentPage - 1)}
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
              onClick={() => pagerOnPageChange(currentPage + 1)}
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
        renderSlot(
          DetailPanel<T>,
          slots?.detail,
          {
            item: selectedItem,
            open: detailOpen,
            onClose: closeDetail,
            title: detailTitle,
            subtitle: detailSubtitle,
            onEdit: selectedEditable
              ? (onEdit ?? (useBuiltInEdit ? handleEdit : undefined))
              : undefined,
            onDelete: selectedDeletable ? deleteHandler : undefined,
            fields: detailFields,
            width: detailWidth,
            layout: detail === "modal" ? "dialog" : "sheet",
            children: renderDetailProp
              ? (item: T) => renderDetailProp(item)
              : undefined,
          },
          slotProps?.detail,
        )
      )}
      {/* Built-in create/edit form */}
      {(useBuiltInCreate || useBuiltInEdit) && resourceName && (
        renderSlot(
          ResourceForm,
          slots?.form,
          {
            resource: resourceName,
            action: formAction,
            layout:
              formLayoutProp ?? (formAction === "edit" ? "sheet" : "dialog"),
            mode: formMode,
            steps: formSteps,
            item:
              formAction === "edit"
                ? ((formItem as Record<string, unknown> | null) ?? undefined)
                : page.data.length > 0
                  ? Object.fromEntries(
                      Object.keys(page.data[0] as Record<string, unknown>)
                        .filter((k) => k !== "id")
                        .map((k) => [k, ""]),
                    )
                  : undefined,
            open: formOpen,
            onOpenChange: setFormOpen,
            fields: formFields,
            listData: page.data as Record<string, unknown>[],
            renderForm: renderFormProp,
            onSuccess: () => {
              // The list refetches via useResourceForm's invalidation. After
              // an edit the peek stays open and re-resolves its row by key
              // (see `selectedItem`), so it shows the saved values; a create
              // has no peek of its own to keep.
              if (formAction === "create") closeDetail();
            },
          },
          slotProps?.form,
        )
      )}
      {deleteConfirmed &&
        (useBuiltInDelete || !!onDelete) &&
        renderSlot(
          ConfirmDeleteDialog,
          slots?.deleteDialog,
          {
            open: deleteOpen,
            onOpenChange: setDeleteOpen,
            onConfirm: () =>
              pendingDelete ? performDelete(pendingDelete) : undefined,
            kind: deleteKind,
            title:
              typeof deleteCopy?.title === "function"
                ? pendingDelete
                  ? deleteCopy.title(pendingDelete)
                  : undefined
                : deleteCopy?.title,
            description:
              typeof deleteCopy?.description === "function"
                ? pendingDelete
                  ? deleteCopy.description(pendingDelete)
                  : undefined
                : deleteCopy?.description,
            confirmLabel: deleteCopy?.confirmLabel,
            cancelLabel: deleteCopy?.cancelLabel,
          },
          slotProps?.deleteDialog,
        )}
    </Shell>
  );
}
