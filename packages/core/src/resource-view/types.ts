// What a resource means to people (docs/RESOURCE-VIEW.md, "View"). Types only: no React, no
// DOM, so web, native and the extension all import the same view.

import type { DataRow, FieldSchema, ResourceContract, RowAction, RowOf } from "../schema/types";

export type { RowOf };

/** A chip's colour: the tinted, AA-safe Genesis badge tones (genesis-ui's `ChipTone`). */
export type ViewTone = "success" | "warning" | "danger" | "info" | "muted";

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
  /** Longest text a form accepts. Feeds the derived validation. */
  max?: number;
  /** Shown read-only even where the server would accept a write. Never widens. */
  readOnly?: boolean;
  /**
   * Show the cell only when the row says so: for values a server function masks by policy
   * (`(row) => row.author_visible`). The masking itself is the server's.
   */
  when?: (row: Row) => boolean;
  /** In a form: show the field only while this holds for the form's values. A hidden field isn't saved. */
  visible?: (values: Readonly<Record<string, unknown>>) => boolean;
  /** A timestamp's clock: the viewer's (default), the practice's, or a fixed IANA zone. */
  timeZone?: "viewer" | "practice" | (string & {});
}

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
 */
export interface ViewGuards<Row extends DataRow> {
  create?: () => Allowed;
  update?: (row: Row) => Allowed;
  delete?: (row: Row) => Allowed;
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
  can?: (row: Row) => Allowed;
}

/** An action as a renderer lists it: the words only. Ask `view.canAction` whether a row allows it. */
export type ResolvedViewAction = RowAction & { readonly destructive?: boolean };

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

/** The words a view shows. Each defaults from the contract (`noun`, labels). */
export interface ViewCopy {
  /** One row, in a sentence: "brand". */
  noun?: string;
  /** Several: "brands". Default `noun` + "s". */
  nounPlural?: string;
  /** The page title. Default: the contract's label, then the plural noun in title case. */
  title?: string;
  subtitle?: string;
  empty?: { title?: string; body?: string };
  create?: string;
}

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
  can?: ViewGuards<Row>;
  /** Named operations on one row, in the order a menu shows them. Names are unique. */
  actions?: readonly ViewAction<Row>[];
  summary?: (row: Row) => RowSummary;
  /** The scope keys this view needs above it (`["practice_id"]`). They stay out of forms. */
  scope?: readonly FieldNameOf<C>[];
  /** Group rows under headers by this field. */
  groupBy?: FieldNameOf<C>;
  /** Default order; `manual: true` turns on drag to reorder, writing this field. */
  orderBy?: { field: FieldNameOf<C>; direction?: "asc" | "desc"; manual?: boolean };
  /** Bumped when stored preferences (saved views, column order) change shape. */
  version?: number;
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
  when?: (row: Row) => boolean;
  timeZone?: ViewField["timeZone"];
}

/** A form field as a renderer draws it. */
export interface ResolvedFormField {
  field: FieldSchema;
  label: string;
  display: DisplayHint;
  required: boolean;
  readOnly: boolean;
  max?: number;
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
  columns(preset?: string): readonly ResolvedColumn<Row>[];
  form(mode: "create" | "edit"): readonly ResolvedFormField[];
  /** Fields a writer may send: the form's, never generated, read-only, key or scope fields. */
  writable(mode: "create" | "edit"): readonly string[];
  can(action: "create"): Allowed;
  can(action: "update" | "delete", row: Row): Allowed;
  /** The view's actions, in order, frozen. */
  actions(): readonly ResolvedViewAction[];
  /**
   * Whether this row allows the named action: `true`, or the guard's reason. Only narrows what the
   * server allows. Throws {@link ViewDefinitionError} for a name the view doesn't define.
   */
  canAction(name: string, row: Row): Allowed;
  summary(row: Row): RowSummary;
}
