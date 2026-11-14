// What a resource means to people (docs/RESOURCE-VIEW.md, "View"). Types only: no React, no
// DOM, so web, native and the extension all import the same view.

import type { GalleryItem } from "../gallery";
import type { ChipTone } from "../resource/status";
import type { DataRow, FieldSchema, ResourceContract, RowAction, RowOf } from "../schema/types";
import type { Viewer } from "../viewer";
import type { FilterParam } from "../provider/types";
import type { ResourceScope } from "../hooks/viewer-scope";

export type { RowOf, Viewer };

/** A chip's colour: the one Genesis tone set (`ChipTone`, genesis-core/resource). */
export type ViewTone = ChipTone;

/**
 * How a value is shown. A hint: each platform registers one renderer per hint, so the shared view
 * never imports a platform. Derived from the field when the view doesn't say.
 */
export type DisplayHint =
  | "text"
  | "longText"
  | "number"
  | "currency"
  | "percent"
  | "boolean"
  | "badge"
  | "date"
  | "datetime"
  | "relation"
  | "url"
  | "email"
  | "image"
  | "json";

/** The field names a contract declares; `string` when the contract isn't a literal. */
export type FieldNameOf<C extends ResourceContract> = C["fields"][number]["name"];

/** What a view says about one field. Every key is optional; the contract fills the rest. */
export interface ViewField<Row extends DataRow = DataRow> {
  /** The field's label. Default: the contract's label, then the name in title case. */
  label?: string;
  display?: DisplayHint;
  /** A badge's tone per value, e.g. `{ active: "success", archived: "muted" }`. */
  tones?: Readonly<Record<string, ViewTone>>;
  /**
   * The words for a value, e.g. `{ draft: "In progress" }`: badges, form choices, group titles.
   * A value without one shows in title case. Keys must be the field's enum values, if it has any.
   */
  labels?: Readonly<Record<string, string>>;
  /**
   * For a link (`relation`): the linked row's field that names it, e.g. `"full_name"`. Default:
   * the linked resource's `labelField` (`provider.describe`), else a `name`/`title`-like field.
   */
  labelField?: string;
  /**
   * For a link: the words when the linked row is hidden from this viewer or gone, e.g.
   * `"Someone you can't see"`. Default: the catalogue's `common.hiddenLink`. Never the raw id.
   */
  missingLabel?: string;
  /**
   * For a link: edit it in the view's forms with a picker, and how the picker lists the rows it
   * can point at. Setting it (`{}` is enough) opts the link in; without it (or the view's
   * `editLinks`) a link stays read-only. `view` narrows it to the linked view's rules (its scope
   * and default filter); `filter` adds more.
   */
  link?: ViewLink;
  /** Longest text a form accepts. Feeds the derived validation. */
  max?: number;
  /**
   * In a form: the browser's autofill token (`email`, `tel`, `given-name`, `one-time-code`,
   * `off`, ...). Unset, the input carries no `autocomplete` attribute and gets no token from its
   * type, so the browser applies its own heuristics (it may still offer to fill it). Set a token
   * where the form is about the viewer, and `off` on a form about someone else (an admin editing
   * a member) to ask the browser not to fill in the person at the keyboard.
   */
  autoComplete?: string;
  /** In a form: which on-screen keyboard a phone shows. Unset, it follows the field's type. */
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  /** In a form: the label on the keyboard's Return key (`next`, `done`, `go`, `search`, `send`). */
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  /** Shown read-only even where the server would accept a write. Never widens. */
  readOnly?: boolean;
  /**
   * Show the cell only when the row (and the viewer) say so: for values a server function masks
   * by policy (`(row) => row.author_visible`). The masking itself is the server's. It hides
   * table cells and the peek only: not workspace settings, an edit form's prefilled values, a
   * view's `summary` or header, or sorting and searching on the column.
   */
  when?: (row: Row, viewer: Viewer) => boolean;
  /** In a form: show the field only while this holds for the form's values. A hidden field isn't saved. */
  visible?: (values: Readonly<Record<string, unknown>>) => boolean;
  /**
   * A timestamp's clock: the viewer's (default), the scope's (the zone of whatever the screen is
   * scoped to: ViewerScope's `scopeTimeZone`, or NativeResourceView's prop), or a fixed IANA zone.
   * Closed: any other word (the removed `"practice"`) is a type error, and `defineView` refuses a
   * zone the runtime doesn't know.
   */
  timeZone?: ViewTimeZone;
  /**
   * How much the field matters in a row (ADR 0017): `title` (the row's name, strongest; one per
   * view, default the `labelField`), `secondary` or `muted`. Meaning, not markup: each platform
   * and brand decides how it looks.
   */
  emphasis?: ViewEmphasis;
  /** `false` keeps the column's header from sorting the list (a value the server can't order by). */
  sortable?: boolean;
  /** Hide the column below this screen width on the web: `sm`, `md`, `lg` or `xl`. */
  hideBelow?: ViewBreakpoint;
  /** The column's starting width: a number of pixels, or a CSS length (`"12rem"`). */
  width?: number | string;
}

