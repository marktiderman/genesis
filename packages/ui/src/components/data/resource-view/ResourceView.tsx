// ResourceView: one line for a list screen (docs/RESOURCE-VIEW.md). It maps a view from
// genesis-core/resource-view onto ResourcePage, so it is not a second list page: paging, search,
// the peek, the form, delete, saved views and slots are all ResourcePage's. Every ResourcePage
// prop still works as an escape hatch, and the screen's own props win over the view.

import { useContext, useMemo, type ComponentType, type ReactNode } from "react";
import { useListState, useViewer, type DataRow, type ResourceContract } from "@marktiderman/genesis-core";
import { groupRows, groupTotals, plural, rowPicture, type RecordOpen, type RecordView as RecordViewDef, type ResourceView as View, type ViewGallery } from "@marktiderman/genesis-core/resource-view";
import { ResourcePage, type ResourceAction, type ResourcePageProps } from "../ResourcePage";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";
import type { SearchParamsAdapter } from "../../../navigation";
import type { ResourceUrlStateOptions } from "../../../hooks/use-resource-url-state";
import {
  adapterOf,
  choiceFilterConfigs,
  defaultSavedViewStore,
  switchableTypes,
  reasonOf,
  useListActions,
  useViewExport,
  useViewSavedViews,
  ViewFilterControls,
  ViewSegments,
  ViewTypeSwitcher,
  ListModelContext,
  type ListModel,
} from "./list-controls";
import { useResourceTable, type ResourceTableState } from "../use-resource-table";
import { useDisplayCell } from "./display";
import { useResourceViewDefaults } from "./defaults";
import { useUiMessages } from "../../../messages";
import { FilterCombobox } from "../FilterCombobox";
import type { ViewModeDefault } from "../../../hooks/use-view-preference";
import { ResourceCalendar, type ResourceCalendarOptions } from "./ResourceCalendar";
import { ResourceBoard, type ResourceBoardOptions, type ResourceBoardProps } from "./ResourceBoard";
import { RowAvatar } from "./RowAvatar";
import { galleryGridSlot } from "./ResourceGallery";
import { useViewDetailFields, useViewListParams, type Filter } from "./view-list";
import { useViewFormFields } from "./view-form";
import { listViewTypes, registerBuiltInViewType, resolveViewType, type ViewTypeName } from "./view-types";
import { detailMode, recordViewOf, resolveRecordOpen } from "./record-open";
import { recordPeekSlot } from "./RecordPeek";
import { ResourceInbox, type ResourceInboxOptions } from "./ResourceInbox";

type Row = Record<string, unknown>;
type Scalar = string | number | boolean | null;
type Defaults = Readonly<Record<string, Scalar>>;

/** What a screen sets. Anything else ResourcePage takes passes straight through. */
export interface ResourceViewOptions {
  /** `page` (default), `embedded` inside a page or tab, or `compact` for a narrow side panel. */
  layout?: "page" | "embedded" | "compact";
  /** A column preset the view defines (`"compact"`). Default: the preset's own, then `default`. */
  columns?: string | undefined;
  /** A tab the view defines: its columns and its filter. */
  preset?: string;
  /**
   * Filters sent to the server (`{ client_id: id }`); `null` means "is empty" and a list means
   * "any of" (`{ status: ["open", "blocked"] }`). A new row gets the single values too, never a list.
   */
  filter?: Filter;
  /**
   * Whether the list follows the viewer's scope (default true): inside a `ViewerScope` or
   * `WorkspaceScope`, the view's `scope` keys filter the list and start new rows, with no screen
   * code. The screen's own `filter` wins over a scope key it also sets. `false` for a list that
   * deliberately looks past the scope.
   */
  scoped?: boolean;
  /**
   * Values a new row starts with (`{ author_scope: viewer.scope }`), sent on create only. Unlike
   * `filter`, they don't narrow the list. A field the form shows starts at the value instead.
   */
  defaults?: Defaults;
  /**
   * How rows show first. The user's own pick is remembered. `{ mobile: "grid", desktop: "table" }`
   * picks per screen size (cards on a phone); without a mode, an app-wide
   * `ResourceViewDefaultsProvider phoneMode` does the same for every `layout="page"` list. `calendar` places the
   * rows by the view's `calendar` block instead: one request per visible window, a click opens the
   * peek. Calendar is never stored as the user's pick, so other lists of the resource don't open
   * in it, and no phone default turns into it. `board` shows a card per row in a column per value
   * of the view's `board` field, and moving a card writes that field; like calendar, it is never
   * stored as the user's pick.
   *
   * Prefer `type`, which takes the same values and every registered view type; `mode` stays as
   * its alias, and `type` wins when both are set.
   */
  mode?: ViewModeDefault | "calendar" | "board" | "inbox" | undefined;
  /**
   * The view type (ADR 0021): how the view shows. `table`, `list` and `grid` (the person can
   * switch between them, and their pick is remembered), `board`, `calendar`, `gallery` (the grid
   * as photos, from the view's `gallery` block), or a type the app registered with
   * `registerViewType` (`"timeline"`). `{ mobile, desktop }` picks per screen size, as `mode` does.
   */
  type?: ViewModeDefault | ViewTypeName | undefined;
  /**
   * How a record opens from this screen (ADR 0021): a `side-peek`, a `center-peek` or its `page`.
   * Default the view's `open`, else a side peek. ResourcePage's `detail` (`panel`, `modal`,
   * `route`) still works, and wins when set.
   */
  open?: RecordOpen | undefined;
  /**
   * The record view a peek draws. Default the view's `recordView`. Without either, a peek shows
   * the view's columns, as before.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView?: RecordViewDef<ResourceContract<any>, any> | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  /** The segment the list opens on (ADR 0017). Default the URL's, then the view's first. */
  defaultSegment?: string | undefined;
  /**
   * The view types the switcher offers, of the ones the view supports. The switcher shows on a
   * page list whose view supports a type past table, list and grid (or declares `types`), unless
   * the screen fixes `type`; `switcher` turns it on or off.
   */
  types?: readonly string[] | undefined;
  switcher?: boolean | undefined;
  /** Group rows by this field (`null`: no grouping). Default the person's saved choice, then the view's `groupBy`. */
  groupBy?: string | null | undefined;
  /**
   * The view's actions in the list (ADR 0017 §2): a "More" menu on each table row and the same
   * on right-click. Default the app's `ResourceViewDefaultsProvider rowActions`.
   */
  rowActions?: boolean | undefined;
  /** A refused row or bulk action: `disable` with its reason (default, or the view's), or `hide`. */
  refusals?: "disable" | "hide" | undefined;
  /** `false` turns off the view's "Export CSV" on this screen. */
  export?: boolean | undefined;
  /** Controls of the screen's own beside the view's declared filters. */
  filterSlot?: ReactNode;
  /**
   * Runs a view action on a row instead of the provider's `runAction` (RecordView's `onAction`):
   * for actions an app runs through its own function.
   */
  onAction?: ((name: string, row: Record<string, unknown>) => void | Promise<void>) | undefined;
}

