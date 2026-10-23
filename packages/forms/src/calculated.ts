import type { FieldTypeManifest } from "./fields";
import { evaluateFormula, formulaNumber, ownFormulaList, parseFormula, type FormulaNode, type FormulaRef, type FormulaValue } from "./formula";
import type { FieldBlock, FormDefinition, Json, Operator } from "./types";

/** The calculated field type's registry key. */
export const CALCULATED_TYPE = "calculated";

/**
 * Field types the builder offers only to a host that names them in its
 * palette, like `STRUCTURED_FIELD_TYPES`: `calculated` shows a value worked
 * out from other answers, so it is opt-in for hosts that want formulas.
 */
export const COMPUTED_FIELD_TYPES = [CALCULATED_TYPE] as const;

export type CalculatedFormat = "number" | "percent" | "text";
/** Longest the formulas of one form may be, all together (`parseForm` checks it). */
export const MAX_FORM_FORMULA_LENGTH = 20_000;
/** Most decimal places a calculated value may keep. */
export const MAX_CALCULATED_DECIMALS = 10;

export interface CalculatedProps {
  formula: string;
  format?: CalculatedFormat | undefined;
  decimals?: number | undefined;
}

/** A calculated field's settings, with anything malformed left out. */
export function calculatedProps(field: FieldBlock): CalculatedProps {
  const p = field.props ?? {};
  const out: CalculatedProps = { formula: typeof p.formula === "string" ? p.formula : "" };
  if (p.format === "number" || p.format === "percent" || p.format === "text") out.format = p.format;
  if (typeof p.decimals === "number" && Number.isInteger(p.decimals) && p.decimals >= 0 && p.decimals <= MAX_CALCULATED_DECIMALS) {
    out.decimals = p.decimals;
  }
  return out;
}

export const isCalculated = (field: FieldBlock | undefined): boolean => field?.type === CALCULATED_TYPE;

const round = (n: number, decimals: number | undefined) => {
  if (decimals === undefined) return n;
  const r = Number(n.toFixed(decimals));
  return Object.is(r, -0) ? 0 : r;
};

/**
 * What a formula's result is stored as. `number` and `percent` keep a number
 * (`0.25` for 25%), rounded to `decimals`; `text` keeps text. Without a
 * format, numbers, text and true / false are kept as they are. A list, and
 * anything the format can't hold, is no value (`undefined`).
 */
export function calculatedValue(result: FormulaValue, field: FieldBlock): Json | undefined {
  return valueAs(result, calculatedProps(field));
}

function valueAs(result: FormulaValue, { format, decimals }: CalculatedProps): Json | undefined {
  if (result === null || Array.isArray(result)) return undefined;
  if (format === "number" || format === "percent") {
    const n = formulaNumber(result);
    return n === null ? undefined : round(n, decimals);
  }
  if (format === "text") {
    if (typeof result === "number") return decimals === undefined ? String(result) : result.toFixed(decimals);
    return typeof result === "boolean" ? (result ? "Yes" : "No") : result;
  }
  return typeof result === "number" ? round(result, decimals) : result;
}

/** A calculated value as shown: `12.5`, `25%`, the text, Yes / No. Empty when there is none. */
export function formatCalculated(value: Json | undefined, field: FieldBlock): string {
  if (value === undefined || value === null) return "";
  const { format, decimals } = calculatedProps(field);
  const fixed = (n: number) => (decimals === undefined ? String(Number(n.toFixed(6))) : n.toFixed(decimals));
  if (typeof value === "number") return format === "percent" ? `${fixed(value * 100)}%` : fixed(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" ? value : "";
}

/**
 * Most items a formula reads from one answer (a list's items, a table's
 * rows). A longer answer reads as blank, so one oversized value sent to the
 * server can't make every formula over it slow.
 */
export const MAX_FORMULA_ITEMS = 10_000;

/**
 * Most list items and table rows all of a form's formulas read in one go
 * (each list or table counted once, however many of its columns are read, in form order). A formula that reads
 * an answer past the limit, or one over `MAX_FORMULA_ITEMS`, has no value
 * (blank, never a partial total), so many big answers can't make working
 * the values out slow either.
 */
export const MAX_SETTLE_ITEMS = 50_000;

const extract = (value: readonly Json[], column: string | undefined): FormulaValue[] =>
  column !== undefined
      ? value.flatMap((row): FormulaValue[] => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return [];
          const cell = row[column];
          return typeof cell === "string" || typeof cell === "number" ? [cell] : [];
        })
      : value.flatMap((v): FormulaValue[] => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? [v] : []));


/**
 * The value a formula reads for an answer: numbers and text as they are, a
 * list's items, one table column's cells. A list or table of more than
 * `MAX_FORMULA_ITEMS` reads as blank. Each call builds a new list.
 */