/** How much a field matters in a row (`ViewField.emphasis`). @stability Beta */
export type ViewEmphasis = "title" | "secondary" | "muted";

/** A screen width a column hides below (`ViewField.hideBelow`). @stability Beta */
export type ViewBreakpoint = "sm" | "md" | "lg" | "xl";

/**
 * A field a person can narrow the list by (ADR 0017, `defineView`'s `filters`). The platform
 * draws it from what the contract and the view know: a field with choices (an enum, a yes/no)
 * gets multi-select chips in its words and tones, a date or number a range, a text field
 * "contains". Every value is sent to the server, never applied to loaded rows.
 *
 * @stability Beta
 */
export interface ViewFilter<Name extends string = string> {
  field: Name;
  /** The filter's label. Default the field's. */
  label?: string;
  /** Default from the field: `choice` for an enum or yes/no, `range` for a date or number, else `text`. */
  kind?: ViewFilterKind;
  /** For `choice`: narrow the values offered (and, for a field without fixed values, name them). */
  options?: readonly string[];
  /** The value the filter starts at: values for a choice, `{ gte, lte }` for a range, words for text. */
  default?: ViewFilterValue;
}

/** How a declared filter narrows the list. @stability Beta */
export type ViewFilterKind = "choice" | "range" | "text";

/**
 * A declared filter's value: the chosen values (`choice`), a range (`{ gte, lte }`, either end
 * open) or words (`text`, matched as "contains").
 *
 * @stability Beta
 */
export type ViewFilterValue = readonly string[] | { readonly gte?: string; readonly lte?: string } | string;

/**
 * Which rows a segment holds: equality per field, `null` for "is empty", a list for "any of", and
 * `{ gte, lte }` for a range. Sent to the server with the list request.
 *
 * @stability Beta
 */
export type SegmentWhere<Name extends string = string> = Readonly<
  Partial<Record<Name, string | number | boolean | null | readonly (string | number)[] | { readonly gte?: string | number; readonly lte?: string | number }>>
>;

/**
 * A named tab over a list ("Open", "Mine", "All") with its own filter and an optional count
 * (ADR 0017). Not a preset (a screen's fixed columns and filter) and not a saved view (a person's
 * own).
 *
 * @stability Beta
 */
export interface ViewSegment<Name extends string = string> {
  /** Lowercase letters, digits, `-` and `_`: it goes in the URL (`?seg=open`). */
  id: string;
  label: string;
  /** Its rows, or a function of the viewer for one relative to them (`(v) => ({ owner_id: v.id })`). No `where`: every row. */
  where?: SegmentWhere<Name> | ((viewer: Viewer) => SegmentWhere<Name>);
  /**
   * Arguments for a function-backed source (`source.args`'s `take`), sent as equality filters the
   * function takes and the query leaves out: `{ inbox_view: "mine" }`. Not fields, so not checked
   * against the contract.
   */
  args?: Readonly<Record<string, string | number | boolean | null>>;
  /** Show a count beside the label: one count request through the provider. */
  count?: boolean;
  /** A column preset the segment shows (`columns`). Default the screen's. */
  columns?: string;
}

/** A group or footer total (`defineView`'s `totals`). @stability Beta */
export type ViewTotal = "sum" | "avg" | "min" | "max" | "count";

/**
 * A view's CSV export (ADR 0017 §8). The default columns are the column preset's, minus sensitive
 * fields and computed columns; values are written in words (a badge's label) unless `raw`.
 *
 * @stability Beta
 */
export interface ViewExport<Name extends string = string> {
  /** The fields exported, in order. Default the shown preset's field columns. */
  columns?: readonly Name[];
  /** The file's name, without `.csv`. Default the view's plural noun. */
  filename?: string;
  /** Stop after this many rows (the file says it was cut short). Default 10 000. */
  maxRows?: number;
  /** Write stored values (codes) instead of their words. Default false. */
  raw?: boolean;
}

/**
 * What a bulk action runs on: the selected rows, or (only for a `run` that says `matching`) every
 * row the list's filters, segment and search match, sent as those filters and never as ids.
 *
 * @stability Beta
 */
export type BulkTarget<Row extends DataRow = DataRow> =
  | { readonly kind: "rows"; readonly rows: readonly Row[] }
  | { readonly kind: "matching"; readonly filters: readonly FilterParam[]; readonly search?: { readonly query: string; readonly fields: readonly string[] }; readonly total: number };

/**
 * A view action that also runs on many rows at once (ADR 0017 §3, `ViewAction.bulk`). Without
 * `run`, it runs the row action once per selected row through the provider, checking `can` per
 * row and reporting the rows it skipped and why.
 *
 * @stability Beta
 */
