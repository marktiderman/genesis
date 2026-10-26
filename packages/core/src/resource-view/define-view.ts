// defineView: a contract plus what it means to people, checked once and frozen (the same rule as
// genesis-sites' defineSection). Everything a renderer needs is resolved here, so web, native and
// the extension draw the same labels, columns and form.

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

function singular(word: string): string {
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ss|us)$/.test(word) || !word.endsWith("s")) return word;
  return word.slice(0, -1);
}

/**
 * Describe what a resource means to people. The result is frozen and platform-neutral:
 *
 * ```ts
 * export const brandsView = defineView(contracts["public.brands"], {
 *   fields: { status: { display: "badge", tones: { active: "success" } } },
 *   columns: { default: ["name", "status", "created_at"], compact: ["name"] },
 *   can: { delete: (row) => (row.is_default ? "The default brand stays." : true) },
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
  const viewFields = (definition.fields ?? {}) as Readonly<Record<string, NonNullable<ViewDefinition<C, Row>["fields"]>[never]>>;
  const columnLists = (definition.columns ?? {}) as Readonly<Record<string, readonly (string | ComputedColumn<Row>)[] | undefined>>;

  // ── Check every name once ────────────────────────────────────────────
  const problems: string[] = [];
  const known = (name: string, where: string) => {
    if (!byName.has(name)) problems.push(`${where} names "${name}", which isn't a field`);
  };
  for (const name of Object.keys(viewFields)) known(name, "fields");
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
  for (const item of definition.form ?? []) {
    for (const name of typeof item === "string" ? [item] : item.fields) {
      known(name, "form");
      if (formSeen.has(name)) problems.push(`form lists "${name}" twice`);
      formSeen.add(name);
    }
  }
  for (const name of scope) known(name, "scope");
  if (definition.groupBy) known(definition.groupBy, "groupBy");
  if (definition.orderBy) known(definition.orderBy.field, "orderBy");
  for (const [name, preset] of Object.entries(definition.presets ?? {})) {
    if (preset.columns && preset.columns !== "default" && !columnLists[preset.columns]) {
      problems.push(`presets.${name} uses columns "${preset.columns}", which isn't defined`);
    }
    for (const field of Object.keys(preset.filter ?? {})) known(field, `presets.${name}.filter`);
  }
  if (facts.labelField) known(facts.labelField, "the contract's labelField");
  const actionSeen = new Set<string>();
  if (definition.actions !== undefined && !Array.isArray(definition.actions)) problems.push("actions isn't a list");
  (Array.isArray(definition.actions) ? definition.actions : []).forEach((action, i) => {
    const where = `actions[${i}]`;
    if (!action || typeof action !== "object") {
      problems.push(`${where} isn't an action`);
      return;
    }
    if (typeof action.name !== "string" || !action.name.trim()) problems.push(`${where} has no name`);
    else if (actionSeen.has(action.name)) problems.push(`actions lists "${action.name}" twice`);
    else actionSeen.add(action.name);
    if (typeof action.label !== "string" || !action.label.trim()) problems.push(`${where} has no label`);
    if (action.confirm !== undefined && typeof action.confirm !== "string") problems.push(`${where}.confirm isn't text`);
    if (action.description !== undefined && typeof action.description !== "string") {
      problems.push(`${where}.description isn't text`);
    }
    if (action.can !== undefined && typeof action.can !== "function") problems.push(`${where}.can isn't a function`);
  });
  if (problems.length) throw new ViewDefinitionError(contract.name, problems);

  // ── Words ────────────────────────────────────────────────────────────
  const copy = definition.copy ?? {};
  const base = contract.name.split(".").pop() ?? contract.name;
  const noun = copy.noun ?? facts.noun ?? singular(base.replace(/_/g, " "));
  const nounPlural = copy.nounPlural ?? facts.nounPlural ?? (copy.noun || facts.noun ? `${noun}s` : base.replace(/_/g, " "));
  const title = copy.title ?? facts.label ?? titleCase(nounPlural);
  const labelField = facts.labelField ?? fields.find((f) => /^(name|title|label|full_name|display_name)$/.test(f.name))?.name;

  const label = (name: string): string => viewFields[name]?.label ?? byName.get(name)?.label ?? titleCase(name);
  const display = (name: string): DisplayHint => {
    const field = byName.get(name);
    return viewFields[name]?.display ?? (field ? deriveDisplay(field) : "text");
  };
  const readOnly = (field: FieldFacts) => Boolean(field.generated || field.readOnly || viewFields[field.name]?.readOnly);

  // ── Columns ──────────────────────────────────────────────────────────
  const defaultColumns: readonly (string | ComputedColumn<Row>)[] =
    columnLists["default"] ?? fields.filter((f) => !f.sensitive && !keys.has(f.name)).map((f) => f.name);
  const presetNames = Object.freeze(["default", ...Object.keys(columnLists).filter((p) => p !== "default")]);
  const resolvedColumns = new Map<string, readonly ResolvedColumn<Row>[]>();
  const columns = (preset = "default"): readonly ResolvedColumn<Row>[] => {
    const cached = resolvedColumns.get(preset);
    if (cached) return cached;
    const list = preset === "default" ? defaultColumns : columnLists[preset];
    if (!list) throw new ViewDefinitionError(contract.name, [`no column preset "${preset}"`]);
    const out = Object.freeze(
      list.map((column): ResolvedColumn<Row> => {
        if (typeof column !== "string") {
          return Object.freeze({ key: column.key, label: column.label, display: column.display ?? "text", value: column.value });
        }
        const v = viewFields[column];
        return Object.freeze({
          key: column,
          label: label(column),
          display: display(column),
          field: byName.get(column)!,
          value: (row: Row) => row[column],
          ...(v?.tones ? { tones: v.tones } : {}),
          ...(v?.when ? { when: v.when } : {}),
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
    ? definition.form.flatMap((item): Placed[] =>
        typeof item === "string"
          ? [{ name: item, section: null, sectionTitle: null }]
          : item.fields.map((name) => ({ name, section: item.section, sectionTitle: item.title ?? titleCase(item.section) })),
      )
    : fields
        .filter((f) => !f.generated && !f.readOnly && !f.sensitive && !scope.has(f.name) && !(keys.has(f.name) && f.hasDefault))
        .map((f): Placed => ({ name: f.name, section: null, sectionTitle: null }));
  const form = (mode: "create" | "edit"): readonly ResolvedFormField[] =>
    placed
      .filter(({ name }) => !scope.has(name) && !(mode === "edit" && keys.has(name)))
      .map(({ name, section, sectionTitle }) => {
        const field = byName.get(name)!;
        const v = viewFields[name];
        const locked = readOnly(field);
        return Object.freeze({
          field,
          label: label(name),
          display: display(name),
          required: !locked && !field.nullable && (mode === "edit" || !field.hasDefault),
          readOnly: locked,
          section,
          sectionTitle,
          ...(v?.max !== undefined ? { max: v.max } : {}),
          ...(v?.visible ? { visible: v.visible } : {}),
        });
      });
  const writable = (mode: "create" | "edit") => form(mode).filter((f) => !f.readOnly).map((f) => f.field.name);

  // ── Guards and summary ───────────────────────────────────────────────
  const guards = definition.can ?? {};
  function can(action: "create" | "update" | "delete", row?: Row): Allowed {
    if (action === "create") return guards.create?.() ?? true;
    const guard = guards[action];
    return guard && row ? guard(row) : true;
  }
  const actionGuards = new Map((definition.actions ?? []).map((a) => [a.name, a.can]));
  const resolvedActions: readonly ResolvedViewAction[] = Object.freeze(
    (definition.actions ?? []).map((a) =>
      Object.freeze({
        name: a.name,
        label: a.label,
        ...(a.confirm !== undefined ? { confirm: a.confirm } : {}),
        ...(a.description !== undefined ? { description: a.description } : {}),
      }),
    ),
  );
  function canAction(name: string, row: Row): Allowed {
    if (!actionGuards.has(name)) throw new ViewDefinitionError(contract.name, [`no action "${name}"`]);
    return actionGuards.get(name)?.(row) ?? true;
  }
  const summary = (row: Row): RowSummary => {
    if (definition.summary) return definition.summary(row);
    const value = labelField ? row[labelField] : undefined;
    return { title: value === null || value === undefined || value === "" ? titleCase(noun) : String(value) };
  };

  return Object.freeze({
    contract,
    definition: Object.freeze({ ...definition }),
    resource: contract.name,
    noun,
    nounPlural,
    title,
    labelField,
    presets: presetNames,
    field: (name: string) => byName.get(name),
    label,
    display,
    columns,
    form,
    writable,
    can: can as ResourceView<C, Row>["can"],
    actions: () => resolvedActions,
    canAction,
    summary,
  });
}