export function formulaInput(value: Json | undefined, column?: string): FormulaValue {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length > MAX_FORMULA_ITEMS) return null;
  if (column !== undefined) {
    if (!Array.isArray(value)) return null;
    return extract(value, column);
  }
  if (Array.isArray(value)) return extract(value, undefined);
  return typeof value === "object" ? null : value;
}

interface Compiled {
  field: FieldBlock;
  /** `formulaSize` of `ast`. */
  size: number;
  props: CalculatedProps;
  ast: FormulaNode | null;
  /** The answers it reads, each (answer, column) once (`id` is `undefined` for a key that is not a field). */
  reads: Read[];
  /** Each `ref` node of the formula, to its index in `reads`. */
  slots: Map<FormulaNode, number>;
  /** The inputs of the last evaluation and its result, reused while they are the same values. */
  last: { inputs: unknown[]; value: Json | undefined } | null;
}

interface Read {
  id: string | undefined;
  column: string | undefined;
  /** `id` and `column` as one key, to read each once per formula. */
  key: string;
}

function refNodes(node: FormulaNode, out: Extract<FormulaNode, { kind: "ref" }>[] = []) {
  if (node.kind === "ref") out.push(node);
  else if (node.kind === "unary") refNodes(node.arg, out);
  else if (node.kind === "binary") (refNodes(node.left, out), refNodes(node.right, out));
  else if (node.kind === "if") (refNodes(node.test, out), refNodes(node.then, out), refNodes(node.else, out));
  else if (node.kind === "call") for (const a of node.args) refNodes(a, out);
  return out;
}

/** How many parts (numbers, answers, operators, calls) a formula has: what working it out once costs. */
function formulaSize(node: FormulaNode): number {
  if (node.kind === "unary") return 1 + formulaSize(node.arg);
  if (node.kind === "binary") return 1 + formulaSize(node.left) + formulaSize(node.right);
  if (node.kind === "if") return 1 + formulaSize(node.test) + formulaSize(node.then) + formulaSize(node.else);
  if (node.kind === "call") return node.args.reduce((n, a) => n + formulaSize(a), 1);
  return 1;
}

/**
 * Work an engine may spend while replaying (see `MAX_REPLAY_WORK` in
 * `server.ts`): `spend` throws `ReplayWorkExceeded` once `used` passes `max`.
 */
export interface WorkBudget {
  used: number;
  max: number;
}

export class ReplayWorkExceeded extends Error {
  constructor(readonly limit: number) {
    super(`Replaying the response would take more than ${limit} steps of work.`);
  }
}

export function spend(budget: WorkBudget | undefined, amount: number): void {
  if (!budget) return;
  budget.used += amount;
  if (budget.used > budget.max) throw new ReplayWorkExceeded(budget.max);
}

/** Stands for an answer that is off the path or unanswered. */
const UNREAD = Symbol("unread");
/** Stands for an answer too big to read: over `MAX_FORMULA_ITEMS`, or past `MAX_SETTLE_ITEMS`. */
const OVER = Symbol("over");

/**
 * Works out a form's calculated fields from its answers. `withCalculated`
 * returns `values` itself when nothing changed. Each formula reads the
 * answers on `path` only (an answer logic hides reads as blank) and the
 * calculated fields before it, in form order.
 */
