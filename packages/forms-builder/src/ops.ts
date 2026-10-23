/**
 * Pure edits on a form definition. Every function takes a definition and
 * returns a new one; nothing is mutated, so undo is a stack of values and the
 * same edits run on a server or in a test.
 *
 * Ids are immutable once a block exists (answers are keyed by them); keys and
 * labels are free to change. Removing something also removes what pointed at
 * it, so an edit never leaves a dangling reference for `parseForm` to reject.
 */
import {
  canonicalJson,
  choiceOptions,
  getFieldType,
  renameFormulaKey,
  type Block,
  type Condition,
  type ContentBlock,
  type Ending,
  type FieldBlock,
  type FormDefinition,
  type FormSettings,
  type HiddenInput,
  type Json,
  type LogicRule,
  type Operator,
  type PageBreakBlock,
} from "@marktiderman/genesis-forms";

/** A short random id: unique enough within one form, readable in JSON. */
function randomId(prefix: string): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8)}`;
}

/** Makes every new id: `prefix` is `q`, `opt`, `rule`, `form`, `page`, `h` or `t`. */
export type IdGenerator = (prefix: string) => string;

let generateId: IdGenerator = randomId;

/**
 * Replace the id generator (block, option, rule and form ids), for example
 * with a counter so tests and snapshots are stable. Pass nothing to go back
 * to random ids. It is process-wide; ids must stay unique within a form.
 */
export function setIdGenerator(fn?: IdGenerator | null): void {
  generateId = fn ?? randomId;
}

/** A new id from the current generator (random by default). It may repeat one already in a form: use `freshId` there. */
export function newId(prefix: string): string {
  return generateId(prefix);
}

/** Every id in a form: blocks, rules, endings and the form's own. */
export function formIds(def: FormDefinition): Set<string> {
  return new Set([def.id, ...def.blocks.map((b) => b.id), ...(def.logic ?? []).map((r) => r.id), ...(def.endings ?? []).map((e) => e.id)]);
}

/**
 * A new id not in `taken` (a form's ids, or any list). It asks the current
 * generator again until it gets an unused one, so a host generator (a counter
 * in tests) may restart; after 1000 repeats it falls back to random ids.
 * `Object.prototype` names (which `parseForm` rejects) are skipped too.
 */
export function freshId(prefix: string, taken: FormDefinition | Iterable<string>): string {
  const used = isForm(taken) ? formIds(taken) : new Set(taken);
  for (let i = 0; i < 1000; i++) {
    const id = generateId(prefix);
    if (!used.has(id) && !RESERVED.has(id)) return id;
  }
  for (;;) {
    const id = randomId(prefix);
    if (!used.has(id) && !RESERVED.has(id)) return id;
  }
}

const isForm = (v: FormDefinition | Iterable<string>): v is FormDefinition =>
  typeof v === "object" && v !== null && "blocks" in v && Array.isArray((v as FormDefinition).blocks);

/** `"How was class?"` → `"how_was_class"`. Always a valid, non-empty key. */
export function slugKey(text: string, fallback = "question"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  const key = slug || fallback;
  return /^[0-9]/.test(key) ? `q_${key}` : key;
}

/** Names `parseForm` rejects as ids, keys and hidden names: they collide with `Object.prototype`. */
const RESERVED: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

/** `base`, or `base_2`, `base_3`… whichever is not in `taken` (nor an `Object.prototype` name). */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken, ...RESERVED]);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Deep equality of JSON values, ignoring key order. */
const sameJson = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

const fieldKeys = (def: FormDefinition, except?: string) =>
  def.blocks.flatMap((b) => (b.kind === "field" && b.id !== except ? [b.key] : []));

/** An empty, valid definition. */
export function emptyForm(id = newId("form"), title = "Untitled form"): FormDefinition {
  return {
    schemaVersion: 1,
    id,
    title,
    layout: { mode: "focus" },
    blocks: [],
    endings: [{ id: "default", title: "Thanks for your answers." }],
  };
}

// ── Blocks ───────────────────────────────────────────────────────────────────

/**
 * What `createField`, `defaultProps` and `starterValue` may ask of a host's
 * field-type editor (see `FieldTypeEditor`): the data parts, without UI.
 */
export interface FieldTypeDefaults {
  type: string;
  label?: string | undefined;
  defaultProps?: ((def: FormDefinition) => Record<string, Json> | undefined) | undefined;
  starterValue?: ((field: FieldBlock, op: Operator) => Json) | undefined;
}

const editorFor = (editors: readonly FieldTypeDefaults[] | undefined, type: string) => editors?.find((e) => e.type === type);

/** The columns a new `table` field starts with; authors rename and add to them. */
export const DEFAULT_TABLE_COLUMNS: readonly { key: string; label: string; long?: true }[] = [
  { key: "column_1", label: "Column 1" },
  { key: "column_2", label: "Column 2" },
];

/**
 * Default props for a new field, so it is valid as soon as it is added. A
 * matching editor in `editors` is asked first. Choice options get fresh
 * values from `newOptionValue()`, so a field retyped to choice never brings
 * back a value earlier answers used; call it outside a reducer.
 */
export function defaultProps(
  type: string,
  opts: { def?: FormDefinition; editors?: readonly FieldTypeDefaults[] } = {},
): Record<string, Json> | undefined {
  const editor = editorFor(opts.editors, type);
  if (editor?.defaultProps) return editor.defaultProps(opts.def ?? emptyForm("form"));
  switch (type) {
    case "rating":
      return { max: 5 };
    case "single-choice":
    case "multi-choice":
    case "dropdown":
      return { options: withOptionValues([{ label: "Option 1" }, { label: "Option 2" }]) };
    case "table":
      return { columns: DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c })), minRows: 1, maxRows: 3 };
    case "calculated":
      // Valid from the start; the author writes the real formula.
      return { formula: "0" };
    default:
      return undefined;
  }
}

export interface NewField {
  type: string;
  label?: string;
  key?: string;
  required?: boolean;
  props?: Record<string, Json>;
}

/**
 * A new field block with a fresh id and a key unique in `def`. A matching
 * editor in `editors` gives its label and props. Without `label` the field is
 * titled after its type; pass `label: ""` for an untitled question (the
 * builder's Add menu does, so the author writes the title), whose key is then
 * made from the type's name.
 */
export function createField(def: FormDefinition, spec: NewField, editors?: readonly FieldTypeDefaults[]): FieldBlock {
  const typeName = editorFor(editors, spec.type)?.label ?? getFieldType(spec.type)?.label ?? "Question";
  const label = spec.label ?? typeName;
  const block: FieldBlock = {
    kind: "field",
    id: freshId("q", def),
    key: uniqueName(spec.key ?? slugKey(label || typeName), fieldKeys(def)),
    type: spec.type,
    label,
  };
  if (spec.required) block.required = true;
  const props = spec.props ?? defaultProps(spec.type, { def, editors });
  if (props) block.props = props;
  return block;
}

/** A heading or text block. Pass `def` so its id is unused there. */
export function createContent(
  type: ContentBlock["type"],
  text = type === "heading" ? "Heading" : "Text",
  def?: FormDefinition,
): ContentBlock {
  const prefix = type === "heading" ? "h" : "t";
  return { kind: "content", id: def ? freshId(prefix, def) : newId(prefix), type, text };
}

/** A page break. Pass `def` so its id is unused there. */
export function createPageBreak(title?: string, def?: FormDefinition): PageBreakBlock {
  const id = def ? freshId("page", def) : newId("page");
  return title ? { kind: "page-break", id, title } : { kind: "page-break", id };
}

/** Insert `block` at `index` (default: the end). */
export function insertBlock(def: FormDefinition, block: Block, index = def.blocks.length): FormDefinition {
  const blocks = [...def.blocks];
  blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
  return { ...def, blocks };
}

/** Optional members that also take `undefined` (meaning "remove it"), under exactOptionalPropertyTypes too. */
type PatchOf<T> = { [K in keyof T]?: T[K] | undefined };

export type BlockPatch =
  | PatchOf<Omit<FieldBlock, "kind" | "id">>
  | PatchOf<Omit<ContentBlock, "kind" | "id">>
  | PatchOf<Omit<PageBreakBlock, "kind" | "id">>;

/**
 * Change a block. `undefined` in the patch removes that property, so an
 * optional flag goes away instead of being stored as `false` or `undefined`.
 * A key is made unique if it clashes; a changed field type gets that type's
 * default props and loses the rules that compare it, since their operators
 * and values belong to the old type. Between single choice, multiple choice
 * and dropdown the options stay, and so do rules whose operators the new type offers. An edit
 * that changes nothing returns `def` itself. Default props are made here
 * when the patch has none (new option values are random): pass `props` from
 * `defaultProps()` to keep the edit pure.
 */
export function updateBlock(def: FormDefinition, id: string, patch: BlockPatch): FormDefinition {
  let typeChanged: { from: string; to: string } | undefined;
  let changed = false;
  let renamed: { from: string; to: string } | undefined;
  const blocks = def.blocks.map((block): Block => {
    if (block.id !== id) return block;
    const next = { ...block } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (k === "kind" || k === "id") continue;
      if (v === undefined || v === false || v === "") {
        // Required text stays; optional props and flags are removed.
        if (k === "label" || k === "key" || k === "text" || k === "type") next[k] = v ?? "";
        else delete next[k];
      } else next[k] = v;
    }
    if (block.kind === "field") {
      if (typeof next.key === "string" && next.key !== block.key) {
        next.key = uniqueName(slugKey(next.key, block.key), fieldKeys(def, id));
        if (next.key !== block.key) renamed = { from: block.key, to: next.key as string };
      }
      if (typeof next.type === "string" && next.type !== block.type) {
        typeChanged = { from: block.type, to: next.type };
        if (!("props" in patch) && !(CHOICE_TYPES.has(block.type) && CHOICE_TYPES.has(next.type))) {
          const props = defaultProps(next.type);
          if (props) next.props = props;
          else delete next.props;
        }
      }
    }
    if (sameJson(next, block)) return block;
    changed = true;
    return next as unknown as Block;
  });
  if (!changed) return def;
  let out: FormDefinition = { ...def, blocks };
  if (renamed) out = renameFormulaRefs(rewriteRecall(out, "field", renamed.from, renamed.to), renamed.from, renamed.to);
  if (!typeChanged) return out;
  const { from, to } = typeChanged;
  if (CHOICE_TYPES.has(from) && CHOICE_TYPES.has(to)) {
    const allowed = new Set(operatorsFor(to));
    return removeRulesWhere(out, (rule) => comparisons(rule.when, id).some((c) => !allowed.has(c.op)));
  }
  return removeRulesWhere(out, (rule) => conditionFields(rule.when).has(id));
}

const CHOICE_TYPES: ReadonlySet<string> = new Set(["single-choice", "multi-choice", "dropdown"]);

/** Move a block to `toIndex` (clamped). Rules keep working: they point at ids. */
export function moveBlock(def: FormDefinition, id: string, toIndex: number): FormDefinition {
  const from = def.blocks.findIndex((b) => b.id === id);
  const to = Math.max(0, Math.min(toIndex, def.blocks.length - 1));
  if (from === -1 || from === to) return def;
  const blocks = [...def.blocks];
  const [block] = blocks.splice(from, 1);
  blocks.splice(to, 0, block!);
  return { ...def, blocks };
}

/** The id prefix new blocks like `block` get. */
export function blockIdPrefix(block: Block): string {
  return block.kind === "field" ? "q" : block.kind === "content" ? (block.type === "heading" ? "h" : "t") : "page";
}

/**
 * A copy right after the original, with a new id and key. Rules are not
 * copied. Pass `copyId` (from `freshId(blockIdPrefix(block), def)`) to keep
 * the edit pure; without it a new id is made here. A `copyId` already in the
 * form changes nothing.
 */
export function duplicateBlock(def: FormDefinition, id: string, copyId?: string): FormDefinition {
  const index = def.blocks.findIndex((b) => b.id === id);
  if (index === -1) return def;
  const original = def.blocks[index]!;
  const newBlockId = copyId ?? freshId(blockIdPrefix(original), def);
  if (def.blocks.some((b) => b.id === newBlockId)) return def;
  let copy: Block;
  if (original.kind === "field") {
    copy = {
      ...structuredClone(original),
      id: newBlockId,
      key: uniqueName(`${original.key}_copy`, fieldKeys(def)),
      label: `${original.label} (copy)`,
    };
  } else copy = { ...original, id: newBlockId };
  return insertBlock(def, copy, index + 1);
}

/**
 * Remove a block, its recall tokens (they become their fallback text) and
 * every rule that reads it, shows or hides it, or jumps from it. A jump *to*
 * it goes to the next step after it instead, or the default ending.
 */
export function removeBlock(def: FormDefinition, id: string): FormDefinition {
  const index = def.blocks.findIndex((b) => b.id === id);
  if (index === -1) return def;
  const removed = def.blocks[index]!;
  const nextStep = def.blocks.slice(index + 1).find((b) => b.kind !== "page-break");
  // With no step after it, the jump goes to the default ending. A form without
  // endings has none to name: the form ends there anyway, so the jump goes.
  const ending = defaultEndingId(def);
  const retarget: Extract<LogicRule, { effect: "jump" }>["to"] | null = nextStep ? nextStep.id : ending ? { ending } : null;
  let out: FormDefinition = { ...def, blocks: def.blocks.filter((b) => b.id !== id) };
  if (out.logic && retarget) {
    out.logic = out.logic.map((r) => (r.effect === "jump" && r.to === id && r.from !== id ? { ...r, to: retarget } : r));
  }
  if (removed.kind === "field") out = rewriteRecall(out, "field", removed.key, null);
  return removeRulesWhere(out, (rule) => ruleRefs(rule).has(id));
}

/** The ending a form finishes at when no jump names one, as the engine picks it: `"default"`, else the first. */
export function defaultEndingId(def: FormDefinition): string | null {
  return def.endings?.find((e) => e.id === "default")?.id ?? def.endings?.[0]?.id ?? null;
}

// ── Choice options ───────────────────────────────────────────────────────────

/**
 * A value for a new choice option. Random, not derived from the label, so it
 * never repeats a value a removed option had: earlier answers that chose that
 * option must not read as the new one. Call it outside a reducer.
 */
export const newOptionValue = () => newId("opt");

/**
 * Set a choice field's options. Existing values are kept (answers store
 * values) and made unique; an option without one gets `newOptionValue()`
 * here, so pass values in (see `withOptionValues`) to keep the edit pure. A removed value leaves the "is one
 * of" lists that name it; rules that compare with it otherwise, or whose list
 * becomes empty, are removed.
 */
export function setOptions(
  def: FormDefinition,
  id: string,
  options: readonly { value?: string; label: string }[],
): FormDefinition {
  const field = def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === id);
  if (!field) return def;
  const taken: string[] = [];
  const next = options.map((o) => {
    const value = uniqueName(o.value || newOptionValue(), taken);
    taken.push(value);
    return { value, label: o.label };
  });
  let out = updateBlock(def, id, { props: { ...field.props, options: next } });
  const allowed = new Set(taken);
  const gone = (v: Json) => typeof v === "string" && !allowed.has(v);
  const inList = (c: Comparison) => c.op === "in" && c.right !== undefined && "value" in c.right && Array.isArray(c.right.value);
  if (out.logic?.some((r) => comparisons(r.when, id).some((c) => inList(c) && (c.right as { value: Json[] }).value.some(gone)))) {
    out = { ...out, logic: out.logic.map((r) => ({ ...r, when: pruneInLists(r.when, id, gone) })) };
  }
  return removeRulesWhere(out, (rule) =>
    comparisons(rule.when, id).some((c) => {
      const v = c.right && "value" in c.right ? c.right.value : undefined;
      if (v === undefined) return false;
      return Array.isArray(v) ? (c.op === "in" && !v.length) || v.some(gone) : gone(v);
    }),
  );
}

/** `options` with a new value, unused among them, for each one that has none. Call it outside a reducer. */
export function withOptionValues<T extends { value?: string; label: string }>(options: readonly T[]): (T & { value: string })[] {
  const taken = new Set(options.flatMap((o) => (o.value ? [o.value] : [])));
  return options.map((o) => {
    if (o.value) return o as T & { value: string };
    const value = freshId("opt", taken);
    taken.add(value);
    return { ...o, value };
  });
}

/** Drop the values `gone` matches from the "is one of" lists that compare field `id`. */
function pruneInLists(condition: Condition, id: string, gone: (v: Json) => boolean): Condition {
  if ("all" in condition) return { all: condition.all.map((c) => pruneInLists(c, id, gone)) };
  if ("any" in condition) return { any: condition.any.map((c) => pruneInLists(c, id, gone)) };
  if ("not" in condition) return { not: pruneInLists(condition.not, id, gone) };
  const v = condition.right && "value" in condition.right ? condition.right.value : undefined;
  if (condition.op !== "in" || !("field" in condition.left) || condition.left.field !== id || !Array.isArray(v)) return condition;
  return v.some(gone) ? { ...condition, right: { value: v.filter((x) => !gone(x)) } } : condition;
}

// ── Logic ────────────────────────────────────────────────────────────────────

/** Every block id a condition reads. */
export function conditionFields(condition: Condition): Set<string> {
  const ids = new Set<string>();
  const visit = (c: Condition) => {
    if ("all" in c) return c.all.forEach(visit);
    if ("any" in c) return c.any.forEach(visit);
    if ("not" in c) return visit(c.not);
    if ("field" in c.left) ids.add(c.left.field);
    if (c.right && "field" in c.right) ids.add(c.right.field);
  };
  visit(condition);
  return ids;
}

/** Every hidden input a condition reads. */
export function conditionHidden(condition: Condition): Set<string> {
  const names = new Set<string>();
  const visit = (c: Condition) => {
    if ("all" in c) return c.all.forEach(visit);
    if ("any" in c) return c.any.forEach(visit);
    if ("not" in c) return visit(c.not);
    if ("hidden" in c.left) names.add(c.left.hidden);
    if (c.right && "hidden" in c.right) names.add(c.right.hidden);
  };
  visit(condition);
  return names;
}

type Comparison = Extract<Condition, { op: Operator }>;

/** The comparisons in a condition whose left side is field `id` (or, with `hidden`, that hidden input). */
function comparisons(condition: Condition, id: string, kind: "field" | "hidden" = "field"): Comparison[] {
  const out: Comparison[] = [];
  const visit = (c: Condition) => {
    if ("all" in c) return c.all.forEach(visit);
    if ("any" in c) return c.any.forEach(visit);
    if ("not" in c) return visit(c.not);
    if (kind === "field" ? "field" in c.left && c.left.field === id : "hidden" in c.left && c.left.hidden === id) out.push(c);
  };
  visit(condition);
  return out;
}

/** Every block id a rule depends on: what it reads, targets, or jumps from or to. */
export function ruleRefs(rule: LogicRule): Set<string> {
  const ids = conditionFields(rule.when);
  if (rule.effect === "jump") {
    ids.add(rule.from);
    if (typeof rule.to === "string") ids.add(rule.to);
  } else ids.add(rule.target);
  return ids;
}

/** The operators a hidden input of each type offers in logic. */
export const HIDDEN_OPERATORS: Record<HiddenInput["type"], Operator[]> = {
  string: ["eq", "neq", "in", "answered", "empty"],
  number: ["eq", "neq", "lt", "lte", "gt", "gte", "answered", "empty"],
  boolean: ["eq", "neq", "answered", "empty"],
};

function removeRulesWhere(def: FormDefinition, drop: (rule: LogicRule) => boolean): FormDefinition {
  if (!def.logic?.length) return def;
  const logic = def.logic.filter((r) => !drop(r));
  if (logic.length === def.logic.length) return def;
  const out: FormDefinition = { ...def, logic };
  if (!logic.length) delete out.logic;
  return out;
}

export function addRule(def: FormDefinition, rule: LogicRule): FormDefinition {
  return { ...def, logic: [...(def.logic ?? []), rule] };
}

export function updateRule(def: FormDefinition, id: string, rule: LogicRule): FormDefinition {
  const current = def.logic?.find((r) => r.id === id);
  if (!current || sameJson(current, { ...rule, id })) return def;
  return { ...def, logic: (def.logic ?? []).map((r) => (r.id === id ? { ...rule, id } : r)) };
}

export function removeRule(def: FormDefinition, id: string): FormDefinition {
  return removeRulesWhere(def, (r) => r.id === id);
}

export function moveRule(def: FormDefinition, id: string, toIndex: number): FormDefinition {
  const logic = [...(def.logic ?? [])];
  const from = logic.findIndex((r) => r.id === id);
  const to = Math.max(0, Math.min(toIndex, logic.length - 1));
  if (from === -1 || from === to) return def;
  const [rule] = logic.splice(from, 1);
  logic.splice(to, 0, rule!);
  return { ...def, logic };
}

/** The operators a field type offers, from its manifest. */
export function operatorsFor(type: string): Operator[] {
  return getFieldType(type)?.operators ?? ["answered", "empty"];
}

/** Operators that take no right-hand value. */
export const UNARY_OPERATORS: ReadonlySet<Operator> = new Set<Operator>(["answered", "empty"]);

/**
 * A starter rule for a field: the first operator its type offers, compared
 * with a sensible first value. Callers edit it from there.
 */
export function starterCondition(field: FieldBlock, editors?: readonly FieldTypeDefaults[]): Condition {
  const op = operatorsFor(field.type)[0] ?? "answered";
  if (UNARY_OPERATORS.has(op)) return { op, left: { field: field.id } };
  return { op, left: { field: field.id }, right: { value: starterValue(field, op, editors) } };
}

/** A first value to compare `field` with. A matching editor in `editors` is asked first. */
export function starterValue(field: FieldBlock, op: Operator, editors?: readonly FieldTypeDefaults[]): Json {
  const custom = editorFor(editors, field.type)?.starterValue;
  if (custom) return custom(field, op);
  const one = starterScalar(field);
  // "is one of" compares with a list.
  return op === "in" ? (one === "" ? [] : [one]) : one;
}

function starterScalar(field: FieldBlock): string | number | boolean {
  if (field.type === "yes-no") return true;
  if (field.type === "rating") return typeof field.props?.max === "number" ? Math.ceil(field.props.max / 2) : 3;
  if (field.type === "nps") return 9;
  if (field.type === "calculated") return field.props?.format === "text" ? "" : 0;
  if (field.type === "number") return typeof field.props?.min === "number" ? field.props.min : 0;
  return choiceOptions(field)[0]?.value ?? "";
}

// ── Endings ──────────────────────────────────────────────────────────────────

export function addEnding(def: FormDefinition, title = "Thanks!"): FormDefinition {
  const taken = (def.endings ?? []).map((e) => e.id);
  const ending: Ending = { id: uniqueName(slugKey(title, "ending"), taken), title };
  return { ...def, endings: [...(def.endings ?? []), ending] };
}

export function updateEnding(def: FormDefinition, id: string, patch: Partial<Omit<Ending, "id">>): FormDefinition {
  let changed = false;
  const endings = (def.endings ?? []).map((e) => {
    if (e.id !== id) return e;
    const next = { ...e, ...patch };
    if (!next.description) delete next.description;
    if (sameJson(next, e)) return e;
    changed = true;
    return next;
  });
  return changed ? { ...def, endings } : def;
}

/** Remove an ending and the jumps that go to it. The first ending is the default and stays. */
export function removeEnding(def: FormDefinition, id: string): FormDefinition {
  const endings = def.endings ?? [];
  if (endings[0]?.id === id) return def;
  const out = { ...def, endings: endings.filter((e) => e.id !== id) };
  return removeRulesWhere(out, (r) => r.effect === "jump" && typeof r.to === "object" && r.to.ending === id);
}

// ── Hidden inputs ────────────────────────────────────────────────────────────

/**
 * A hidden input as the builder edits it. `identifying` (the respondent's own
 * details: not asked or stored when the form is anonymous) is declared here
 * too, so this compiles against a forms release from before it existed.
 */
export type HiddenSpec = HiddenInput & { identifying?: boolean };

export function addHidden(def: FormDefinition, input: Partial<HiddenSpec> = {}): FormDefinition {
  const name = uniqueName(slugKey(input.name ?? "input", "input"), (def.hidden ?? []).map((h) => h.name));
  const next: HiddenSpec = { name, type: input.type ?? "string", source: input.source ?? "url" };
  if (input.sensitive) next.sensitive = true;
  if (input.identifying) next.identifying = true;
  return { ...def, hidden: [...(def.hidden ?? []), next] };
}

/**
 * Change a hidden input. Renaming it updates the conditions and the recall
 * placeholders (`{{hidden:name}}`) that use it; a new type removes the rules
 * whose operator or value no longer fits it.
 */
export function updateHidden(def: FormDefinition, name: string, patch: Partial<HiddenSpec>): FormDefinition {
  const hidden = def.hidden ?? [];
  const current = hidden.find((h) => h.name === name);
  if (!current) return def;
  const others = hidden.filter((h) => h.name !== name).map((h) => h.name);
  const newName = patch.name !== undefined ? uniqueName(slugKey(patch.name, name), others) : name;
  const next: HiddenSpec = { ...current, ...patch, name: newName };
  if (!next.sensitive) delete next.sensitive;
  if (!next.identifying) delete next.identifying;
  if (sameJson(next, current)) return def;
  let out: FormDefinition = { ...def, hidden: hidden.map((h) => (h.name === name ? next : h)) };
  if (next.type !== current.type) {
    const ops = new Set(HIDDEN_OPERATORS[next.type]);
    const fits = (v: Json): boolean => (Array.isArray(v) ? v.every(fits) : typeof v === next.type);
    out = removeRulesWhere(out, (rule) =>
      comparisons(rule.when, name, "hidden").some(
        (c) => !ops.has(c.op) || (c.right !== undefined && "value" in c.right && !fits(c.right.value)),
      ),
    );
  }
  if (newName !== name) out = renameHiddenRefs(out, name, newName);
  return out;
}

/** Remove a hidden input, the rules that read it and its recall tokens. */
export function removeHidden(def: FormDefinition, name: string): FormDefinition {
  const hidden = (def.hidden ?? []).filter((h) => h.name !== name);
  const out: FormDefinition = { ...rewriteRecall(def, "hidden", name, null), hidden };
  if (!hidden.length) delete out.hidden;
  return removeRulesWhere(out, (r) => conditionHidden(r.when).has(name));
}

function renameHiddenRefs(def: FormDefinition, from: string, to: string): FormDefinition {
  const rename = (c: Condition): Condition => {
    if ("all" in c) return { all: c.all.map(rename) };
    if ("any" in c) return { any: c.any.map(rename) };
    if ("not" in c) return { not: rename(c.not) };
    const left = "hidden" in c.left && c.left.hidden === from ? { hidden: to } : c.left;
    const right = c.right && "hidden" in c.right && c.right.hidden === from ? { hidden: to } : c.right;
    return right ? { ...c, left, right } : { op: c.op, left };
  };
  const out = rewriteRecall(def, "hidden", from, to);
  if (out.logic) out.logic = out.logic.map((r) => ({ ...r, when: rename(r.when) }));
  return out;
}

/** Point calculated fields' formulas that read the answer `from` at `to`. */
function renameFormulaRefs(def: FormDefinition, from: string, to: string): FormDefinition {
  let changed = false;
  const blocks = def.blocks.map((b) => {
    if (b.kind !== "field" || b.type !== "calculated" || typeof b.props?.formula !== "string") return b;
    const formula = renameFormulaKey(b.props.formula, from, to);
    if (formula === b.props.formula) return b;
    changed = true;
    return { ...b, props: { ...b.props, formula } };
  });
  return changed ? { ...def, blocks } : def;
}

/**
 * Point `{{field:from}}` / `{{hidden:from}}` recall tokens at `to`, or, with `to`
 * null, replace them with their fallback text, so labels, descriptions, content,
 * endings and the introduction never recall something that no longer exists.
 */
function rewriteRecall(def: FormDefinition, kind: "field" | "hidden", from: string, to: string | null): FormDefinition {
  const token = new RegExp(`\\{\\{\\s*${kind}:${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\|([^}]*))?\\}\\}`, "g");
  const text = (s: string) =>
    s.replace(token, (_m, fallback: string | undefined) =>
      to === null ? (fallback ?? "").trim() : `{{${kind}:${to}${fallback !== undefined ? `|${fallback}` : ""}}}`,
    );
  const out: FormDefinition = {
    ...def,
    blocks: def.blocks.map((b) => {
      if (b.kind === "field") {
        const next = { ...b, label: text(b.label) };
        if (b.description) next.description = text(b.description);
        return next;
      }
      if (b.kind === "content") return { ...b, text: text(b.text) };
      return b;
    }),
  };
  if (def.description) out.description = text(def.description);
  if (def.endings) {
    out.endings = def.endings.map((e) => {
      const next = { ...e, title: text(e.title) };
      if (e.description) next.description = text(e.description);
      return next;
    });
  }
  return out;
}

// ── Form ─────────────────────────────────────────────────────────────────────

export function updateForm(
  def: FormDefinition,
  patch: { title?: string; description?: string; layout?: FormDefinition["layout"] },
): FormDefinition {
  const next = { ...def, ...patch };
  if (!next.description) delete next.description;
  return sameJson(next, def) ? def : next;
}

export function updateSettings(def: FormDefinition, patch: Partial<FormSettings>): FormDefinition {
  const settings: FormSettings = { ...def.settings };
  for (const [k, v] of Object.entries(patch) as [keyof FormSettings, boolean | undefined][]) {
    // Only non-default values are stored: anonymous and saveProgress default to false,
    // clearHiddenValues to true.
    if (k === "anonymous") v ? (settings.anonymous = true) : delete settings.anonymous;
    if (k === "saveProgress") v ? (settings.saveProgress = true) : delete settings.saveProgress;
    if (k === "clearHiddenValues") v === false ? (settings.clearHiddenValues = false) : delete settings.clearHiddenValues;
  }
  const out: FormDefinition = { ...def, settings };
  if (!Object.keys(settings).length) delete out.settings;
  return sameJson(out.settings, def.settings) ? def : out;
}

// ── Field outputs ────────────────────────────────────────────────────────────

export * from "./outputs";
