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
  choiceOptions,
  getFieldType,
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
export function newId(prefix: string): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8)}`;
}

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

/** `base`, or `base_2`, `base_3`… whichever is not in `taken`. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

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

/** Default props for a new field of a built-in type, so it is valid as soon as it is added. */
export function defaultProps(type: string): Record<string, Json> | undefined {
  switch (type) {
    case "rating":
      return { max: 5 };
    case "single-choice":
    case "multi-choice":
      return {
        options: [
          { value: "option_1", label: "Option 1" },
          { value: "option_2", label: "Option 2" },
        ],
      };
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

/** A new field block with a fresh id and a key unique in `def`. */
export function createField(def: FormDefinition, spec: NewField): FieldBlock {
  const label = spec.label ?? getFieldType(spec.type)?.label ?? "Question";
  const block: FieldBlock = {
    kind: "field",
    id: newId("q"),
    key: uniqueName(spec.key ?? slugKey(label), fieldKeys(def)),
    type: spec.type,
    label,
  };
  if (spec.required) block.required = true;
  const props = spec.props ?? defaultProps(spec.type);
  if (props) block.props = props;
  return block;
}

export function createContent(type: ContentBlock["type"], text = type === "heading" ? "Heading" : "Text"): ContentBlock {
  return { kind: "content", id: newId(type === "heading" ? "h" : "t"), type, text };
}

export function createPageBreak(title?: string): PageBreakBlock {
  return title ? { kind: "page-break", id: newId("page"), title } : { kind: "page-break", id: newId("page") };
}

/** Insert `block` at `index` (default: the end). */
export function insertBlock(def: FormDefinition, block: Block, index = def.blocks.length): FormDefinition {
  const blocks = [...def.blocks];
  blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
  return { ...def, blocks };
}

export type BlockPatch =
  | Partial<Omit<FieldBlock, "kind" | "id">>
  | Partial<Omit<ContentBlock, "kind" | "id">>
  | Partial<Omit<PageBreakBlock, "kind" | "id">>;

/**
 * Change a block. `undefined` in the patch removes that property, so an
 * optional flag goes away instead of being stored as `false` or `undefined`.
 * A key is made unique if it clashes; a changed field type gets that type's
 * default props and loses the rules that compare it, since their operators
 * and values belong to the old type.
 */
export function updateBlock(def: FormDefinition, id: string, patch: BlockPatch): FormDefinition {
  let typeChanged = false;
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
        typeChanged = true;
        if (!("props" in patch)) {
          const props = defaultProps(next.type);
          if (props) next.props = props;
          else delete next.props;
        }
      }
    }
    return next as unknown as Block;
  });
  let out: FormDefinition = { ...def, blocks };
  if (renamed) out = rewriteRecall(out, "field", renamed.from, renamed.to);
  return typeChanged ? removeRulesWhere(out, (rule) => conditionFields(rule.when).has(id)) : out;
}

/** Move a block to `toIndex` (clamped). Rules keep working: they point at ids. */
export function moveBlock(def: FormDefinition, id: string, toIndex: number): FormDefinition {
  const from = def.blocks.findIndex((b) => b.id === id);
  if (from === -1) return def;
  const blocks = [...def.blocks];
  const [block] = blocks.splice(from, 1);
  blocks.splice(Math.max(0, Math.min(toIndex, blocks.length)), 0, block!);
  return { ...def, blocks };
}

/** A copy right after the original, with a new id and key. Rules are not copied. */
export function duplicateBlock(def: FormDefinition, id: string): FormDefinition {
  const index = def.blocks.findIndex((b) => b.id === id);
  if (index === -1) return def;
  const original = def.blocks[index]!;
  let copy: Block;
  if (original.kind === "field") {
    copy = {
      ...structuredClone(original),
      id: newId("q"),
      key: uniqueName(`${original.key}_copy`, fieldKeys(def)),
      label: `${original.label} (copy)`,
    };
  } else if (original.kind === "content") {
    copy = { ...original, id: newId(original.type === "heading" ? "h" : "t") };
  } else copy = { ...original, id: newId("page") };
  return insertBlock(def, copy, index + 1);
}

/**
 * Remove a block, every rule that reads, targets or jumps from or to it, and its
 * recall tokens (they become their fallback text).
 */
export function removeBlock(def: FormDefinition, id: string): FormDefinition {
  const removed = def.blocks.find((b) => b.id === id);
  let out: FormDefinition = { ...def, blocks: def.blocks.filter((b) => b.id !== id) };
  if (removed?.kind === "field") out = rewriteRecall(out, "field", removed.key, null);
  return removeRulesWhere(out, (rule) => ruleRefs(rule).has(id));
}

// ── Choice options ───────────────────────────────────────────────────────────

/**
 * Set a choice field's options. Values are derived from labels for new
 * options and kept for existing ones (answers store values), and are made
 * unique. Rules comparing the field with a value that no longer exists are
 * removed.
 */
export function setOptions(
  def: FormDefinition,
  id: string,
  options: readonly { value?: string; label: string }[],
): FormDefinition {
  const field = def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === id);
  if (!field) return def;
  const taken: string[] = [];
  const next = options.map((o, i) => {
    const value = uniqueName(o.value || slugKey(o.label, `option_${i + 1}`), taken);
    taken.push(value);
    return { value, label: o.label };
  });
  const out = updateBlock(def, id, { props: { ...field.props, options: next } });
  const allowed = new Set(taken);
  return removeRulesWhere(out, (rule) => comparedValues(rule.when, id).some((v) => typeof v === "string" && !allowed.has(v)));
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

/** The literal values a condition compares field `id` with. */
function comparedValues(condition: Condition, id: string): Json[] {
  const out: Json[] = [];
  const visit = (c: Condition) => {
    if ("all" in c) return c.all.forEach(visit);
    if ("any" in c) return c.any.forEach(visit);
    if ("not" in c) return visit(c.not);
    if ("field" in c.left && c.left.field === id && c.right && "value" in c.right) {
      const v = c.right.value;
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    }
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
  return { ...def, logic: (def.logic ?? []).map((r) => (r.id === id ? { ...rule, id } : r)) };
}

export function removeRule(def: FormDefinition, id: string): FormDefinition {
  return removeRulesWhere(def, (r) => r.id === id);
}

export function moveRule(def: FormDefinition, id: string, toIndex: number): FormDefinition {
  const logic = [...(def.logic ?? [])];
  const from = logic.findIndex((r) => r.id === id);
  if (from === -1) return def;
  const [rule] = logic.splice(from, 1);
  logic.splice(Math.max(0, Math.min(toIndex, logic.length)), 0, rule!);
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
export function starterCondition(field: FieldBlock): Condition {
  const op = operatorsFor(field.type)[0] ?? "answered";
  if (UNARY_OPERATORS.has(op)) return { op, left: { field: field.id } };
  return { op, left: { field: field.id }, right: { value: starterValue(field, op) } };
}

export function starterValue(field: FieldBlock, op: Operator): Json {
  if (field.type === "yes-no") return true;
  if (field.type === "rating") return typeof field.props?.max === "number" ? Math.ceil(field.props.max / 2) : 3;
  if (field.type === "nps") return 9;
  const options = choiceOptions(field);
  if (options.length) return op === "in" ? [options[0]!.value] : options[0]!.value;
  return "";
}

// ── Endings ──────────────────────────────────────────────────────────────────

export function addEnding(def: FormDefinition, title = "Thanks!"): FormDefinition {
  const taken = (def.endings ?? []).map((e) => e.id);
  const ending: Ending = { id: uniqueName(slugKey(title, "ending"), taken), title };
  return { ...def, endings: [...(def.endings ?? []), ending] };
}

export function updateEnding(def: FormDefinition, id: string, patch: Partial<Omit<Ending, "id">>): FormDefinition {
  return {
    ...def,
    endings: (def.endings ?? []).map((e) => {
      if (e.id !== id) return e;
      const next = { ...e, ...patch };
      if (!next.description) delete next.description;
      return next;
    }),
  };
}

/** Remove an ending and the jumps that go to it. The first ending is the default and stays. */
export function removeEnding(def: FormDefinition, id: string): FormDefinition {
  const endings = def.endings ?? [];
  if (endings[0]?.id === id) return def;
  const out = { ...def, endings: endings.filter((e) => e.id !== id) };
  return removeRulesWhere(out, (r) => r.effect === "jump" && typeof r.to === "object" && r.to.ending === id);
}

// ── Hidden inputs ────────────────────────────────────────────────────────────

export function addHidden(def: FormDefinition, input: Partial<HiddenInput> = {}): FormDefinition {
  const name = uniqueName(slugKey(input.name ?? "input", "input"), (def.hidden ?? []).map((h) => h.name));
  const next: HiddenInput = { name, type: input.type ?? "string", source: input.source ?? "url" };
  if (input.sensitive) next.sensitive = true;
  return { ...def, hidden: [...(def.hidden ?? []), next] };
}

/**
 * Change a hidden input. Renaming it updates the conditions and the recall
 * placeholders (`{{hidden:name}}`) that use it.
 */
export function updateHidden(def: FormDefinition, name: string, patch: Partial<HiddenInput>): FormDefinition {
  const hidden = def.hidden ?? [];
  const current = hidden.find((h) => h.name === name);
  if (!current) return def;
  const others = hidden.filter((h) => h.name !== name).map((h) => h.name);
  const newName = patch.name !== undefined ? uniqueName(slugKey(patch.name, name), others) : name;
  const next: HiddenInput = { ...current, ...patch, name: newName };
  if (!next.sensitive) delete next.sensitive;
  let out: FormDefinition = { ...def, hidden: hidden.map((h) => (h.name === name ? next : h)) };
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

/**
 * Point `{{field:from}}` / `{{hidden:from}}` recall tokens at `to`, or, with `to`
 * null, replace them with their fallback text, so labels, descriptions and content
 * never recall something that no longer exists.
 */
function rewriteRecall(def: FormDefinition, kind: "field" | "hidden", from: string, to: string | null): FormDefinition {
  const token = new RegExp(`\\{\\{\\s*${kind}:${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\|([^}]*))?\\}\\}`, "g");
  const text = (s: string) =>
    s.replace(token, (_m, fallback: string | undefined) =>
      to === null ? (fallback ?? "").trim() : `{{${kind}:${to}${fallback !== undefined ? `|${fallback}` : ""}}}`,
    );
  return {
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
}

// ── Form ─────────────────────────────────────────────────────────────────────

export function updateForm(
  def: FormDefinition,
  patch: { title?: string; description?: string; layout?: FormDefinition["layout"] },
): FormDefinition {
  const next = { ...def, ...patch };
  if (!next.description) delete next.description;
  return next;
}

export function updateSettings(def: FormDefinition, patch: Partial<FormSettings>): FormDefinition {
  const settings: FormSettings = { ...def.settings };
  for (const [k, v] of Object.entries(patch) as [keyof FormSettings, boolean | undefined][]) {
    // Only non-default values are stored: anonymous defaults to false, clearHiddenValues to true.
    if (k === "anonymous") v ? (settings.anonymous = true) : delete settings.anonymous;
    if (k === "clearHiddenValues") v === false ? (settings.clearHiddenValues = false) : delete settings.clearHiddenValues;
  }
  const out: FormDefinition = { ...def, settings };
  if (!Object.keys(settings).length) delete out.settings;
  return out;
}