export function calculator(definition: FormDefinition, work?: WorkBudget) {
  // Work: 1 for each formula looked at in a settle, plus its size each time
  // it is worked out. Past the budget, `withCalculated` throws.
  const compiled: Compiled[] = [];
  const idByKey = new Map<string, string>();
  for (const block of definition.blocks) {
    if (block.kind !== "field") continue;
    idByKey.set(block.key, block.id);
  }
  for (const block of definition.blocks) {
    if (block.kind !== "field" || !isCalculated(block)) continue;
    const props = calculatedProps(block);
    const parsed = parseFormula(props.formula);
    const reads: Read[] = [];
    const slots = new Map<FormulaNode, number>();
    const byKey = new Map<string, number>();
    for (const ref of parsed.ok ? refNodes(parsed.ast) : []) {
      const id = idByKey.get(ref.key);
      const key = `${id ?? ""}\u0000${ref.column ?? ""}`;
      let slot = byKey.get(key);
      if (slot === undefined) {
        slot = reads.push({ id, column: ref.column, key }) - 1;
        byKey.set(key, slot);
      }
      slots.set(ref, slot);
    }
    compiled.push({ field: block, props, ast: parsed.ok ? parsed.ast : null, size: parsed.ok ? formulaSize(parsed.ast) : 0, reads, slots, last: null });
  }
  /**
   * This calculator's lists, by the answer's array and then the column (`""`
   * for a list's own items), so an unchanged table is walked once. Each
   * engine (and so each `validateSubmission` call) has its own, so a host
   * array changed between two calls is read afresh. Within one engine an
   * answer is not changed in place: the engine never changes a value it
   * holds, and `setValue` with an array it already holds calls `forget`.
   */
  const extracted = new WeakMap<readonly Json[], Map<string, readonly FormulaValue[]>>();
  const cachedList = (value: readonly Json[], column: string | undefined): readonly FormulaValue[] => {
    let byColumn = extracted.get(value);
    if (!byColumn) extracted.set(value, (byColumn = new Map()));
    const key = column ?? "";
    let list = byColumn.get(key);
    if (!list) byColumn.set(key, (list = ownFormulaList(extract(value, column))));
    return list;
  };
  const readAnswer = (value: Json | undefined, column: string | undefined): FormulaValue => {
    if (Array.isArray(value)) return cachedList(value, column) as FormulaValue[];
    return column !== undefined ? null : formulaInput(value);
  };
  /** Drop what was worked out from `value`: it may have been changed in place. */
  const forget = (value: Json | undefined) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) extracted.delete(value);
    for (const entry of compiled) if (entry.last?.inputs.includes(value)) entry.last = null;
  };

  const withCalculated = (values: Record<string, Json | undefined>, path: readonly string[]) => {
    if (!compiled.length) return values;
    const visible = new Set(path);
    let next = values;
    // `values` is copied once, on the first change, then written into.
    let copied = false;
    // The items every formula may read, together: each list answer and table
    // counts its items or rows once (however many of its columns are read),
    // in form order, and one past the limit reads as blank. It depends on the
    // answers only, so a client and the server agree.
    let budget = MAX_SETTLE_ITEMS;
    const within = new Map<string, boolean>();
    const input = ({ id }: Read): unknown => {
      if (id === undefined || !visible.has(id) || !Object.prototype.hasOwnProperty.call(next, id)) return UNREAD;
      const value = next[id];
      if (!Array.isArray(value)) return value;
      let ok = within.get(id);
      if (ok === undefined) {
        // An answer over the per-answer limit is never read, so it uses none of the allowance.
        ok = value.length <= MAX_FORMULA_ITEMS && value.length <= budget;
        if (ok) budget -= value.length;
        within.set(id, ok);
      }
      return ok ? value : OVER;
    };
    for (const entry of compiled) {
      const { field, ast } = entry;
      // A formula is worked out again only when an answer it reads is a different value:
      // an engine settles on every answer, and most answers are to other questions.
      const { reads } = entry;
      spend(work, 1);
      const inputs: unknown[] = new Array(reads.length);
      let over = false;
      let same = entry.last !== null;
      for (let i = 0; i < reads.length; i++) {
        const v = input(reads[i]!);
        inputs[i] = v;
        if (v === OVER) over = true;
        if (same && entry.last!.inputs[i] !== v) same = false;
      }
      let value: Json | undefined;
      if (same) {
        value = entry.last!.value;
      } else {
        spend(work, entry.size);
        const resolved: (FormulaValue | undefined)[] = new Array(inputs.length);
        const read = (ref: FormulaRef): FormulaValue => {
          const slot = entry.slots.get(ref as FormulaNode);
          if (slot === undefined) return null;
          let v = resolved[slot];
          if (v === undefined) {
            const raw = inputs[slot];
            v = resolved[slot] = raw === UNREAD ? null : readAnswer(raw as Json | undefined, reads[slot]!.column);
          }
          return v;
        };
        // An answer too big to read leaves the value blank rather than a partial total.
        value = ast && !over ? valueAs(evaluateFormula(ast, read), entry.props) : undefined;
        entry.last = { inputs, value };
      }
      const current = Object.prototype.hasOwnProperty.call(next, field.id) ? next[field.id] : undefined;
      if (current !== value) {
        if (!copied) {
          next = { ...next };
          copied = true;
        }
        next[field.id] = value;
      }
    }
    return next;
  };
  return { active: compiled.length > 0, ids: new Set(compiled.map((c) => c.field.id)), withCalculated, forget };
}

const numberOps: Operator[] = ["eq", "neq", "lt", "lte", "gt", "gte", "in", "answered", "empty"];

export const calculatedFieldType: FieldTypeManifest = {
  type: CALCULATED_TYPE,
  label: "Calculated",
  category: "advanced",
  value: { json: true },
  operators: numberOps,
  a11y: { semantics: "control" },
  // The engine works the value out; any number, text or true / false it made is valid.
  validate: (value) => (typeof value === "number" || typeof value === "string" || typeof value === "boolean" ? null : "This value is worked out from other answers."),
  summarize: (value, field) => formatCalculated(value, field),
};
