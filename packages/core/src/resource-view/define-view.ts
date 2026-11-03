// defineView: a contract plus what it means to people, checked once and frozen (the same rule as
// genesis-sites' defineSection). Everything a renderer needs is resolved here, so web, native and
// the extension draw the same labels, columns and form.

import { NO_VIEWER, type Viewer } from "../viewer";
import { encodeRecordKey, keyFields } from "../schema/keys";
import type { GalleryItem } from "../gallery";
import type { DataRow, FieldSchema, ResourceContract } from "../schema/types";
import { titleCase } from "../utils";
import { isTimeZone } from "../dates";
import { ViewDefinitionError } from "./errors";
import { linkProblems, resolveLink } from "./link";
import type {
  Allowed,
  ComputedColumn,
  DisplayHint,
  ResolvedColumn,
  ResolvedFormField,
  ResolvedViewAction,
  ResourceView,
  RowOf,
  RowSummary,
  ViewBoard,
  ViewCalendar,
  ViewDefinition,
  ViewField,
  ViewGallery,
} from "./types";

// Facts a contract may carry from `@genesis` comments. Read loosely so a contract emitted before
// they existed still works.
type FieldFacts = FieldSchema & { readonly readOnly?: boolean; readonly sensitive?: boolean };
type ContractFacts = ResourceContract & {
  readonly label?: string;
  readonly labelField?: string;
  readonly noun?: string;
  readonly nounPlural?: string;
};

// In a file of its own so scope.ts and link.ts can throw it without importing this one.
export { ViewDefinitionError } from "./errors";

/** The display a field gets when the view doesn't name one. */
export function deriveDisplay(field: FieldSchema): DisplayHint {
  if (field.references) return "relation";
  switch (field.widget) {
    case "url":
      return "url";
    case "email":
      return "email";
    case "image":
      return "image";
    case "textarea":
      return "longText";
    case "date":
      return "date";
  }
  if (field.enumValues?.length) return "badge";
  switch (field.type) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "json":
      return "json";
    case "relation":
      return "relation";
    case "datetime":
      return /^date$/i.test(field.dbType ?? "") ? "date" : "datetime";
  }
  return "text";
}

// Plurals whose singular the rules below would get wrong.
const SAME_OR_IRREGULAR: Readonly<Record<string, string>> = {
  series: "series",
  species: "species",
  movies: "movie",
  cookies: "cookie",
  ties: "tie",
  pies: "pie",
  people: "person",
};

/** A table name's singular, for the default noun. A wrong guess is fixed with `@genesis {"noun"}`. */
export function singular(word: string): string {
  const last = word.split(" ").pop()!;
  const head = word.slice(0, word.length - last.length);
  const lower = last.toLowerCase();
  const one = (s: string) => head + s;
  if (SAME_OR_IRREGULAR[lower]) return one(SAME_OR_IRREGULAR[lower]!);
  if (/[^aeiou]ies$/.test(lower)) return one(`${last.slice(0, -3)}y`);
  // statuses, addresses, boxes, matches, wishes, quizzes
  if (/(?:s|x|z|ch|sh)es$/.test(lower)) return one(last.slice(0, -2));
  if (/(?:ss|us|is)$/.test(lower) || !lower.endsWith("s")) return word;
  return one(last.slice(0, -1));
}

// Singulars whose plural the rules below would get wrong: the irregulars above, inverted.
const PLURAL_OF: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SAME_OR_IRREGULAR).map(([many, one]) => [one, many]),
);

/** A noun's plural, the inverse of `singular`: entry → entries, box → boxes, person → people. */
export function plural(word: string): string {
  const last = word.split(" ").pop()!;
  const head = word.slice(0, word.length - last.length);
  const lower = last.toLowerCase();
  const many = (s: string) => head + s;
  if (PLURAL_OF[lower]) return many(PLURAL_OF[lower]!);
  if (/[^aeiou]y$/.test(lower)) return many(`${last.slice(0, -1)}ies`);
  if (/(?:s|x|z|ch|sh)$/.test(lower)) return many(`${last}es`);
  return many(`${last}s`);
}

// The view's own operations (`view.can`): an action can't take their names.
const RESERVED_ACTIONS: ReadonlySet<string> = new Set(["create", "update", "delete"]);