export interface ViewBulkAction<Row extends DataRow = DataRow> {
  /** The bulk bar's words. Default the action's label. */
  label?: string;
  /** A confirmation, with `{count}`: "Archive {count} tasks?". Default the action's own `confirm`. */
  confirm?: string;
  /** Runs it on many rows at once (one server call). Default: the row action per row. */
  run?: (target: BulkTarget<Row>, viewer: Viewer) => void | Promise<void>;
  /**
   * `run` accepts every matching row as filters (`target.kind === "matching"`), so "select all
   * matching" can reach it. Such a run gets no rows, so no per-row `can` check has happened: it
   * must enforce access itself (a server function under the caller's row-level security, checking
   * each row it touches), and treat the filters and search as untrusted input from the browser.
   */
  matching?: boolean;
}

/**
 * A picker's filter: equality per field. `null` is "is empty", a list is "any of". Sent to the
 * server with the list request, never applied to loaded rows.
 */
export type LinkFilter = Readonly<Record<string, string | number | boolean | null | readonly (string | number)[]>>;

/** The parts of the linked resource's view a picker reads. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract and row
export type LinkedView = Pick<ResourceView<any, any>, "resource" | "definition" | "labelField">;

/**
 * How a link's picker lists the linked rows (`fields.owner_id.link`). The list always goes through
 * the provider, so row-level security decides what the viewer can pick; these only narrow it.
 */
export interface ViewLink {
  /**
   * The linked resource's view. Its `scope` keys (read from the viewer's scope, as its own lists
   * do), its `default` preset's filter (or `preset`'s) and its `labelField` apply to the picker.
   * A function for two views that link each other (`() => usersView`).
   */
  view?: LinkedView | (() => LinkedView);
  /** One of the linked view's presets whose filter the picker uses. Default: its `default` preset. */
  preset?: string;
  /**
   * More filters: fixed, or from the form's values, for a picker that follows another field
   * (`(values) => ({ project_id: values.project_id })`, the tasks of the chosen project).
   */
  filter?: LinkFilter | ((values: Readonly<Record<string, unknown>>) => LinkFilter);
  /** The linked fields a search matches. Default: the naming field (`labelField`). */
  searchFields?: readonly string[];
  /**
   * The order the picker lists rows in. Default: by the naming field, then the key. `"view"`
   * uses the linked view's own `orderBy` (a `position` its list is sorted by) and needs `view`;
   * a linked view without one keeps the default. `{ field, direction }` names a linked field.
   */
  orderBy?: "view" | LinkOrder;
}

/** A picker's order: a field of the linked resource, ascending unless it says so. */
export interface LinkOrder {
  field: string;
  direction?: "asc" | "desc";
  /** Where rows with no value go. Unset, the store decides. */
  nulls?: "first" | "last";
}

/** A link's picker, resolved: what to list, what names a row, and the filters to send. */
export interface ResolvedLink {
  /** The linked resource. */
  resource: string;
  /** The linked field the link stores (its key, usually `id`). */
  field: string;
  /** The linked field that names a row: the view field's, else the linked view's. Undefined: the provider's `describe`. */
  readonly labelField: string | undefined;
  /** The linked fields a search matches. Unset: the naming field. */
  searchFields?: readonly string[];
  /**
   * The order the picker lists rows in (`link.orderBy`, or the linked view's `orderBy` for
   * `"view"`), then the key. Undefined: by the naming field, then the key.
   */
  readonly orderBy?: { readonly field: string; readonly direction: "asc" | "desc"; readonly nulls?: "first" | "last" | undefined } | undefined;
  /**
   * The filters a picker sends: the linked view's scope keys from `scope` (as its own lists apply
   * them), its preset's filter, then the link's own `filter` for these form values.
   */
  filters(scope?: ResourceScope | null, values?: Readonly<Record<string, unknown>>): FilterParam[];
}

/**
 * An IANA zone name as written: `"UTC"`, `"GMT"` or `Area/Location` (`"Europe/Berlin"`). The
 * type keeps a bare word out; `defineView` checks the runtime knows the zone.
 */
export type TimeZoneName = "UTC" | "GMT" | `${string}/${string}`;

/** A view field's clock: the viewer's, the scope's, or a fixed zone. */
export type ViewTimeZone = "viewer" | "scope" | TimeZoneName;

/** A column computed from the row, never stored or sent. */
export interface ComputedColumn<Row extends DataRow = DataRow> {
  /** The column's key; must not clash with a field name. */
  key: string;
  label: string;
  value: (row: Row) => unknown;
  display?: DisplayHint;
}

/** One entry in a column list: a field by name, or a computed column. */
export type ViewColumn<Name extends string, Row extends DataRow> = Name | ComputedColumn<Row>;

/** A form laid out in order: fields, and fields under a heading. */
export type ViewFormItem<Name extends string> = Name | { section: string; title?: string; fields: readonly Name[] };