export type ResourceViewProps<T extends Row = Row> = ResourceViewOptions &
  Omit<Partial<ResourcePageProps<T>>, "resource" | "columns" | "variant" | "title" | "subtitle" | "urlState" | "data"> & {
    /**
     * Keep this list in the URL: a router adapter (or ResourcePage's `{ searchParams, params }`).
     * Default: the app's `ResourceViewDefaultsProvider urlState` for a page list. `false` opts out.
     */
    urlState?: SearchParamsAdapter | ResourceUrlStateOptions | false | undefined;
    /**
     * Rows the screen already holds: drawn as given (searched, sorted and paged in the browser,
     * opened in the peek), nothing fetched. Writes stay the screen's (`onCreate`, `onEdit`,
     * `onDelete`); the built-in form and delete need the list to fetch its own rows.
     */
    rows?: T[] | undefined;
    /**
     * Draw some cells this screen's own way, by column key (an avatar beside a name). The step
     * before a slot: the column, its label, sorting and visibility stay the view's.
     */
    cells?: Partial<Record<string, (row: T) => ReactNode>>;
    /**
     * With `mode="calendar"`: overrides the view's `calendar` block (layout, weeks, the anchor) and
     * adds what it can't hold (dot colours, `onSelect`, lanes' labels).
     */
    calendar?: ResourceCalendarOptions<T>;
    /**
     * With `mode="board"`: overrides the view's `board` block (its field, columns, card fields,
     * limits) and adds what it can't hold (`onSelect`, `renderCard`, `onMoveError`).
     */
    board?: ResourceBoardOptions<T>;
    /**
     * With `mode="grid"`: overrides the view's `gallery` block (its image, size and caption fields,
     * the row height), or turns the grid into a gallery for a view without one.
     */
    gallery?: Partial<ViewGallery>;
    /**
     * With `type="inbox"`: the open record (a URL param the app owns) and `onSelectedChange`, the
     * reading pane of the app's own (`renderReading`), and the context sidebar (`renderContext`).
     */
    inbox?: ResourceInboxOptions<T>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
    view: View<ResourceContract<any>, T & DataRow>;
  };

// Moved to view-form.ts, which `<ResourceForm view>` shares; still exported from here.
export { formType } from "./view-form";

/** A column's width (px) by what it shows, for `sizeColumns`. */
const COLUMN_WIDTH: Partial<Record<string, number>> = {
  badge: 130,
  number: 96,
  currency: 110,
  percent: 90,
  boolean: 80,
  date: 120,
  datetime: 150,
  url: 160,
  email: 200,
};

/**
 * `sizeColumns`: the record's name column (the view's labelField, else the first) takes the spare
 * width; the others get a width for what they hold, so a title isn't cut short beside an equal
 * share for an id or a badge. When the label field isn't a column, the text columns share the
 * rest and only badges, numbers and dates are sized. Two columns or fewer are left alone.
 */
function columnWidth(c: { key: string; display: string }, index: number, all: readonly { key: string }[], labelField: string | undefined): number | undefined {
  if (all.length < 3) return undefined;
  const named = all.some((x) => x.key === labelField);
  const grows = named ? c.key === labelField : labelField ? false : index === 0;
  if (grows) return undefined;
  const fixed = COLUMN_WIDTH[c.display];
  return named || !labelField ? (fixed ?? 140) : fixed;
}

