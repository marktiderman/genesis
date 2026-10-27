"use client";

import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
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
import { DataTable, type DataTableSort } from "./DataTable";
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
// Types only: the behaviour lives in `useResourceTableModel`.
import type {
  useResource,
  MutationMode,
  UseResourceOptions,
} from "@marktiderman/genesis-core/hooks";
import { useResourceTableModel } from "./use-resource-table";
import { fillMessage, useUiMessages } from "../../messages";
import type {
  ResourceColumnDef,
  ResourceActions,
} from "../../hooks/use-resource-page";
import type { ResourceUrlStateOptions } from "../../hooks/use-resource-url-state";
import {
  isDataReadError,
  type BaseRecord,
  type FilterParam,
  type Identifier,
  type SortParam,
} from "@marktiderman/genesis-core/provider";
import type { ResourceFormFieldDef } from "./ResourceFormField";
import { useCapabilities, useOne, type WizardStep } from "@marktiderman/genesis-core/hooks";
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
 * What a user may do with a list's records, for ResourcePage's `can`.
 *
 * @stability Beta
 */
export type ResourceAction = "create" | "edit" | "delete";

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
   * - `"cursor"`: loads `perPage` rows (`resourceOptions.defaultPerPage`,
   *   else the stored page size) and a "Load more" button appends the next
   *   page, by cursor where the provider serves it
   *   (`capabilities().cursorPagination`) and by offset otherwise. The
   *   server orders by `resourceOptions.defaultSort`; search, sort and
   *   filters in the toolbar act on the rows loaded so far.
   */
  pagination?: "client" | "server" | "cursor";
  /**
   * `pagination="client"` only: the most rows fetched. Default 1000. An
   * explicit `resourceOptions.defaultPerPage` wins. Keep it at or under the
   * provider's `maxPerPage` (`capabilities().maxPerPage`; 1000 by default for
   * Supabase): a larger page is refused, not cut short.
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
   * What the signed-in user may do: `can("create")`, `can("edit", item)`,
   * `can("delete", item)`. Return false to hide the New button, or a row's
   * Edit or Delete (and the built-in edit form won't open for it). Omitted,
   * everything the handlers allow is offered. A UI gate only: the server
   * must still refuse the write.
   */
  can?: (action: ResourceAction, item?: T) => boolean;
  /**
   * @deprecated Use `can` — `can={(action, item) => !item || mayChange(item)}`.
   * Removed in the next minor after one deprecation window. Still honoured:
   * a row it refuses gets no Edit and no Delete.
   */
  canEditItem?: (item: T) => boolean;
  createLabel?: string;
  /**
   * @deprecated Use `can` — `can={(action, item) => action !== "edit" || !item || mayEdit(item)}`.
   * Still honoured: a row it refuses gets no Edit.
   */
  canEdit?: (item: T) => boolean;
  /**
   * @deprecated Use `can` — `can={(action, item) => action !== "delete" || !item || mayDelete(item)}`.
   * Still honoured: a row it refuses gets no Delete.
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
  /**
   * After the built-in form saves: the row and whether it was a create or an edit (to open a
   * builder for a new row, say). A pessimistic save (the default) gives the row the server
   * returned, with its key; an optimistic or undoable one gives the values sent.
   */
  onSaved?: (row: T, action: "create" | "edit") => void;
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
  /**
   * When the built-in form's saves and deletes reach the list: `"pessimistic"`
   * (default, wait for the provider), `"optimistic"` or `"undoable"` (an Undo
   * toast). See ResourceForm `mutationMode`. `resourceOptions.mutationMode`
   * wins for deletes.
   */
  mutationMode?: MutationMode;

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
   * `"page"` (default): a full list page. `"embedded"`: a list inside
   * another page (a tab, a card, a side panel), whose page already has the
   * heading, filters and shortcuts. Embedded sets, unless you set them:
   * - `header="toolbar"`, showing only the create button, and the view
   *   toggle when there is a `renderCard`. No title, count, view settings
   *   or header options menu (`slotProps.shell.headerOptions` still win;
   *   an explicit `header="page"` keeps the full header);
   * - no filter row, unless you pass `filters`, `statusFilter`,
   *   `searchFields` or saved views, or the list is already filtered (a
   *   search in the URL, say);
   * - `keyboardNavigation={false}`, since j/k shortcuts belong to the page.
   */
  variant?: "page" | "embedded";

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
   * `resource` mode: refetch the list (and the open record) when the
   * provider reports a change, e.g. Supabase Realtime. Shorthand for
   * `resourceOptions.live`, which wins. See core's `UseResourceOptions.live`.
   */
  live?: UseResourceOptions<T>["live"];
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