const own = <V>(record: Readonly<Record<string, V>> | undefined, key: string): V | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** A value in words: its entry in `labels`, else the value in title case (`draft` → "Draft"). */
export function valueText(labels: Readonly<Record<string, string>> | undefined, value: unknown): string {
  const key = String(value);
  return own(labels, key) ?? titleCase(key);
}

const KIND: Readonly<Record<string, string>> = { datetime: "date or timestamp", boolean: "yes/no", number: "number" };
const LAYOUTS: readonly string[] = ["month", "weeks", "agenda", "lanes"];

/** A calendar block's keys: anything else in one is a mistake `defineView` names. */
const CALENDAR_KEYS: readonly string[] = [
  "field", "endField", "durationField", "durationUnit", "allDayField", "laneBy", "layout", "phoneLayout", "weeks", "weekStartsOn",
];

/**
 * What's wrong with a calendar block for these fields, one sentence each (empty when it's fine).
 * `defineView` checks the view's own block with it; a renderer checks a screen's overrides merged
 * over that block with it too, so neither can name a field that isn't there or isn't a date.
 *
 * @stability Beta
 */
export function calendarProblems(fields: readonly Pick<FieldSchema, "name" | "type" | "array">[], calendar: Partial<ViewCalendar>): string[] {
  const problems: string[] = [];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const typed = (name: string | undefined, where: string, type: string) => {
    if (name === undefined) return;
    const f = byName.get(name);
    if (!f) problems.push(`${where} names "${name}", which isn't a field`);
    else if (f.type !== type || f.array) problems.push(`${where} "${name}" isn't a ${KIND[type]} field`);
  };
  typed(calendar.field, "calendar.field", "datetime");
  typed(calendar.endField, "calendar.endField", "datetime");
  typed(calendar.durationField, "calendar.durationField", "number");
  typed(calendar.allDayField, "calendar.allDayField", "boolean");
  if (calendar.durationUnit !== undefined && !["minutes", "hours", "days"].includes(calendar.durationUnit)) {
    problems.push(`calendar.durationUnit "${String(calendar.durationUnit)}" isn't minutes, hours or days`);
  }
  if (calendar.durationUnit !== undefined && calendar.durationField === undefined) problems.push("calendar.durationUnit needs a durationField");
  if (calendar.laneBy !== undefined && !byName.has(calendar.laneBy)) problems.push(`calendar.laneBy names "${calendar.laneBy}", which isn't a field`);
  for (const key of ["layout", "phoneLayout"] as const) {
    const value = calendar[key];
    if (value !== undefined && !LAYOUTS.includes(value)) problems.push(`calendar.${key} "${String(value)}" isn't month, weeks, agenda or lanes`);
  }
  if (calendar.weeks !== undefined && ![1, 2, 3, 4].includes(calendar.weeks)) problems.push(`calendar.weeks is 1 to 4, not ${String(calendar.weeks)}`);
  if (calendar.weekStartsOn !== undefined && calendar.weekStartsOn !== 0 && calendar.weekStartsOn !== 1) {
    problems.push(`calendar.weekStartsOn is 0 (Sunday) or 1 (Monday), not ${String(calendar.weekStartsOn)}`);
  }
  return problems;
}

/** A board block's keys: anything else in one is a mistake `defineView` names. */
const BOARD_KEYS: readonly string[] = ["field", "columns", "cardFields", "limits"];

/**
 * The values a board's field can hold, in the contract's order: an enum's choices, or `true`
 * and `false` for a yes/no field. Undefined when the field has no fixed set of values.
 *
 * @stability Beta
 */
export function boardChoices(field: Pick<FieldSchema, "type" | "array" | "enumValues"> | undefined): readonly string[] | undefined {
  if (!field || field.array) return undefined;
  if (field.enumValues?.length) return field.enumValues;
  if (field.type === "boolean") return ["true", "false"];
  return undefined;
}

/** A gallery block's keys: anything else in one is a mistake `defineView` names. */
const GALLERY_KEYS: readonly string[] = ["image", "width", "height", "caption", "alt", "rowHeight"];

/**
 * What's wrong with a gallery block for these fields, one sentence each (empty when it's fine).
 *
 * @stability Beta
 */