/**
 * A named tab of the list: which columns, and which rows (`{ status: "open" }` is an equality
 * filter, sent to the server, never applied to loaded rows).
 */
export interface ViewPreset<Name extends string> {
  label?: string;
  columns?: string;
  filter?: Readonly<Partial<Record<Name, string | number | boolean | null>>>;
}

/** `true` when allowed, or the reason it isn't, in one sentence for the disabled control. */
export type Allowed = true | string;

/**
 * Row rules the server can't cheaply express ("the default brand can't be deleted"). They only
 * narrow: the effective right is the server's AND these. An invariant goes in the database too.
 *
 * Each gets the viewer (`useViewer()`: id, scope, roles). Outside a ViewerScope it is
 * `{ id: null, scope: {} }`, so a guard that needs it refuses with its reason. Pure and
 * synchronous; never a security check (row-level security is the boundary).
 */
export interface ViewGuards<Row extends DataRow> {
  create?: (viewer: Viewer) => Allowed;
  update?: (row: Row, viewer: Viewer) => Allowed;
  delete?: (row: Row, viewer: Viewer) => Allowed;
}

/**
 * A named operation on one row, shaped like core's {@link RowAction} (which a provider reports),
 * plus a guard. The guard only narrows: the server still decides whether the action runs.
 *
 * ```ts
 * actions: [{ name: "archive", label: "Archive", confirm: "Archive this brand?", can: (r) => (r.is_default ? "The default brand stays." : true) }]
 * ```
 */
export interface ViewAction<Row extends DataRow = DataRow> extends RowAction {
  /** Drawn as destructive (red, the menu's destructive style). */
  destructive?: boolean;
  can?: (row: Row, viewer: Viewer) => Allowed;
  /** Also offer it on many selected rows (ADR 0017): `true`, or how it runs on them. */
  bulk?: boolean | ViewBulkAction<Row>;
}

/** An action as a renderer lists it: the words only. Ask `view.canAction` whether a row allows it. */
export type ResolvedViewAction = RowAction & {
  readonly destructive?: boolean;
  /** Set when the action runs on many rows: its bar label, confirmation and whether it takes every matching row. */
  readonly bulk?: { readonly label: string; readonly confirm?: string; readonly matching: boolean; readonly batch: boolean };
};

/** A row in one line, for pickers, notifications and page bars. */
export interface RowSummary {
  title: string;
  subtitle?: string;
  chips?: readonly { label: string; tone?: ViewTone }[];
  /**
   * A picture beside the row: `src` is shown only when `isSafeUrl` accepts it; otherwise the
   * initials of `name`. `alt` defaults to empty (decorative). Resolve it with `rowPicture`.
   */
  image?: RowImage;
}

/** A row's picture, as a view's `summary` gives it. */
export interface RowImage {
  src?: string;
  /** Whose picture: the initials come from it when there is no safe `src`. */
  name?: string;
  /** Alternative text. Default empty: the picture is decorative (the row's title names it). */
  alt?: string;
}

/** A row's picture, ready to draw: an image (with initials for when it fails to load), or initials. */
export type RowPicture =
  | { readonly kind: "image"; readonly src: string; readonly alt: string; readonly fallback: string }
  | { readonly kind: "initials"; readonly text: string };

/**
 * The words a view shows. Each one is a step in a chain, and each step overrides the one before:
 * words derived from the resource's name, then the contract's (`noun`, `nounPlural`, `label`, which
 * `genesis introspect` reads from the table comment's `@genesis {...}`), then these, then the
 * screen's own props. Templates take `{noun}`, `{nouns}`, `{count}` and `{total}`.
 */
export interface ViewCopy {
  /** One row, in a sentence: "brand". Default: the contract's `noun`, then the table name's singular. */
  noun?: string;
  /**
   * Several: "brands". Default: the contract's `nounPlural`, then the plural of a `noun` the view or
   * contract gives ("entry" → "entries"); with only a noun derived from the name, the contract's
   * label when it reads as a plural ("People"), else the table name.
   */
  nounPlural?: string;
  /** The page title. Default: the contract's label, then the plural noun in title case. */
  title?: string;
  subtitle?: string;
  empty?: { title?: string; body?: string };
  /** The create button. Default "New". */
  create?: string;
  /**
   * The form's words. Titles: default "New {noun}" and "Edit {noun}" (the UI catalogue's `form`).
   * Submit buttons: default "Create" and "Save". Descriptions (read out with the title): default
   * the UI catalogue's `form.createDescription` and `form.editDescription`.
   */
  form?: {
    createTitle?: string;
    editTitle?: string;
    createSubmit?: string;
    editSubmit?: string;
    createDescription?: string;
    editDescription?: string;
  };
  /**
   * The count beside the title. Default "{count} {noun}" for one, "{count} {nouns}" for more, and
   * "{count} of {total}" when filtered (the UI catalogue's `page.count*`).
   */
  count?: { one?: string; other?: string; filtered?: string };
}