/**
 * A list page for a resource: header, filters, table or cards, paging,
 * the open record's panel, and the built-in form and confirmed delete.
 * {@link useResourceTable} is the same behaviour without this markup.
 */
export function ResourcePage<
  T extends Record<string, unknown> = Record<string, unknown>,
>(props: ResourcePageProps<T>) {
  const {
    bulkActions,
    can,
    canSaveViews,
    capabilities,
    className,
    columnVisibility,
    columnVisibilityKey,
    createLabel: createLabelProp,
    detail = "panel",
    detailFields,
    detailWidth = "md",
    emptyDescription,
    emptyIcon,
    emptyMessage,
    emptyState,
    errorMessage,
    filters: filtersProp,
    formFields,
    formLayout: formLayoutProp,
    formMode,
    formSteps,
    gridCols: gridColsProp,
    header: headerProp,
    icon,
    keyboardNavigation = props.variant !== "embedded",
    mutationMode: mutationModeProp,
    onCreate,
    onSaved,
    onDelete,
    onDeleteView,
    onEdit,
    onLoadView,
    onPageChange,
    onRetry: onRetryProp,
    onSaveView,
    onSearchChange,
    onSortChange,
    openOnCardClick = false,
    pageSizeOptions,
    pagination = "client",
    renderCard: renderCardProp,
    renderDetail: renderDetailProp,
    renderForm: renderFormProp,
    renderTable: renderTableProp,
    resizableColumns,
    resizeKey,
    resource: resourceName,
    savedViews,
    searchPlaceholder,
    secondaryActions,
    slotProps,
    slots,
    stickyFirstColumn,
    stickyHeader,
    subtitle,
    title,
    toolbar,
  } = props;
  const m = useUiMessages();
  const createLabel = createLabelProp ?? m.page.create;
  const embedded = props.variant === "embedded";
  const headerMode = headerProp ?? (embedded ? "toolbar" : "page");
  const {
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
  } = useResourceTableModel<T>(props);
  // An embedded list shows a filter row only when it has something to filter by, or when
  // something is already filtering it (a `?q=` in the URL, say): never filtered with no way
  // to see why or clear it.
  const wantsFilters = !!(
    filtersProp?.length ||
    props.statusFilter ||
    props.searchFields?.length ||
    savedViews?.length ||
    onSaveView ||
    // Search or a status filter; a sort (a column click) isn't a filter.
    page.search !== "" ||
    page.statusValue.length > 0
  );

  const showCreateButton = (onCreate || useBuiltInCreate) && allows("create");
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
                      : m.common.empty}
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
                      : m.common.empty}
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
                    : m.common.empty}
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
    <>
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
        slots?.filters !== undefined ? slots.filters : embedded && !wantsFilters ? null : undefined,
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
            // Server and cursor paging search on the server, which needs the columns.
            !((resourceServerPaging || loadMore) && !serverSearchFields?.length),
          showSort: capabilities?.sort !== false,
        },
        slotProps?.filters,
      )}
      {...shellSlotProps}
      {...(embedded && headerMode === "toolbar"
        ? {
            // Only with the toolbar header: an explicit `header="page"` keeps the full header.
            headerOptions: {
              showCount: false,
              showViewSettings: false,
              showViewToggle: !!renderCardProp,
              configurable: false,
              ...shellSlotProps?.headerOptions,
            },
          }
        : {})}
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
                pagination: isServerControlled || loadMore ? false : undefined,
                // Client mode: the header sort is the page's sort, so it
                // reaches the URL and a link restores what the table shows.
                ...(isServerControlled
                  ? {}
                  : { sort: tableSort, onSortChange: handleTableSort }),
              },
              slotProps?.table,
            )
          )
          ,
          ...(openOnCardClick && renderCardProp && detail !== "none"
            ? {
                onItemClick: handleRowClick,
                getItemLabel: (item: T) => fillMessage(m.common.openItem, { name: titleOf(item) }).trim(),
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
      {loadMore && (
        <div className="flex flex-col items-center gap-1 px-3 py-2">
          {/* Stays mounted (aria-disabled, not disabled) once everything is
              loaded, so focus on it is never dropped to the page. */}
          {(loadMore.hasMore || loadMore.loaded > 0) && (
            <Button
              variant="outline"
              size="sm"
              aria-disabled={!loadMore.hasMore || loadMore.loading || undefined}
              aria-busy={loadMore.loading || undefined}
              onClick={loadMore.hasMore && !loadMore.loading ? loadMore.load : undefined}
              testID="resource-page-load-more"
            >
              {loadMore.loading
                ? m.common.loading
                : loadMore.hasMore
                  ? m.page.loadMore
                  : fillMessage(m.page.allLoaded, { loaded: loadMore.loaded.toLocaleString() })}
            </Button>
          )}
          <p
            role="status"
            aria-live="polite"
            className="sr-only"
            data-testid="resource-page-load-status"
          >
            {loadMore.lastLoaded > 0
              ? fillMessage(m.page.loadedMore, {
                  added: loadMore.lastLoaded.toLocaleString(),
                  loaded: loadMore.loaded.toLocaleString(),
                })
              : ""}
          </p>
        </div>
      )}
      {clientTruncated && (
        <p
          role="status"
          className="px-3 py-2 text-sm text-muted-foreground"
          data-testid="resource-page-truncated"
        >
          {fillMessage(m.page.truncated, {
            shown: displayData.length.toLocaleString(),
            total: displayTotal.toLocaleString(),
          })}
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
          aria-label={m.page.pagination}
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
              ? m.page.noRecords
              : fillMessage(m.page.range, { from: rangeFrom, to: rangeTo, total: displayTotal })}
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
              {m.page.previous}
            </Button>
            <span
              className="text-muted-foreground"
              data-testid="resource-page-indicator"
            >
              {fillMessage(m.page.pageOf, { page: currentPage, pages: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => pagerOnPageChange(currentPage + 1)}
              testID="resource-page-next"
            >
              {m.page.next}
              <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}

    </Shell>
    {/* The overlays sit beside the shell, not in it: the shell swaps its children for the
        empty state, and New on an empty list must still open the form. */}
      {/* Detail panel / modal — DetailPanel's `layout` prop picks the shell;
          "panel" gets its default fixed slide-in sheet, "modal" gets a
          centered dialog. Both share one implementation (header, content,
          edit/delete affordances) instead of ResourcePage hand-rolling a
          second Dialog. */}
      {(detail === "panel" || detail === "modal") && (
        renderSlot(
          DetailPanel<T>,
          slots?.detail,
          linkMissing
            ? {
                // A linked record this user can't read, or that's gone.
                item: {} as T,
                open: detailOpen,
                onClose: closeDetail,
                title: m.page.notFoundTitle,
                width: detailWidth,
                layout: detail === "modal" ? "dialog" : "sheet",
                children: () => (
                  <p className="text-sm text-muted-foreground" data-testid="resource-page-link-missing">
                    {isDataReadError(linked.error) && linked.error.outcome === "forbidden"
                      ? linked.error.message
                      : m.page.notFoundBody}
                  </p>
                ),
              }
            : {
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
            mutationMode: mutationModeProp,
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
            onSuccess: (row: Record<string, unknown>) => {
              onSaved?.(row as T, formAction);
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
    </>
  );
}