/** A column's width as DataTable takes it: pixels, with rem turned into pixels. */
function widthOf(width: number | string | undefined): number | string | undefined {
  if (typeof width !== "string") return width;
  const rem = /^\s*(\d+(?:\.\d+)?)rem\s*$/.exec(width);
  return rem ? Number(rem[1]) * 16 : width;
}


/** Whether a screen shows the view-type switcher, and the types it offers. */
function switcherFor(props: ResourceViewProps<Row>) {
  const types = switchableTypes(props.view as never, props.types);
  const fixed = (props.type ?? props.mode) !== undefined;
  const beyondPage = types.some((t) => t !== "table" && t !== "list" && t !== "grid");
  const on = props.switcher ?? ((props.layout ?? "page") === "page" && !fixed && (beyondPage || !!props.view.definition.types));
  return { on: on && types.length >= 2, types };
}

/** The list's state: the root's when there is one, else this list's own. */
function useListModel(props: ResourceViewProps<Row>): ListModel {
  const shared = useContext(ListModelContext);
  const defaults = useResourceViewDefaults();
  const { on, types } = switcherFor(props);
  const url = props.urlState === false ? undefined : (adapterOf(props.urlState) ?? ((props.layout ?? "page") === "page" ? (defaults.urlState ?? undefined) : undefined));
  const shown = props.type ?? props.mode;
  const own = useListState({
    view: props.view as never,
    url,
    store: defaults.savedViews ?? defaultSavedViewStore(),
    currentKey: props.viewSettingsKey ?? props.view.resource,
    defaultSegment: props.defaultSegment,
    defaultType: typeof shown === "string" ? shown : types[0],
    types,
    rememberType: on,
  });
  return shared ?? { state: own, url, switcher: null };
}

/** What useResourceViewProps makes, with the confirmation an action asks for. */
interface ResourceViewModel<T extends Row> {
  pageProps: ResourcePageProps<T>;
  confirm: ReactNode;
  /** Changes when a saved view restores the search and sort: the page starts again with them. */
  restoreKey: number;
}

/**
 * The ResourcePage props a view and a screen's options make. `useResourceView` and
 * `<ResourceView>` both use it; call it yourself to hand the props to your own layout.
 */
export function useResourceViewProps<T extends Row>(props: ResourceViewProps<T>): ResourcePageProps<T> {
  return useResourceViewModel(props).pageProps;
}