export function galleryProblems(fields: readonly Pick<FieldSchema, "name" | "type" | "array">[], gallery: Partial<ViewGallery>): string[] {
  const problems: string[] = [];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const named = (key: "image" | "width" | "height" | "caption" | "alt", type?: "string" | "number") => {
    const name = gallery[key];
    if (name === undefined) return;
    const field = byName.get(name);
    if (!field) problems.push(`gallery.${key} names "${name}", which isn't a field`);
    else if (type && (field.type !== type || field.array)) problems.push(`gallery.${key} "${name}" is a ${field.array ? "list" : field.type}, not a ${type === "string" ? "text" : "number"} field`);
  };
  named("image", "string");
  named("width", "number");
  named("height", "number");
  named("caption");
  named("alt");
  if ((gallery.width === undefined) !== (gallery.height === undefined)) problems.push("gallery.width and gallery.height go together: a ratio needs both");
  const { rowHeight } = gallery;
  if (rowHeight !== undefined && !(typeof rowHeight === "number" && Number.isFinite(rowHeight) && rowHeight > 0)) problems.push(`gallery.rowHeight is a height above 0, not ${String(rowHeight)}`);
  return problems;
}

/**
 * What's wrong with a board block for these fields, one sentence each (empty when it's fine).
 *
 * @stability Beta
 */
export function boardProblems(
  fields: readonly Pick<FieldSchema, "name" | "type" | "array" | "enumValues">[],
  board: Partial<ViewBoard>,
): string[] {
  const problems: string[] = [];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const field = board.field === undefined ? undefined : byName.get(board.field);
  if (board.field !== undefined && !field) problems.push(`board.field names "${board.field}", which isn't a field`);
  const choices = boardChoices(field);
  if (field && !choices) problems.push(`board.field "${board.field}" has no fixed values: use an enum or a yes/no field`);
  if (board.columns !== undefined) {
    if (!Array.isArray(board.columns) || board.columns.length === 0) problems.push("board.columns isn't a list of values");
    else {
      const seen = new Set<string>();
      for (const value of board.columns) {
        if (choices && !choices.includes(value)) problems.push(`board.columns lists "${String(value)}", which isn't a value of ${board.field}`);
        if (seen.has(value)) problems.push(`board.columns lists "${String(value)}" twice`);
        seen.add(value);
      }
    }
  }
  for (const name of board.cardFields ?? []) {
    if (!byName.has(name)) problems.push(`board.cardFields names "${name}", which isn't a field`);
  }
  for (const [value, limit] of Object.entries(board.limits ?? {})) {
    const columns = board.columns ?? choices;
    if (columns && !columns.includes(value)) problems.push(`board.limits has "${value}", which isn't one of the board's columns`);
    if (!Number.isInteger(limit) || limit < 1) problems.push(`board.limits.${value} is a whole number of cards, 1 or more, not ${String(limit)}`);
  }
  return problems;
}

/**
 * Describe what a resource means to people. The result is frozen and platform-neutral:
 *
 * ```ts
 * export const brandsView = defineView(contracts["public.brands"], {
 *   fields: { status: { display: "badge", tones: { active: "success" } } },
 *   columns: { default: ["name", "status", "created_at"], compact: ["name"] },
 *   can: {
 *     delete: (row) => (row.is_default ? "The default brand stays." : true),
 *     update: (row, viewer) => (row.owner_id === viewer.id ? true : "Only its owner edits a brand."),
 *   },
 *   actions: [{ name: "archive", label: "Archive", can: (row) => (row.is_default ? "The default brand stays." : true) }],
 * });
 * ```
 *
 * Throws {@link ViewDefinitionError} when it names something the contract doesn't have, so a
 * renamed column fails at start-up, not as a blank cell.
 */