/** How a calendar lays out its window: a month grid, 1–4 weeks, a day-by-day agenda, or a row per lane. */
export type ViewCalendarLayout = "month" | "weeks" | "agenda" | "lanes";

/** What a calendar's `durationField` counts. */
export type ViewCalendarDurationUnit = "minutes" | "hours" | "days";

/**
 * How the view's rows show as a calendar: ResourceView's `mode="calendar"` on the web,
 * NativeResourceView's later. Plain values only, so every platform reads the same block; a screen
 * overrides the layout, weeks and anchor, and adds functions (dot colours, `onSelect`).
 */
export interface ViewCalendar<Name extends string = string> {
  /** The date or timestamp field that places each row. */
  field: Name;
  /** Where a row ends: its last day for a date field, its end instant for a timestamp. */
  endField?: Name;
  /**
   * A number field holding how long a row runs, for a row with no end column: its end is the
   * start plus this many `durationUnit`s. A row whose `endField` has a value keeps that end.
   */
  durationField?: Name;
  /** What `durationField` counts. Default `minutes`. */
  durationUnit?: ViewCalendarDurationUnit;
  /**
   * The longest a row with a `durationField` runs, in `durationUnit`s. The calendar reads rows that
   * started up to this long before its window too, so one that runs into the window from before
   * it (a session at 23:00 for two hours) is drawn. Without it, such a row is drawn only on the
   * days it starts in the window, and a calendar with no `endField` warns once. Past the read's
   * limit, the latest starts are kept.
   */
  maxDuration?: number;
  /** A yes/no field: the row is all day, its timestamp shown without a time. */
  allDayField?: Name;
  /** The field whose value (or list of values) names a row's lanes: a dot each, a lane each. */
  laneBy?: Name;
  /** Default `month`. */
  layout?: ViewCalendarLayout;
  /**
   * The layout on a phone (below 768px), until the person picks one from the layout switch:
   * `"agenda"` turns a month grid too narrow to read into a day-by-day list. Unset, a phone shows
   * `layout`, as before.
   */
  phoneLayout?: ViewCalendarLayout;
  /** For `weeks`, `agenda` and `lanes`: 1 to 4. Default 2. */
  weeks?: 1 | 2 | 3 | 4;
  /** 0 Sunday or 1 Monday (default). */
  weekStartsOn?: 0 | 1;
}

/**
 * How the view's rows show as a board: a column per value of one field, a card per row.
 * ResourceView's `mode="board"` draws it, and moving a card between columns writes the field
 * through the provider. Plain values only, so every platform reads the same block.
 */
export interface ViewBoard<Name extends string = string> {
  /** The field whose value is a card's column: a field with choices (an enum) or a yes/no one. */
  field: Name;
  /**
   * The columns, in order, as values of `field`. Default: its choices in the contract's order,
   * then a "No value" column when it can be empty. Listing them shows only those.
   */
  columns?: readonly string[];
  /** The fields a card shows under its title, in order. Default none: the title alone. */
  cardFields?: readonly Name[];
  /**
   * The most cards a column should hold, by value (`{ doing: 3 }`): a work-in-progress limit.
   * A column over its limit says so; nothing stops a move into it.
   */
  limits?: Readonly<Record<string, number>>;
}

/**
 * How the view's rows show as a gallery: ResourceView's `mode="grid"` draws a photo per row in
 * justified rows (the layout `GalleryGrid` uses, from `@marktiderman/genesis-core/gallery`) in
 * place of cards. Plain field names only, so every platform reads the same block.
 */
export interface ViewGallery<Name extends string = string> {
  /** The field holding the image's URL. */
  image: Name;
  /** The image's width and height in pixels, when the rows store them: rows pack by their ratio, 4:3 without. */
  width?: Name;
  height?: Name;
  /** A short line under the photo in the viewer. Default none. */
  caption?: Name;
  /** The photo's text alternative. Default the row's label (the view's `labelField`). */
  alt?: Name;
  /** The target row height, px on the web and points on a phone. Default 180, as `GalleryGrid`. */
  rowHeight?: number;
}

/**
 * How the view's rows show as an inbox (ADR 0017, the `inbox` view type): a three-pane layout of
 * segments, a list of rows like messages, and the open record. Field names only, except `unread`,
 * which may be a function of the row; every platform reads the same block.
 *
 * @stability Beta
 */
