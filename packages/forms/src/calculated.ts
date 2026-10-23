import type { FieldTypeManifest } from "./fields";
import { evaluateFormula, formulaNumber, parseFormula, type FormulaNode, type FormulaRef, type FormulaValue } from "./formula";
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
  const { format, decimals } = calculatedProps(field);
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

/** The value a formula reads for an answer: numbers and text as they are, a list's items, one table column's cells. */
export function formulaInput(value: Json | undefined, column?: string): FormulaValue {
  if (value === undefined || value === null) return null;
  if (column !== undefined) {
    if (!Array.isArray(value)) return null;
    return value.flatMap((row): FormulaValue[] => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      const cell = row[column];
      return typeof cell === "string" || typeof cell === "number" ? [cell] : [];
    });
  }
  if (Array.isArray(value)) {
    return value.flatMap((v): FormulaValue[] => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? [v] : []));
  }
  return typeof value === "object" ? null : value;
}

interface Compiled {
  field: FieldBlock;
  ast: FormulaNode | null;
}

/**
 * Works out a form's calculated fields from its answers. `withCalculated`
 * returns `values` itself when nothing changed. Each formula reads the
 * answers on `path` only (an answer logic hides reads as blank) and the
 * calculated fields before it, in form order.
 */
export function calculator(definition: FormDefinition) {
  const compiled: Compiled[] = [];
  const idByKey = new Map<string, string>();
  for (const block of definition.blocks) {
    if (block.kind !== "field") continue;
    idByKey.set(block.key, block.id);
    if (!isCalculated(block)) continue;
    const parsed = parseFormula(calculatedProps(block).formula);
    compiled.push({ field: block, ast: parsed.ok ? parsed.ast : null });
  }
  const withCalculated = (values: Record<string, Json | undefined>, path: readonly string[]) => {
    if (!compiled.length) return values;
    const visible = new Set(path);
    let next = values;
    for (const { field, ast } of compiled) {
      const read = (ref: FormulaRef): FormulaValue => {
        const id = idByKey.get(ref.key);
        if (id === undefined || !visible.has(id) || !Object.prototype.hasOwnProperty.call(next, id)) return null;
        return formulaInput(next[id], ref.column);
      };
      const value = ast ? calculatedValue(evaluateFormula(ast, read), field) : undefined;
      const current = Object.prototype.hasOwnProperty.call(next, field.id) ? next[field.id] : undefined;
      if (current !== value) next = { ...next, [field.id]: value };
    }
    return next;
  };
  return { active: compiled.length > 0, withCalculated };
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