export function defineView<C extends ResourceContract, Row extends DataRow = RowOf<C>>(
  contract: C,
  definition: ViewDefinition<C, Row> = {},
): ResourceView<C, Row> {
  const facts = contract as ContractFacts;
  const fields = contract.fields as readonly FieldFacts[];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const keys = new Set(keyFields(contract));
  const scope = new Set<string>(definition.scope ?? []);
  // Copied and frozen, so changing the objects passed in can't change the view afterwards.
  const viewFields = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.fields ?? {}).map(([k, v]) => {
        const f = { ...(v as ViewField) };
        // Maps only: anything else is left as given for the checks below to name.
        const map = (m: unknown) => Boolean(m) && typeof m === "object" && !Array.isArray(m);
        if (map(f.tones)) f.tones = Object.freeze({ ...f.tones });
        if (map(f.labels)) f.labels = Object.freeze({ ...f.labels });
        return [k, Object.freeze(f)];
      }),
    ),
  ) as Readonly<Record<string, NonNullable<ViewDefinition<C, Row>["fields"]>[never]>>;
  const columnLists = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.columns ?? {}).map(([k, list]) => [
        k,
        Object.freeze((list ?? []).map((c) => (typeof c === "string" ? c : Object.freeze({ ...c })))),
      ]),
    ),
  ) as Readonly<Record<string, readonly (string | ComputedColumn<Row>)[] | undefined>>;
  const formItems = Object.freeze(
    (definition.form ?? []).map((item) => (typeof item === "string" ? item : Object.freeze({ ...item, fields: Object.freeze([...item.fields]) }))),
  );
  const presets = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.presets ?? {}).map(([k, p]) => [k, Object.freeze({ ...p, ...(p.filter ? { filter: Object.freeze({ ...p.filter }) } : {}) })]),
    ),
  ) as NonNullable<ViewDefinition<C, Row>["presets"]>;
  const actionList = Object.freeze(
    // Names are trimmed, so " archive" and "archive" are one name.
    (Array.isArray(definition.actions) ? definition.actions : []).map((a) =>
      a && typeof a === "object" ? Object.freeze({ ...a, ...(typeof a.name === "string" ? { name: a.name.trim() } : {}) }) : a,
    ),
  );

  // ── Check every name once ────────────────────────────────────────────
  const problems: string[] = [];
  const known = (name: string, where: string) => {
    if (!byName.has(name)) problems.push(`${where} names "${name}", which isn't a field`);
  };
  for (const name of Object.keys(viewFields)) known(name, "fields");
  for (const [name, v] of Object.entries(viewFields)) {
    if (v?.labels === undefined) continue;
    if (!v.labels || typeof v.labels !== "object" || Array.isArray(v.labels)) {
      problems.push(`fields.${name}.labels isn't a map of values to words`);
      continue;
    }
    const values = byName.get(name)?.enumValues;
    for (const [value, words] of Object.entries(v.labels)) {
      if (typeof words !== "string" || !words.trim()) problems.push(`fields.${name}.labels.${value} isn't text`);
      if (values?.length && !values.includes(value)) problems.push(`fields.${name}.labels names "${value}", which isn't one of its values`);
    }
  }
  // A clock is "viewer", "scope" or a zone this runtime knows. Never a quiet fallback: a field
  // drawn on the wrong clock shows the wrong times with nothing to say so.
  for (const [name, v] of Object.entries(viewFields)) {
    const zone: unknown = v?.timeZone;
    if (zone === undefined || zone === "viewer" || zone === "scope") continue;
    if (zone === "practice") {
      problems.push(
        `fields.${name}.timeZone "practice" was renamed "scope" in genesis-core 2; run \`genesis codemod genesis-core-2-scope-names\``,
      );
    } else if (!isTimeZone(zone)) {
      problems.push(`fields.${name}.timeZone "${String(zone)}" isn't "viewer", "scope" or a time zone this runtime knows`);
    }
  }
  for (const [name, v] of Object.entries(viewFields)) {
    if (v?.missingLabel === undefined) continue;
    if (typeof v.missingLabel !== "string" || !v.missingLabel.trim()) problems.push(`fields.${name}.missingLabel isn't text`);
    else if (!byName.get(name)?.references) problems.push(`fields.${name}.missingLabel is set, but "${name}" isn't a link`);
  }
  for (const [name, v] of Object.entries(viewFields)) problems.push(...linkProblems(name, v?.link, byName.get(name)?.references));
  if (definition.editLinks !== undefined && typeof definition.editLinks !== "boolean") problems.push("editLinks isn't true or false");
  for (const [name, v] of Object.entries(viewFields)) {
    if (v?.labelField === undefined) continue;
    if (typeof v.labelField !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.labelField)) {
      problems.push(`fields.${name}.labelField isn't a field name`);
    } else if (!byName.get(name)?.references) {
      problems.push(`fields.${name}.labelField is set, but "${name}" isn't a link`);
    }
  }
  for (const [preset, list] of Object.entries(columnLists)) {
    const seen = new Set<string>();
    for (const column of list ?? []) {
      const key = typeof column === "string" ? column : column.key;
      if (typeof column === "string") known(column, `columns.${preset}`);
      else if (byName.has(column.key)) problems.push(`columns.${preset}: computed "${column.key}" clashes with a field`);
      if (seen.has(key)) problems.push(`columns.${preset} lists "${key}" twice`);
      seen.add(key);
    }
  }
  const formSeen = new Set<string>();
  for (const item of formItems) {
    for (const name of typeof item === "string" ? [item] : item.fields) {
      known(name, "form");
      if (formSeen.has(name)) problems.push(`form lists "${name}" twice`);
      formSeen.add(name);
    }
  }
  for (const name of scope) known(name, "scope");
  if (definition.groupBy) known(definition.groupBy, "groupBy");
  // A copy, frozen like the other blocks: changing the object passed in can't change the view.
  // Checked as written first: a plain object with a field, and only keys a calendar has.
  const rawCalendar = definition.calendar as unknown;
  let calendar: Readonly<ViewCalendar> | undefined;
  if (rawCalendar !== undefined) {
    if (!rawCalendar || typeof rawCalendar !== "object" || Array.isArray(rawCalendar)) {
      problems.push("calendar isn't an object");
    } else {
      for (const key of Object.keys(rawCalendar)) if (!CALENDAR_KEYS.includes(key)) problems.push(`calendar.${key} isn't a calendar setting`);
      if ((rawCalendar as { field?: unknown }).field === undefined) problems.push("calendar.field is required");
      calendar = Object.freeze({ ...(rawCalendar as ViewCalendar) });
      problems.push(...calendarProblems(fields, calendar));
    }
  }
  const rawBoard = definition.board as unknown;
  let board: Readonly<ViewBoard> | undefined;
  if (rawBoard !== undefined) {
    if (!rawBoard || typeof rawBoard !== "object" || Array.isArray(rawBoard)) {
      problems.push("board isn't an object");
    } else {
      for (const key of Object.keys(rawBoard)) if (!BOARD_KEYS.includes(key)) problems.push(`board.${key} isn't a board setting`);
      if ((rawBoard as { field?: unknown }).field === undefined) problems.push("board.field is required");
      const given = rawBoard as ViewBoard;
      board = Object.freeze({
        ...given,
        ...(given.columns ? { columns: Object.freeze([...given.columns]) } : {}),
        ...(given.cardFields ? { cardFields: Object.freeze([...given.cardFields]) } : {}),
        ...(given.limits ? { limits: Object.freeze({ ...given.limits }) } : {}),
      });
      problems.push(...boardProblems(fields, board));
    }
  }
  const rawGallery = definition.gallery as unknown;
  let gallery: Readonly<ViewGallery> | undefined;
  if (rawGallery !== undefined) {
    if (!rawGallery || typeof rawGallery !== "object" || Array.isArray(rawGallery)) {
      problems.push("gallery isn't an object");
    } else {
      for (const key of Object.keys(rawGallery)) if (!GALLERY_KEYS.includes(key)) problems.push(`gallery.${key} isn't a gallery setting`);
      if ((rawGallery as { image?: unknown }).image === undefined) problems.push("gallery.image is required");
      gallery = Object.freeze({ ...(rawGallery as ViewGallery) });
      problems.push(...galleryProblems(fields, gallery));
    }
  }
  if (definition.orderBy) known(definition.orderBy.field, "orderBy");
  for (const [name, preset] of Object.entries(presets)) {
    if (preset.columns && preset.columns !== "default" && !own(columnLists, preset.columns)) {
      problems.push(`presets.${name} uses columns "${preset.columns}", which isn't defined`);
    }
    for (const field of Object.keys(preset.filter ?? {})) known(field, `presets.${name}.filter`);
  }
  if (facts.labelField) known(facts.labelField, "the contract's labelField");
  const actionSeen = new Set<string>();
  if (definition.actions !== undefined && !Array.isArray(definition.actions)) problems.push("actions isn't a list");
  actionList.forEach((action, i) => {
    const where = `actions[${i}]`;
    if (!action || typeof action !== "object") {
      problems.push(`${where} isn't an action`);
      return;
    }
    if (typeof action.name !== "string" || !action.name.trim()) problems.push(`${where} has no name`);
    else if (RESERVED_ACTIONS.has(action.name)) problems.push(`${where} is named "${action.name}", which is reserved for the view's own ${action.name}`);
    else if (actionSeen.has(action.name)) problems.push(`actions lists "${action.name}" twice`);
    else actionSeen.add(action.name);
    if (typeof action.label !== "string" || !action.label.trim()) problems.push(`${where} has no label`);
    if (action.confirm !== undefined && typeof action.confirm !== "string") problems.push(`${where}.confirm isn't text`);
    if (action.description !== undefined && typeof action.description !== "string") {
      problems.push(`${where}.description isn't text`);
    }
    if (action.can !== undefined && typeof action.can !== "function") problems.push(`${where}.can isn't a function`);
    if (action.destructive !== undefined && typeof action.destructive !== "boolean") problems.push(`${where}.destructive isn't true or false`);
  });
  if (problems.length) throw new ViewDefinitionError(contract.name, problems);

  // ── Words ────────────────────────────────────────────────────────────
  const copy = definition.copy ?? {};
  const base = contract.name.split(".").pop() ?? contract.name;
  const noun = copy.noun ?? facts.noun ?? singular(base.replace(/_/g, " "));
  // Several: the view's, the contract's, the noun's plural; with only a derived noun, the
  // contract's label when it reads as a plural ("People"), else the table name.
  const labelWords = facts.label?.toLowerCase();
  const nounPlural =
    copy.nounPlural ??
    facts.nounPlural ??
    (copy.noun || facts.noun ? plural(noun) : labelWords && singular(labelWords) !== labelWords ? labelWords : base.replace(/_/g, " "));
  const title = copy.title ?? facts.label ?? titleCase(nounPlural);
  const labelField = facts.labelField ?? fields.find((f) => /^(name|title|label|full_name|display_name)$/.test(f.name))?.name;

  const label = (name: string): string => own(viewFields, name)?.label ?? byName.get(name)?.label ?? titleCase(name);
  const display = (name: string): DisplayHint => {
    const field = byName.get(name);
    return own(viewFields, name)?.display ?? (field ? deriveDisplay(field) : "text");
  };
  const valueLabel = (name: string, value: unknown): string => valueText(own(viewFields, name)?.labels, value);
  // A field the provider says this user can't read is left out everywhere, even when listed.
  const readable = (name: string) => byName.get(name)?.permissions?.read !== false;
  // A link is edited in a form (a picker over the linked rows, never a typed id) only when the view
  // opts in: `fields.<link>.link` (`{}` is enough) or `editLinks: true`. Otherwise it stays
  // read-only, as before 2.x links had pickers; a screen fills a required one (its `filter`,
  // `defaults`). The default flips in 3.0.
  const editLinks = definition.editLinks === true;
  const linkEditable = (f: FieldFacts) => Boolean(f.references) && (editLinks || own(viewFields, f.name)?.link !== undefined);
  // Read-only: what the server fills (generated, `@genesis readonly`), what this user can't change,
  // what the view says, and a link the view hasn't opted in. Scope (tenant) links stay out of
  // forms altogether (below).
  const readOnly = (field: FieldFacts) =>
    Boolean(
      field.generated ||
        field.readOnly ||
        (field.references && !linkEditable(field)) ||
        field.permissions?.update === false ||
        own(viewFields, field.name)?.readOnly,
    );
  // Left out of defaults (a view still lists them on purpose): the key, scope (tenant) columns,
  // sensitive values, and links, whose words cost a lookup.
  const quiet = (f: FieldFacts) => keys.has(f.name) || scope.has(f.name) || Boolean(f.sensitive) || Boolean(f.references);
  // An opted-in link a new row can't do without (no default, never empty) is in a derived form
  // anyway: without it, the form could never save. Other links are in a form when the view lists them.
  const neededLink = (f: FieldFacts) => linkEditable(f) && !f.nullable && !f.optional && !f.hasDefault && !scope.has(f.name);

  // ── Columns ──────────────────────────────────────────────────────────
  const defaultColumns: readonly (string | ComputedColumn<Row>)[] =
    own(columnLists, "default") ?? fields.filter((f) => !quiet(f)).map((f) => f.name);
  const presetNames = Object.freeze(["default", ...Object.keys(columnLists).filter((p) => p !== "default")]);
  // One field as a column: its words, hint, tones and guards. Cached, so every list and card shares it.
  const fieldColumns = new Map<string, ResolvedColumn<Row>>();
  const fieldColumn = (column: string): ResolvedColumn<Row> => {
    const cached = fieldColumns.get(column);
    if (cached) return cached;
    const v = own(viewFields, column);
    const resolved: ResolvedColumn<Row> = Object.freeze({
      key: column,
      label: label(column),
      display: display(column),
      field: byName.get(column)!,
      value: (row: Row) => row[column],
      ...(v?.tones ? { tones: v.tones } : {}),
      ...(v?.labels ? { labels: v.labels } : {}),
      ...(v?.labelField ? { labelField: v.labelField } : {}),
      ...(v?.missingLabel ? { missingLabel: v.missingLabel } : {}),
      ...(v?.when ? { when: (row: Row, viewer: Viewer = NO_VIEWER) => v.when!(row, viewer) } : {}),
      ...(v?.timeZone ? { timeZone: v.timeZone } : {}),
    });
    fieldColumns.set(column, resolved);
    return resolved;
  };
  const resolvedColumns = new Map<string, readonly ResolvedColumn<Row>[]>();
  const columns = (preset = "default"): readonly ResolvedColumn<Row>[] => {
    const cached = resolvedColumns.get(preset);
    if (cached) return cached;
    const list = preset === "default" ? defaultColumns : own(columnLists, preset);
    if (!list) throw new ViewDefinitionError(contract.name, [`no column preset "${preset}"`]);
    const out = Object.freeze(
      list.filter((column) => typeof column !== "string" || readable(column)).map((column): ResolvedColumn<Row> => {
        if (typeof column !== "string") {
          return Object.freeze({ key: column.key, label: column.label, display: column.display ?? "text", value: column.value });
        }
        return fieldColumn(column);
      }),
    );
    resolvedColumns.set(preset, out);
    return out;
  };

  // ── Form ─────────────────────────────────────────────────────────────
  // One picker per link, made once: what it lists, what names a row, the filters it sends.
  const links = new Map(
    fields
      .filter((f) => linkEditable(f))
      .map((f) => [f.name, resolveLink(contract.name, f.name, f.references!, own(viewFields, f.name)?.link, own(viewFields, f.name)?.labelField)]),
  );
  type Placed = { name: string; section: string | null; sectionTitle: string | null };
  const placed: readonly Placed[] = definition.form
    ? formItems.flatMap((item): Placed[] =>
        typeof item === "string"
          ? [{ name: item, section: null, sectionTitle: null }]
          : item.fields.map((name) => ({ name, section: item.section, sectionTitle: item.title ?? titleCase(item.section) })),
      )
    : fields
        // JSON needs an editor of its own, so it is never in a derived form.
        // A key the person types (a code, a slug) stays; one the server fills doesn't.
        .filter(
          (f) =>
            !readOnly(f) &&
            (!quiet(f) || (keys.has(f.name) && !f.hasDefault && !f.sensitive) || (neededLink(f) && !f.sensitive)) &&
            f.type !== "json" &&
            !f.array,
        )
        .map((f): Placed => ({ name: f.name, section: null, sectionTitle: null }));
  // A key the server fills (a default) is never sent on create; no key is sent on edit.
  const serverKey = (f: FieldFacts, mode: "create" | "edit") => keys.has(f.name) && (mode === "edit" || Boolean(f.hasDefault));
  const resolvedForms = new Map<string, readonly ResolvedFormField[]>();
  const form = (mode: "create" | "edit"): readonly ResolvedFormField[] => {
    const cached = resolvedForms.get(mode);
    if (cached) return cached;
    const out = Object.freeze(placed
      .filter(({ name }) => !scope.has(name) && readable(name) && !serverKey(byName.get(name)!, mode))
      .map(({ name, section, sectionTitle }) => {
        const field = byName.get(name)!;
        const v = own(viewFields, name);
        const locked = readOnly(field);
        return Object.freeze({
          field,
          label: label(name),
          display: display(name),
          required: !locked && !field.nullable && !field.optional && (mode === "edit" || !field.hasDefault),
          readOnly: locked,
          section,
          sectionTitle,
          ...(v?.max !== undefined ? { max: v.max } : {}),
          ...(v?.autoComplete ? { autoComplete: v.autoComplete } : {}),
          ...(v?.inputMode ? { inputMode: v.inputMode } : {}),
          ...(v?.enterKeyHint ? { enterKeyHint: v.enterKeyHint } : {}),
          ...(v?.labelField ? { labelField: v.labelField } : {}),
          ...(v?.missingLabel ? { missingLabel: v.missingLabel } : {}),
          ...(field.enumValues?.length
            ? { options: Object.freeze(field.enumValues.map((value) => Object.freeze({ value, label: valueLabel(name, value) }))) }
            : {}),
          ...(links.has(name) ? { link: links.get(name)! } : {}),
          ...(v?.visible ? { visible: v.visible } : {}),
        });
      }));
    resolvedForms.set(mode, out);
    return out;
  };
  const writable = (mode: "create" | "edit") => Object.freeze(form(mode).filter((f) => !f.readOnly).map((f) => f.field.name));

  // ── Guards and summary ───────────────────────────────────────────────
  const guards = definition.can ?? {};
  // `can("create", viewer)` and `can("update", row, viewer)`; no viewer means no one (fail closed).
  function can(action: "create" | "update" | "delete", rowOrViewer?: Row | Viewer, maybeViewer?: Viewer): Allowed {
    // Plain JavaScript can pass a row to create: that row would be read as the viewer.
    if (action === "create" && maybeViewer !== undefined) throw new TypeError(`[genesis-core] ${contract.name}: can("create", viewer) takes no row`);
    if (action === "create") return guards.create?.((rowOrViewer as Viewer | undefined) ?? NO_VIEWER) ?? true;
    const guard = guards[action];
    const row = rowOrViewer as Row | undefined;
    return guard && row ? guard(row, maybeViewer ?? NO_VIEWER) : true;
  }
  const actionGuards = new Map(actionList.map((a) => [a.name, a.can]));
  const resolvedActions: readonly ResolvedViewAction[] = Object.freeze(
    actionList.map((a) =>
      Object.freeze({
        name: a.name,
        label: a.label,
        ...(a.confirm !== undefined ? { confirm: a.confirm } : {}),
        ...(a.description !== undefined ? { description: a.description } : {}),
        ...(a.destructive ? { destructive: true } : {}),
      }),
    ),
  );
  function canAction(name: string, row: Row, viewer: Viewer = NO_VIEWER): Allowed {
    if (!actionGuards.has(name)) throw new ViewDefinitionError(contract.name, [`no action "${name}"`]);
    const guard = actionGuards.get(name);
    if (!guard) return true;
    const result: unknown = guard(row, viewer);
    // Only `true` allows; a reason is shown as given; anything else (false, "", undefined) refuses.
    if (result === true) return true;
    return typeof result === "string" && result.trim() ? result : "This isn't allowed.";
  }
  const summary = (row: Row): RowSummary => {
    if (definition.summary) return definition.summary(row);
    const value = labelField ? row[labelField] : undefined;
    return { title: value === null || value === undefined || value === "" ? titleCase(noun) : String(value) };
  };

  const galleryItem = (row: Row, override?: Partial<ViewGallery>): GalleryItem | undefined => {
    const block = { ...gallery, ...override };
    if (!block.image) return undefined;
    const src = row[block.image];
    if (typeof src !== "string" || !src) return undefined;
    const number = (name: string | undefined) => {
      const value = name ? Number(row[name]) : NaN;
      return Number.isFinite(value) && value > 0 ? value : undefined;
    };
    const text = (name: string | undefined) => {
      const value = name ? row[name] : undefined;
      return value === null || value === undefined || value === "" ? undefined : String(value);
    };
    const width = number(block.width);
    const height = number(block.height);
    const caption = text(block.caption);
    const alt = text(block.alt) ?? summary(row).title;
    return {
      id: String(encodeRecordKey(contract, row as DataRow)),
      src,
      alt,
      ...(width !== undefined && height !== undefined ? { width, height } : {}),
      ...(caption !== undefined ? { caption } : {}),
    };
  };

  return Object.freeze({
    contract,
    definition: Object.freeze({
      ...definition,
      fields: viewFields,
      columns: columnLists,
      presets,
      ...(definition.form ? { form: formItems } : {}),
      ...(definition.scope ? { scope: Object.freeze([...definition.scope]) } : {}),
      ...(definition.actions ? { actions: actionList } : {}),
      ...(calendar ? { calendar } : {}),
      ...(board ? { board } : {}),
      ...(gallery ? { gallery } : {}),
    }) as Readonly<ViewDefinition<C, Row>>,
    resource: contract.name,
    noun,
    nounPlural,
    title,
    labelField,
    presets: presetNames,
    field: (name: string) => byName.get(name),
    column: (name: string) => (byName.has(name) && readable(name) ? fieldColumn(name) : undefined),
    label,
    display,
    valueLabel,
    columns,
    form,
    writable,
    can: can as ResourceView<C, Row>["can"],
    actions: () => resolvedActions,
    canAction,
    summary,
    galleryItem,
  });
}