export interface ViewInbox<Name extends string = string, Row extends DataRow = DataRow> {
  /** The row's title line: a field, or a function of the row (a direct message's other person). Default the view's `labelField`. */
  title?: Name | ((row: Row) => string | null | undefined);
  /** One line under the title (the latest message, a description): a field, or a function of the row. */
  preview?: Name | ((row: Row) => string | null | undefined);
  /** A date or timestamp field: the row's short relative time. */
  time?: Name;
  /** Who it's from, in words: a line under the preview, and the avatar's initials. A field, or a function of the row. */
  from?: Name | ((row: Row) => string | null | undefined);
  /** An image field: the avatar beside the row. */
  avatar?: Name;
  /** A yes/no field, or a function of the row: bold, with a dot, while it's unread. */
  unread?: Name | ((row: Row) => boolean);
  /** A field drawn as a badge at the row's end, in its `fields.<name>.tones`. */
  badge?: Name;
  /** What fills the left rail: the view's segments (and saved views). Default `"segments"` when the view has segments. */
  rail?: "segments" | "none";
  /** The view action the `e` key runs on the open row ("done", "close"). Default an action named `done` or `close`. */
  doneAction?: string;
  /**
   * The view action run when an unread row is opened, to mark it read. Default an action named
   * `markRead`, if the view declares one. Genesis never writes on its own.
   */
  markRead?: string;
}

/** One row as an inbox draws it (`ResourceView.inboxRow`). @stability Beta */
export interface InboxRow {
  readonly id: string;
  readonly title: string;
  readonly preview?: string;
  /** The time field's value, as stored (an ISO date or timestamp). */
  readonly time?: string;
  readonly from?: string;
  readonly avatar?: string;
  readonly unread: boolean;
  readonly badge?: { readonly label: string; readonly tone?: ViewTone };
}

/**
 * How a record opens from a view (a record page, ADR 0021): a **side peek** (a panel at the edge,
 * the list still beside it), a **center peek** (a dialog over the list) or a full **page** (the
 * record's own route).
 *
 * @stability Beta
 */
export type RecordOpen = "side-peek" | "center-peek" | "page";

/** The open modes, in the order a picker lists them. @stability Beta */
export const RECORD_OPEN_MODES: readonly RecordOpen[] = Object.freeze(["side-peek", "center-peek", "page"]);

/** What `defineView` accepts. */
export interface ViewDefinition<C extends ResourceContract, Row extends DataRow = RowOf<C>> {
  copy?: ViewCopy;
  fields?: { readonly [K in FieldNameOf<C>]?: ViewField<Row> };
  /**
   * Column lists by preset name. `default` is the full list; others (`compact`) are what a screen
   * picks. Without `default`: every field that isn't sensitive, generated-only or the key.
   */
  columns?: { readonly default?: readonly ViewColumn<FieldNameOf<C>, Row>[] } & {
    readonly [preset: string]: readonly ViewColumn<FieldNameOf<C>, Row>[] | undefined;
  };
  /** Tabs: columns plus filters. */
  presets?: Readonly<Record<string, ViewPreset<FieldNameOf<C>>>>;
  /** The record form. Default: every writable field, in contract order. */
  form?: readonly ViewFormItem<FieldNameOf<C>>[];
  /**
   * Edit every link in this view's forms with a picker. Default false: a link is read-only (and
   * never sent) unless its `fields.<link>.link` is set (`{}` is enough). The default flips in 3.0.
   */
  editLinks?: boolean;
  can?: ViewGuards<Row>;
  /** Named operations on one row, in the order a menu shows them. Names are unique. */
  actions?: readonly ViewAction<Row>[];
  summary?: (row: Row) => RowSummary;
  /** The scope keys this view needs above it (`["org_id"]`). They stay out of forms. */
  scope?: readonly FieldNameOf<C>[];
  /** How the rows show as a calendar (`mode="calendar"`). */
  calendar?: ViewCalendar<FieldNameOf<C>>;
  /** How the rows show as a board (`mode="board"`). */
  board?: ViewBoard<FieldNameOf<C>>;
  /** How the rows show as a gallery of photos (`mode="grid"`), in place of cards. */
  gallery?: ViewGallery<FieldNameOf<C>>;
  /** How the rows show as an inbox (`type="inbox"`): a list like messages beside the open record. */
  inbox?: ViewInbox<FieldNameOf<C>, Row>;
  /** Group rows under headers by this field. */
  groupBy?: FieldNameOf<C>;
  /**
   * How a record opens from every view type of this view (ADR 0021): `side-peek` (default),
   * `center-peek` or `page`. A screen's own `open` (or ResourcePage's older `detail`) wins.
   */
  open?: RecordOpen;
  /**
   * The record view a peek renders: a function, because the record view is defined from this
   * view, with its return type named so TypeScript needn't infer one from the other:
   * `recordView: (): AnyRecordView => brandRecordView`. Without one, a peek shows the view's
   * columns as today.
   */
  recordView?: () => import("./record-view").AnyRecordView;
  /**
   * Default order; `manual: true` turns on drag to reorder, writing this field. `nulls` says where
   * rows with no value go (unset, the store decides: Postgres puts them first on a descending sort).
   */
  orderBy?: { field: FieldNameOf<C>; direction?: "asc" | "desc"; nulls?: "first" | "last"; manual?: boolean };
  /** Bumped when stored preferences (saved views, column order) change shape. */
  version?: number;
  /**
   * The fields a person can narrow the list by (ADR 0017 §1): drawn as a filter bar on the web,
   * sent to the server, and kept in the URL (`f.<field>`) once the app gives the list a URL adapter.
   */
  filters?: readonly ViewFilter<FieldNameOf<C>>[];
  /** Named tabs over the list, each with its own filter and an optional count (ADR 0017 §1). */
  segments?: readonly ViewSegment<FieldNameOf<C>>[];
  /**
   * The view types a person may switch between (ADR 0017): `table`, `list`, `grid`, `board`,
   * `calendar`, `gallery` or a registered type's id. Default: table, list and grid, plus each
   * type the view has a block for (gallery, board, calendar). A switcher shows when there are two
   * or more; each person's choice is kept in the app's saved-view store.
   */
  types?: readonly string[];
  /** Per field, a total shown in each group's header and the list's footer (`sum`, `avg`, `min`, `max`, `count`). */
  totals?: Readonly<Partial<Record<FieldNameOf<C>, ViewTotal>>>;
  /**
   * A row's tone (an overdue task, a paused client), drawn from tokens: a leading bar and a
   * tinted row on the web. Return nothing for a plain row.
   */
  rowTone?: (row: Row) => ViewTone | null | undefined;
  /** Offer "Export CSV" on the list (`true`, or which columns, the file's name and the cap). */
  export?: boolean | ViewExport<FieldNameOf<C>>;
  /**
   * A refused row or bulk action: `disable` (default) shows it with the guard's reason, `hide`
   * leaves it out (for an action only some people ever have).
   */
  refusals?: "disable" | "hide";
}

