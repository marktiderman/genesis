// defineView: a contract plus what it means to people, checked once and frozen (the same rule as
// genesis-sites' defineSection). Everything a renderer needs is resolved here, so web, native and
// the extension draw the same labels, columns and form.

import { NO_VIEWER, type Viewer } from "../viewer";
import { keyFields } from "../schema/keys";
import type { DataRow, FieldSchema, ResourceContract } from "../schema/types";
import { titleCase } from "../utils";
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
  ViewDefinition,
  ViewField,
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

/** A view that names a field, preset or section its contract doesn't have. */
export class ViewDefinitionError extends Error {
  readonly problems: readonly string[];
  constructor(resource: string, problems: readonly string[]) {
    super(`defineView(${resource}): ${problems.join("; ")}`);
    this.name = "ViewDefinitionError";
    this.problems = problems;
  }
}

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

// The view's own operations (`view.can`): an action can't take their names.
const RESERVED_ACTIONS: ReadonlySet<string> = new Set(["create", "update", "delete"]);

const own = <V>(record: Readonly<Record<string, V>> | undefined, key: string): V | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** A value in words: its entry in `labels`, else the value in title case (`draft` → "Draft"). */
export function valueText(labels: Readonly<Record<string, string>> | undefined, value: unknown): string {
  const key = String(value);
  return own(labels, key) ?? titleCase(key);
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
  const nounPlural = copy.nounPlural ?? facts.nounPlural ?? (copy.noun || facts.noun ? `${noun}s` : base.replace(/_/g, " "));
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
  // A link stays read-only until there's a picker, so no one sends a hand-typed id. A screen
  // fills a required one on create (its `filter`).
  const readOnly = (field: FieldFacts) =>
    Boolean(
      field.generated ||
        field.readOnly ||
        field.references ||
        field.permissions?.update === false ||
        own(viewFields, field.name)?.readOnly,
    );
  // Left out of defaults (a view still lists them on purpose): the key, scope (tenant) columns,
  // sensitive values, and links, which need a picker rather than a raw id.
  const quiet = (f: FieldFacts) => keys.has(f.name) || scope.has(f.name) || Boolean(f.sensitive) || Boolean(f.references);

  // ── Columns ──────────────────────────────────────────────────────────
  const defaultColumns: readonly (string | ComputedColumn<Row>)[] =
    own(columnLists, "default") ?? fields.filter((f) => !quiet(f)).map((f) => f.name);
  const presetNames = Object.freeze(["default", ...Object.keys(columnLists).filter((p) => p !== "default")]);
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
        const v = own(viewFields, column);
        return Object.freeze({
          key: column,
          label: label(column),
          display: display(column),
          field: byName.get(column)!,
          value: (row: Row) => row[column],
          ...(v?.tones ? { tones: v.tones } : {}),
          ...(v?.labels ? { labels: v.labels } : {}),
          ...(v?.when ? { when: (row: Row, viewer: Viewer = NO_VIEWER) => v.when!(row, viewer) } : {}),
          ...(v?.timeZone ? { timeZone: v.timeZone } : {}),
        });
      }),
    );
    resolvedColumns.set(preset, out);
    return out;
  };

  // ── Form ─────────────────────────────────────────────────────────────
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
        .filter((f) => !readOnly(f) && (!quiet(f) || (keys.has(f.name) && !f.hasDefault && !f.sensitive)) && f.type !== "json" && !f.array)
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
          ...(field.enumValues?.length
            ? { options: Object.freeze(field.enumValues.map((value) => Object.freeze({ value, label: valueLabel(name, value) }))) }
            : {}),
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
    }) as Readonly<ViewDefinition<C, Row>>,
    resource: contract.name,
    noun,
    nounPlural,
    title,
    labelField,
    presets: presetNames,
    field: (name: string) => byName.get(name),
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
  });
}