function useResourceViewModel<T extends Row>(props: ResourceViewProps<T>): ResourceViewModel<T> {
  const {
    // preset, filter and scoped are read by useViewListParams; taken out here so they aren't passed on.
    view, layout = "page", columns: columnPreset, preset: _preset, filter: _filter, scoped: _scoped, defaults, mode: modeProp, type: typeProp, open: openProp, recordView: recordViewProp, title, subtitle, can, resourceOptions, cells, tree: screenTree,
    calendar: _calendar, board: _board, gallery: screenGallery, detail: screenDetail,
    noun: screenNoun, nounPlural: screenNounPlural, formTitles: screenFormTitles, countFormat: screenCountFormat,
    defaultSegment: _defaultSegment, types: _types, switcher: _switcher, groupBy: screenGroupBy, rowActions: screenRowActions, refusals: screenRefusals,
    export: screenExport, filterSlot, onAction, urlState: _urlState, rows, inbox: _inbox,
    ...rest
  } = props;
  const model = useListModel(props as ResourceViewProps<Row>);
  const listState = model.state;
  // `type` is the preferred name; `mode` its alias. A gallery is the grid view drawn as photos.
  const shown = typeProp ?? modeProp;
  const gallery = shown === "gallery";
  const mode = gallery ? "grid" : shown;
  if (typeof mode === "string" && !PAGE_TYPES.has(mode)) {
    throw new Error(`ResourceView(${view.resource}): type "${mode}" isn't drawn by the list page; render <ResourceView type="${mode}"> (useResourceView covers table, list, grid and gallery)`);
  }
  if (gallery && !view.definition.gallery && !screenGallery?.image) {
    throw new Error(`ResourceView(${view.resource}): type="gallery" needs a gallery block: the view's gallery.image, or gallery={{ image }}`);
  }
  const cell = useDisplayCell();
  const viewer = useViewer();
  const listDefaults = useResourceViewDefaults();
  const { filter, filters: defaultFilters, tab } = useViewListParams(props);
  const segmentColumns = view.segments().find((seg) => seg.id === listState.segment)?.columns;
  const presetName = columnPreset ?? listState.columns ?? segmentColumns ?? tab?.columns ?? "default";

  const columns = useMemo(
    () =>
      view.columns(presetName).map((c, index, all) => {
        const draw = (row: T) => (cells?.[c.key] ? cells[c.key]!(row) : cell(c as never, row));
        const width = listDefaults.sizeColumns ? columnWidth(c, index, all, view.labelField) : undefined;
        const declared = widthOf(c.width);
        return {
          key: c.key,
          header: c.label,
          ...(declared !== undefined ? { width: declared } : width ? { width } : {}),
          ...(c.hideBelow ? { hideBelow: c.hideBelow } : {}),
          ...(c.emphasis ? { emphasis: c.emphasis } : {}),
          ...(c.sortable === false ? { sortable: false } : {}),
          // A computed column has no database column to sort by.
          ...(c.field ? {} : { sortable: false, accessor: (row: T) => c.value(row as T & DataRow) }),
          // The summary's picture sits beside the first column.
          render:
            index === 0
              ? (row: T) => {
                  const picture = rowPicture(view.summary(row as T & DataRow));
                  return picture ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <RowAvatar picture={picture} />
                      <span className="min-w-0 truncate">{draw(row)}</span>
                    </span>
                  ) : (
                    draw(row)
                  );
                }
              : draw,
        };
      }),
    [view, presetName, cell, cells, listDefaults.sizeColumns],
  );

  // The peek: sensitive values and columns the view leaves out stay out.
  const detailFields = useViewDetailFields(view, cells);

  // The form: the same builder `<ResourceForm view>` uses. `filter` already holds the scope.
  const formFields = useViewFormFields(view, { filter, defaults, scoped: false });

  // Guards only narrow: the view's rule AND the screen's own `can`. They read the viewer, so a
  // new viewer or new roles asks them again.
  const allows = useMemo(
    () => (action: ResourceAction, item?: T) => {
      if (can && !can(action, item)) return false;
      if (action === "create") return view.can("create", viewer) === true;
      if (!item) return true;
      return view.can(action === "edit" ? "update" : "delete", item as T & DataRow, viewer) === true;
    },
    [view, can, viewer],
  );

  const orderBy = view.definition.orderBy;
  const copy = view.definition.copy;
  // The form's words, each from the screen's `formTitles` over the view's `copy.form`.
  const formWords = {
    create: screenFormTitles?.create ?? copy?.form?.createTitle,
    edit: screenFormTitles?.edit ?? copy?.form?.editTitle,
    createSubmit: screenFormTitles?.createSubmit ?? copy?.form?.createSubmit,
    editSubmit: screenFormTitles?.editSubmit ?? copy?.form?.editSubmit,
    createDescription: screenFormTitles?.createDescription ?? copy?.form?.createDescription,
    editDescription: screenFormTitles?.editDescription ?? copy?.form?.editDescription,
  };
  const givenWords = Object.fromEntries(Object.entries(formWords).filter(([, words]) => !!words));
  const formTitles = Object.keys(givenWords).length ? (givenWords as NonNullable<ResourcePageProps<T>["formTitles"]>) : undefined;
  // Tree mode (`tree`) needs every row: a page of a tree would cut parents from their children,
  // and a server-side search would drop the ancestors that give a match its place.
  if (screenTree && rest.pagination !== undefined && rest.pagination !== "client") {
    throw new Error(
      `ResourceView(${view.resource}): tree needs every row on the client; pagination="${rest.pagination}" can't page a tree. Leave pagination unset.`,
    );
  }
  // A gallery block draws the grid view as photos. The screen's own grid slot still wins.
  const galleryKey = JSON.stringify(screenGallery ?? null);
  const gallerySlot = useMemo(
    () => (view.definition.gallery || screenGallery?.image ? galleryGridSlot<T>(view, screenGallery) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the override by value, not identity
    [view, galleryKey],
  );
  const searchFields = rest.searchFields ?? (view.labelField ? [view.labelField] : undefined);
  const recordView = recordViewOf(view, recordViewProp);
  const peekSlot = useMemo(() => (recordView ? recordPeekSlot<T>(recordView) : undefined), [recordView]);

  // ── ADR 0017: what the view declares for its lists ─────────────────────
  const m = useUiMessages();
  const refusals = screenRefusals ?? view.definition.refusals ?? "disable";
  const actions = useListActions<T>(view, {
    refusals,
    ...(onAction ? { onRun: onAction as (name: string, row: T) => void | Promise<void> } : {}),
  });
  const showRowActions = (screenRowActions ?? listDefaults.rowActions ?? false) && view.actions().length > 0;
  const onExportView = useViewExport(view as never, presetName);
  const savedViewProps = useViewSavedViews(
    view as never,
    layout === "page" ? (listDefaults.savedViews ?? undefined) : undefined,
    listState,
    { columns: presetName, url: model.url },
  );
  // Grouping: the screen's, then the person's saved choice. A view's own `groupBy` (the board's and
  // `groupRows`' default) doesn't group a table by itself: a screen opts in with
  // `groupBy={view.definition.groupBy}`. Rows come sorted by the group first, so each group is one
  // run, and the view's `orderBy` sorts inside it.
  const groupField = screenGroupBy !== undefined ? screenGroupBy : listState.groupBy !== undefined ? listState.groupBy : undefined;
  const grouping = groupField && !screenTree ? groupField : null;
  const totals = view.definition.totals as Readonly<Record<string, string>> | undefined;
  // Totals cover the rows loaded: on a server-paged list that's the page, and the words say so.
  const pagedTotals = !screenTree && rows === undefined;
  const totalWords = (items: T[]) => {
    const words = Object.entries(groupTotals(view, items as (T & DataRow)[]))
      .filter(([, n]) => n !== null)
      .map(([field, n]) => `${view.label(field)}: ${n!.toLocaleString()}`)
      .join(" · ");
    return words && pagedTotals ? `${words} ${m.table.loadedOnly}` : words;
  };
  const groupOf = grouping
    ? (row: T) => {
        const g = groupRows(view, [row as T & DataRow], { field: grouping })[0]!;
        return { key: g.key, label: g.label };
      }
    : undefined;
  const paged = !screenTree && rows === undefined;
  const filtersRow = view.segments().length || view.filters().length || filterSlot;
  const listFilters = listState.filters;
  const segmentsNode = view.segments().length ? (
    <ViewSegments view={view as never} value={listState.segment} onChange={listState.setSegment} baseFilters={[...defaultFilters, ...listState.valueFilters]} enabled={rows === undefined} />
  ) : null;
  const extraFilters =
    view.filters().some((f) => f.kind !== "choice") || filterSlot ? (
      <>
        <ViewFilterControls view={view as never} state={listState} />
        {filterSlot}
      </>
    ) : null;
  const choiceFilters = choiceFilterConfigs(view as never, listState);
  const shellOptions = model.switcher ? { headerOptions: { showViewToggle: false, ...rest.slotProps?.shell?.headerOptions } } : {};
  const typeMode = model.switcher
    ? listState.type === "table" || listState.type === "list" || listState.type === "grid"
      ? listState.type
      : listState.type === "gallery"
        ? ("grid" as const)
        : undefined
    : undefined;

  const pageProps = {
    resource: view.resource,
    title: title ?? view.title,
    ...((subtitle ?? copy?.subtitle) ? { subtitle: subtitle ?? copy?.subtitle } : {}),
    columns,
    variant: layout === "page" ? "page" : "embedded",
    // The screen's mode first, then a compact list's rows, then the app's phone default. A
    // screen's own `defaultView` (in `rest`) still overrides all three. The phone default is a
    // full page's only: an embedded list hides the view switch, so cards there would have no
    // way back to the table.
    ...(mode
      ? { defaultView: mode as ViewModeDefault }
      : layout === "compact"
        ? { defaultView: "list" as const }
        : layout === "page" && listDefaults.phoneMode
          ? { defaultView: { mobile: listDefaults.phoneMode, desktop: "table" as const } }
          : {}),
    ...(view.labelField ? { titleField: view.labelField } : {}),
    getTitle: (row: T) => view.summary(row as T & DataRow).title,
    // Never ResourcePage's default (the second column's raw value, which skips `when`).
    getSubtitle: (row: T) => view.summary(row as T & DataRow).subtitle,
    detailFields,
    // Server paging by default: a list never loads a whole table to search it in the browser.
    // A tree loads every row (up to `clientRowLimit`, with the page's "only N loaded" warning).
    pagination: screenTree ? "client" : "server",
    ...(screenTree ? { tree: screenTree } : {}),
    formFields,
    // Only the view's own fields make a form: the hidden ones a filter or defaults add don't.
    allowCreate: formFields.some((f) => !f.hidden),
    allowEdit: formFields.some((f) => !f.hidden),
    allowDelete: true,
    can: allows,
    // The record's name for the count and the form: the screen's, else the view's (its copy, then
    // the contract's). A screen noun without a plural gets that noun's plural, never the view's.
    noun: screenNoun ?? view.noun,
    nounPlural: screenNounPlural ?? (screenNoun ? plural(screenNoun) : view.nounPlural),
    // Per entry: a screen's title or count words replace only the ones it names.
    ...(copy?.count || screenCountFormat ? { countFormat: { ...copy?.count, ...screenCountFormat } } : {}),
    ...(formTitles ? { formTitles } : {}),
    ...(copy?.create ? { createLabel: copy.create } : {}),
    ...(copy?.empty?.title ? { emptyMessage: copy.empty.title } : {}),
    ...(copy?.empty?.body ? { emptyDescription: copy.empty.body } : {}),
    ...(searchFields ? { searchFields } : {}),
    // How a record opens: ResourcePage's own `detail` first, then the screen's `open`, then the view's.
    detail: detailMode(resolveRecordOpen(view, screenDetail, openProp)),
    ...rest,
    ...(gallerySlot && rest.slots?.grid === undefined ? { slots: { ...rest.slots, grid: gallerySlot } } : {}),
    // A peek draws the view's record view when it names one, unless the screen draws its own.
    ...(peekSlot && rest.slots?.detail === undefined && !rest.renderDetail
      ? { slots: { ...rest.slots, ...(gallerySlot && rest.slots?.grid === undefined ? { grid: gallerySlot } : {}), detail: peekSlot } }
      : {}),
    // The app's `clipCells` and `sizeColumns` under the screen's own table props, which win.
    ...(listDefaults.clipCells || listDefaults.sizeColumns
      ? {
          slotProps: {
            ...rest.slotProps,
            table: {
              ...(listDefaults.clipCells ? { clipCells: true } : {}),
              ...(listDefaults.sizeColumns ? { minWidth: "auto" as const } : {}),
              ...rest.slotProps?.table,
            },
          },
        }
      : {}),
    // The app's `pagerJumps`, under the screen's own.
    ...(listDefaults.pagerJumps && rest.pagerJumps === undefined ? { pagerJumps: true } : {}),
    resourceOptions: {
      ...resourceOptions,
      ...(defaultFilters.length || listFilters.length ? { defaultFilters: [...defaultFilters, ...listFilters] } : {}),
      ...(grouping && !resourceOptions?.defaultSort
        ? {
            defaultSort: { field: grouping, order: "asc" as const },
            ...(orderBy && orderBy.field !== grouping && !resourceOptions?.thenSort
              ? { thenSort: { field: orderBy.field, order: orderBy.direction ?? "asc", ...(orderBy.nulls ? { nulls: orderBy.nulls } : {}) } }
              : {}),
          }
        : orderBy && !resourceOptions?.defaultSort
          ? { defaultSort: { field: orderBy.field, order: orderBy.direction ?? "asc", ...(orderBy.nulls ? { nulls: orderBy.nulls } : {}) } }
          : {}),
    },
  } as ResourcePageProps<T>;

  // Rows the screen holds: drawn as given, nothing fetched.
  if (rows !== undefined) {
    delete (pageProps as { resource?: string }).resource;
    pageProps.data = rows;
    pageProps.total = rows.length;
    pageProps.pagination = "client";
    pageProps.viewSettingsKey = rest.viewSettingsKey ?? view.resource;
  }
  // The URL: the app's adapter for a page list, unless the screen opts out.
  // A screen's own adapter (or options with renamed keys) wins; `false` keeps the list out.
  if (props.urlState) pageProps.urlState = props.urlState;
  else if (model.url && props.urlState !== false) pageProps.urlState = model.url;
  // Declared filters and segments: the segments above the search row, choices as the filter
  // row's comboboxes, ranges and text beside them; they count as filtering.
  if (filtersRow) {
    pageProps.filters = [...choiceFilters, ...(rest.filters ?? [])];
    pageProps.heldFilters = { active: listState.active, clear: listState.clear };
    pageProps.slotProps = {
      ...pageProps.slotProps,
      filters: {
        ...(segmentsNode ? { leading: segmentsNode } : {}),
        ...(extraFilters ? { extra: extraFilters } : {}),
        extraActive: Object.entries(listState.values).some(([field]) => view.filters().find((f) => f.field === field)?.kind !== "choice"),
        ...rest.slotProps?.filters,
      },
    };
  }
  // The view-type switcher: in the header, in place of ResourcePage's own toggle.
  if (model.switcher) {
    pageProps.toolbar = (
      <>
        {model.switcher}
        {rest.toolbar}
      </>
    );
    pageProps.slotProps = { ...pageProps.slotProps, shell: { ...rest.slotProps?.shell, ...shellOptions } };
    if (typeMode) {
      pageProps.viewMode = typeMode;
      pageProps.onViewModeChange = (mode) => listState.setType(mode);
    }
  }
  // The list's search and sort reach the list state (a saved view stores them), and a saved view's
  // come back as the page's starting search and sort.
  const screenQuery = rest.onQueryChange;
  pageProps.onQueryChange = (query) => {
    listState.observeQuery(query);
    screenQuery?.(query);
  };
  if (listState.restore.nonce > 0 && !rest.initialFilters) {
    const { search, sort } = listState.restore;
    pageProps.initialFilters = [
      ...(search ? [{ field: "__search__", operator: "contains" as const, value: search }] : []),
      ...(sort ? [{ field: "__sort__", operator: "eq" as const, value: `${sort.field}:${sort.order}:` }] : []),
    ];
  }
  // Saved views through the app's store.
  Object.assign(pageProps, savedViewProps, {
    ...(rest.savedViews ? { savedViews: rest.savedViews } : {}),
    ...(rest.onSaveView ? { onSaveView: rest.onSaveView } : {}),
    ...(rest.onLoadView ? { onLoadView: rest.onLoadView } : {}),
    ...(rest.onDeleteView ? { onDeleteView: rest.onDeleteView } : {}),
  });
  // Row actions with their reasons, and bulk actions from the view beside the screen's.
  if (showRowActions && rest.rowMenu === undefined) pageProps.rowMenu = actions.rowMenu;
  if (actions.bulkActions.length) pageProps.bulkActions = [...actions.bulkActions, ...(rest.bulkActions ?? [])];
  // A view that runs actions on many rows deletes many too, through the page's own delete (its
  // `can`, the recycle-bin wording, one confirm step). Not with the screen's `onDelete` or `rows`.
  if (actions.bulkActions.length && rest.allowDelete !== false && rest.bulkDelete === undefined && rows === undefined) {
    pageProps.bulkDelete = { reason: (row: T) => reasonOf(view.can("delete", row as T & DataRow, viewer)) };
  }
  // "Export CSV": the view's, unless the screen turns it off or brings its own.
  if (onExportView && screenExport !== false && !rest.onExport && rows === undefined) pageProps.onExport = onExportView;
  // Grouping and totals, tone: the table's and the cards' own props, under the screen's.
  const tableExtras = {
    ...(view.definition.rowTone ? { rowTone: (row: T) => view.rowTone(row as T & DataRow) } : {}),
    ...(groupOf ? { groups: { of: groupOf, ...(totals ? { summary: totalWords } : {}), persistKey: `${view.resource}:${grouping}`, partial: paged } } : {}),
    ...(totals
      ? {
          footerPartial: pagedTotals,
          footer: (items: T[]) =>
            Object.fromEntries(
              Object.entries(groupTotals(view, items as (T & DataRow)[])).map(([field, n]) => [field, n === null ? null : n.toLocaleString()]),
            ),
        }
      : {}),
  };
  if (Object.keys(tableExtras).length) {
    pageProps.slotProps = { ...pageProps.slotProps, table: { ...tableExtras, ...pageProps.slotProps?.table } };
  }
  if (groupOf) {
    pageProps.slotProps = { ...pageProps.slotProps, grid: { groupOf, ...(totals ? { groupSummary: totalWords } : {}), ...pageProps.slotProps?.grid } };
  }

  const confirming = actions.confirming;
  const confirm = (
    <ConfirmDeleteDialog
      open={confirming !== null}
      onOpenChange={(open) => !open && actions.setConfirming(null)}
      onConfirm={async () => {
        await confirming?.run();
      }}
      title={confirming?.title ?? ""}
      description=""
      confirmLabel={confirming?.label ?? m.common.save}
    />
  );
  return { pageProps, confirm, restoreKey: listState.restore.nonce };
}