/** A declared filter as a renderer draws it: everything resolved. @stability Beta */
export interface ResolvedFilter {
  readonly field: string;
  readonly label: string;
  readonly kind: ViewFilterKind;
  /** For `choice`: each value with its words and tone, in the contract's order. */
  readonly options: readonly { readonly value: string; readonly label: string; readonly tone?: ViewTone }[];
  /** For `range`: whether the values are dates (`date`), timestamps (`datetime`) or numbers. */
  readonly input?: "date" | "datetime" | "number";
  /**
   * For a `date` input over a timestamp column (one shown as a date): a day is the viewer's day, so
   * a range runs from that day's start in their zone to the next day's start.
   */
  readonly instants?: boolean;
  readonly default?: ViewFilterValue;
}

/** A segment as a renderer draws it. @stability Beta */
export interface ResolvedSegment {
  readonly id: string;
  readonly label: string;
  readonly count: boolean;
  readonly columns?: string;
}

/** A column as a renderer draws it: everything resolved. */
export interface ResolvedColumn<Row extends DataRow = DataRow> {
  key: string;
  label: string;
  display: DisplayHint;
  /** The field behind it; absent for a computed column. */
  field?: FieldSchema;
  value: (row: Row) => unknown;
  tones?: Readonly<Record<string, ViewTone>>;
  /** The words for a value (`ViewField.labels`); `valueText` reads them. */
  labels?: Readonly<Record<string, string>>;
  /** For a link: the linked row's field that names it (`ViewField.labelField`). */
  labelField?: string;
  /** For a link: the words when its row is hidden or gone (`ViewField.missingLabel`). */
  missingLabel?: string;
  /** Whether to show the cell. Without a viewer it answers for no one (fail closed). */
  when?: (row: Row, viewer?: Viewer) => boolean;
  timeZone?: ViewField["timeZone"];
  /** `ViewField.emphasis`; the label field's column is `title` unless the view says otherwise. */
  emphasis?: ViewEmphasis;
  /** `false` when the header mustn't sort (`ViewField.sortable`, or a computed column). */
  sortable?: boolean;
  hideBelow?: ViewBreakpoint;
  width?: number | string;
}

/** A form field as a renderer draws it. */
export interface ResolvedFormField {
  field: FieldSchema;
  label: string;
  display: DisplayHint;
  required: boolean;
  readOnly: boolean;
  max?: number;
  /** The input's autofill token (`ViewField.autoComplete`). */
  autoComplete?: string;
  /** The keyboard a phone shows (`ViewField.inputMode`). */
  inputMode?: ViewField["inputMode"];
  /** The Return key's label (`ViewField.enterKeyHint`). */
  enterKeyHint?: ViewField["enterKeyHint"];
  /** For a link: the linked row's field that names it (`ViewField.labelField`). */
  labelField?: string;
  /** For a link: the words when its row is hidden or gone (`ViewField.missingLabel`). */
  missingLabel?: string;
  /** An enum field's choices, in the contract's order, with the view's words. */
  options?: readonly { value: string; label: string }[];
  /** For a link the view opted in (`fields.<link>.link`, `editLinks`): how its picker lists the linked rows. */
  link?: ResolvedLink;
  /** The heading it sits under, or null for none. */
  section: string | null;
  sectionTitle: string | null;
  visible?: (values: Readonly<Record<string, unknown>>) => boolean;
}