/**
 * A list screen from a view, in one line:
 *
 * ```tsx
 * <ResourceView view={brandsView} />
 * <ResourceView view={sessionsView} layout="embedded" filter={{ client_id: id }} columns="compact" />
 * <ResourceView view={leaguesView} tree={{ getParentId: (l) => l.parent_id, defaultExpanded: 1 }} />
 * <ResourceView view={tasksView} type="board" open="center-peek" />
 * ```
 *
 * `type` picks the view type (ADR 0021): Genesis's table, list, grid, board, calendar and gallery,
 * or one registered with `registerViewType`. A record opens as the view's `open` says.
 *
 * Customise in steps: a screen setting, then the view (every screen gets it), then a slot
 * (`slots`, `renderDetail`, `toolbar`), then `useResourceView` with your own layout.
 */
export function ResourceView<T extends Row = Row>(props: ResourceViewProps<T>) {
  return <ResourceViewRoot<T> {...props} />;
}

/** The view types ResourcePage draws (the person's table, list and grid, and the gallery). */
const PAGE_DRAWN: ReadonlySet<string> = new Set(["table", "list", "grid", "gallery"]);

/**
 * One list state for every view type below it (the segment, the declared filters, the type and
 * the grouping), and, on a page list whose view supports more than table, list and grid, the
 * type switcher with the person's choice kept in the app's store (ADR 0017).
 */