/** What `defineView` returns: frozen, with everything the renderers need resolved. */
export interface ResourceView<C extends ResourceContract = ResourceContract, Row extends DataRow = RowOf<C>> {
  readonly contract: C;
  readonly definition: Readonly<ViewDefinition<C, Row>>;
  /** The resource name the provider addresses. */
  readonly resource: string;
  readonly noun: string;
  readonly nounPlural: string;
  readonly title: string;
  /** The field that names a row, for links, pickers and the peek's title. */
  readonly labelField: string | undefined;
  /** The column presets this view has, `default` first. */
  readonly presets: readonly string[];
  field(name: string): FieldSchema | undefined;
  label(name: string): string;
  display(name: string): DisplayHint;
  /** A value in words: the field's `labels`, else title case. For badges, choices and group titles. */
  valueLabel(name: string, value: unknown): string;
  columns(preset?: string): readonly ResolvedColumn<Row>[];
  /**
   * One field as a column, resolved as a preset lists it (a board card's fields, say). Undefined
   * for a name that isn't a field or one the viewer can't read (`permissions.read: false`).
   */
  column(name: string): ResolvedColumn<Row> | undefined;
  form(mode: "create" | "edit"): readonly ResolvedFormField[];
  /** Fields a writer may send: the form's, never generated, read-only, key or scope fields. */
  writable(mode: "create" | "edit"): readonly string[];
  /**
   * Whether the view's guard allows it for this viewer: `true`, or the guard's reason. Without a
   * viewer, guards get `NO_VIEWER` (no one), so one that needs the viewer refuses.
   */
  can(action: "create", viewer?: Viewer): Allowed;
  can(action: "update" | "delete", row: Row, viewer?: Viewer): Allowed;
  /** The view's actions, in order, frozen. */
  actions(): readonly ResolvedViewAction[];
  /**
   * Whether this row allows the named action: `true`, or the guard's reason. Only narrows what the
   * server allows. Throws {@link ViewDefinitionError} for a name the view doesn't define.
   */
  canAction(name: string, row: Row, viewer?: Viewer): Allowed;
  summary(row: Row): RowSummary;
  /**
   * The row as a gallery photo, by the view's `gallery` block and any `override` a screen passes
   * (ResourceView's `gallery`): undefined without a gallery block. Its `id` is the row's key, its
   * `alt` the row's label unless the block names a field; a row without an image has an empty `src`,
   * which GalleryGrid and NativeGalleryGrid draw as a placeholder tile; leave those out of a Lightbox.
   */
  galleryItem(row: Row, override?: Partial<ViewGallery>): GalleryItem | undefined;
  /** The declared filters, resolved (ADR 0017). Empty without `filters`. @stability Beta */
  filters(): readonly ResolvedFilter[];
  /** The declared segments, resolved. Empty without `segments`. @stability Beta */
  segments(): readonly ResolvedSegment[];
  /**
   * A segment's rows as provider filters, for this viewer. Throws {@link ViewDefinitionError} for
   * an id the view doesn't define. @stability Beta
   */
  segmentFilters(id: string, viewer?: Viewer): FilterParam[];
  /**
   * Declared filters' values as provider filters. Only declared filters count, and a value a
   * filter doesn't accept (a choice it doesn't offer, a malformed range) is dropped: the URL is
   * an allow-list, never a way to send any field. Days and times on a timestamp column are read
   * on `zone`'s clock (the viewer's; default the device's): a day runs from its start to the next
   * day's start, and a time with no offset is that zone's. @stability Beta
   */
  filterParams(values: Readonly<Record<string, ViewFilterValue | undefined>> | null | undefined, zone?: string): FilterParam[];
  /** The view types a person may switch between, in order (`types`, or the derived default). @stability Beta */
  types(): readonly string[];
  /** The row's tone (`rowTone`), or undefined. @stability Beta */
  rowTone(row: Row): ViewTone | undefined;
  /**
   * What "Export CSV" writes for a column preset, or undefined when the view has no `export`.
   * @stability Beta
   */
  exportPlan(preset?: string): { readonly columns: readonly ResolvedColumn<Row>[]; readonly filename: string; readonly maxRows: number; readonly raw: boolean } | undefined;
  /**
   * The row as an inbox draws it, by the view's `inbox` block (its title from `labelField` when
   * the block says none). Works without a block too: the summary's title. @stability Beta
   */
  inboxRow(row: Row): InboxRow;
  /** The inbox's `done` and `markRead` actions, when the view declares them. @stability Beta */
  inboxActions(): { readonly done?: string; readonly markRead?: string };
}