function ResourceViewRoot<T extends Row>(props: ResourceViewProps<T>) {
  const own = useListModel(props as ResourceViewProps<Row>);
  const { on, types } = switcherFor(props as ResourceViewProps<Row>);
  const fixed = props.type ?? props.mode;
  const type = on ? (own.state.type ?? types[0]!) : typeof fixed === "string" ? fixed : undefined;
  const switcher = on ? <ViewTypeSwitcher types={types} value={type} onChange={own.state.setType} /> : null;
  const model = useMemo(() => ({ ...own, switcher }), [own, switcher]);
  const page = type === undefined || PAGE_DRAWN.has(type);
  // The inbox draws its own segments (its rail), filters and switcher (over its list).
  const bar = !page && type !== "inbox" && (switcher || props.view.segments().length > 0 || props.view.filters().length > 0 || props.filterSlot);
  return (
    <ListModelContext.Provider value={model}>
      {page ? (
        <ResourceViewOfType<T> {...props} {...(on ? { type: type === "gallery" ? "gallery" : undefined, mode: undefined } : {})} />
      ) : bar ? (
        <div className="space-y-3">
          <ListBar<T> {...props} />
          <ResourceViewOfType<T> {...props} type={type} />
        </div>
      ) : (
        <ResourceViewOfType<T> {...props} type={type} />
      )}
    </ListModelContext.Provider>
  );
}

/** Above a board, a calendar or an app's type: the segments, the declared filters and the switcher. */
function ListBar<T extends Row>(props: ResourceViewProps<T>) {
  const model = useContext(ListModelContext)!;
  const { view } = props;
  const { filters } = useViewListParams(props);
  const choice = choiceFilterConfigs(view as never, model.state);
  return (
    <div data-slot="view-list-bar" className="flex flex-wrap items-center gap-2">
      <ViewSegments view={view as never} value={model.state.segment} onChange={model.state.setSegment} baseFilters={[...filters, ...model.state.valueFilters]} />
      {choice.map((f) => (
        <FilterCombobox key={f.key} label={f.label} icon={f.icon} options={f.options} selected={f.selected} onChange={f.onChange} labelMap={f.labelMap} />
      ))}
      <ViewFilterControls view={view as never} state={model.state} />
      {props.filterSlot}
      <span className="ml-auto">{model.switcher}</span>
    </div>
  );
}

function ResourceViewOfType<T extends Row = Row>(props: ResourceViewProps<T>) {
  // Each view type is its own component, so switching type swaps children rather than hooks.
  const shown = props.type ?? props.mode;
  const model = useContext(ListModelContext);
  if (model && (shown === undefined || shown === "table" || shown === "list" || shown === "grid")) return <ResourceViewPage<T> {...props} />;
  if (shown === undefined || typeof shown !== "string") return <ResourceViewPage<T> {...props} />;
  const type = resolveViewType(shown);
  if (!type) {
    throw new Error(`ResourceView(${props.view.resource}): no view type "${shown}"; registered: ${listViewTypes().map((t) => t.id).join(", ")}. Register it with registerViewType.`);
  }
  const Render = type.render as ComponentType<ResourceViewProps<T>>;
  return <Render {...props} />;
}

function ResourceViewPage<T extends Row>(props: ResourceViewProps<T>) {
  const { pageProps, confirm, restoreKey } = useResourceViewModel(props);
  return (
    <>
      <ResourcePage<T> key={restoreKey} {...pageProps} />
      {confirm}
    </>
  );
}

/** How a board or calendar opens a record: the screen's `detail`, then `open`, then the view's. */
function openProps<T extends Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: View<ResourceContract<any>, T & DataRow>,
  detail: ResourceViewProps<T>["detail"],
  open: RecordOpen | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView: RecordViewDef<ResourceContract<any>, any> | undefined,
  onNavigate: ResourceViewProps<T>["onNavigate"],
) {
  const mode = resolveRecordOpen(view, detail, open);
  return {
    open: mode,
    ...(recordView ? { recordView } : {}),
    ...(onNavigate ? { onNavigate } : {}),
  };
}

/** `mode="calendar"`: the same view, scope and filters, placed by a date field. */
function ResourceViewCalendar<T extends Row>(props: ResourceViewProps<T>) {
  const { view, calendar, title, subtitle, className, cells, open, recordView, onNavigate, detail } = props;
  const words = subtitle ?? view.definition.copy?.subtitle;
  const { filters: base, select, enabled, live } = useViewListParams(props);
  const listFilters = useContext(ListModelContext)?.state.filters;
  const filters = useMemo(() => [...base, ...(listFilters ?? [])], [base, listFilters]);
  return (
    <ResourceCalendar<T>
      {...(calendar ?? {})}
      view={view}
      {...openProps<T>(view, detail, open, recordView, onNavigate)}
      filters={filters}
      {...(select !== undefined ? { select } : {})}
      enabled={enabled}
      {...(live !== undefined ? { live } : {})}
      {...(cells ? { cells } : {})}
      title={title ?? view.title}
      {...(words ? { subtitle: words } : {})}
      {...(className ? { className } : {})}
    />
  );
}

/** `mode="board"`: the same view, scope and filters, a column per value of the board's field. */
function ResourceViewBoard<T extends Row>(props: ResourceViewProps<T>) {
  const { view, board, title, subtitle, className, cells, can, resourceOptions, open, recordView, onNavigate, detail } = props;
  const words = subtitle ?? view.definition.copy?.subtitle;
  const { filters: base, select, enabled, live } = useViewListParams(props);
  const listFilters = useContext(ListModelContext)?.state.filters;
  const filters = useMemo(() => [...base, ...(listFilters ?? [])], [base, listFilters]);
  return (
    <ResourceBoard<T>
      {...(board ?? {})}
      view={view}
      {...openProps<T>(view, detail, open, recordView, onNavigate)}
      filters={filters}
      {...(can ? { can } : {})}
      {...(resourceOptions ? { resourceOptions: resourceOptions as NonNullable<ResourceBoardProps<T>["resourceOptions"]> } : {})}
      {...(select !== undefined ? { select } : {})}
      enabled={enabled}
      {...(live !== undefined ? { live } : {})}
      {...(cells ? { cells } : {})}
      title={title ?? view.title}
      {...(words ? { subtitle: words } : {})}
      {...(className ? { className } : {})}
    />
  );
}

/**
 * The headless form: the same state as `useResourceTable`, from a view. Table, list, grid and
 * gallery only; a board, a calendar or an app's view type has no table state (`useViewBoard`,
 * `useViewCalendarRange` and `useViewList` are theirs).
 */
export function useResourceView<T extends Row = Row>(props: ResourceViewProps<T>): ResourceTableState<T> {
  const shown = props.type ?? props.mode;
  if (shown === "calendar" || shown === "board" || shown === "inbox") {
    const part = shown === "calendar" ? "ResourceCalendar" : shown === "board" ? "ResourceBoard" : "ResourceInbox";
    throw new Error(`useResourceView(${props.view.resource}): ${shown} mode has no table state; render <ResourceView type="${shown}"> or <${part}>`);
  }
  return useResourceTable<T>(useResourceViewProps(props));
}

// Genesis's own view types. The list page draws table, list and grid (the person switches between
// them) and the gallery; the board and the calendar are their own components.
const PAGE_TYPES: ReadonlySet<string> = new Set(["table", "list", "grid"]);
registerBuiltInViewType({ id: "table", label: "Table", render: ResourceViewPage });
registerBuiltInViewType({ id: "list", label: "List", render: ResourceViewPage });
registerBuiltInViewType({ id: "grid", label: "Grid", render: ResourceViewPage });
registerBuiltInViewType({ id: "gallery", label: "Gallery", render: ResourceViewPage });
registerBuiltInViewType({ id: "board", label: "Board", render: ResourceViewBoard });
registerBuiltInViewType({ id: "calendar", label: "Calendar", render: ResourceViewCalendar });
registerBuiltInViewType({ id: "inbox", label: "Inbox", render: ResourceInbox });
