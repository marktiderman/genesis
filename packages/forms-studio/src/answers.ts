// Turning genesis-forms answers into plain cells and columns. Shared by everything that
// shows or exports answers: a Sheet or email delivery, a responses table, a CSV. Pure: no
// storage, no React. Moved up from Breakthrough's src/lib/forms/answers.ts.
import {
  summarizeValue,
  type FieldBlock,
  type FormDefinition,
  type Json,
} from "@marktiderman/genesis-forms";

export type Cell = string | number | boolean;

/**
 * Answers given to one version of a form, as answers to another (by field id), matched
 * by field key: what an edit link prefills when the form has a newer version. Answers
 * to fields the other version doesn't have are dropped; `extra` (by key) fills fields
 * the stored answers leave out, such as contact details kept apart.
 */
export function carryAnswers(
  from: FormDefinition,
  to: FormDefinition,
  answers: Record<string, Json>,
  extra: Record<string, Json | null | undefined> = {},
): Record<string, Json> {
  const byKey = new Map<string, Json>();
  for (const block of from.blocks) {
    if (block.kind === "field" && answers[block.id] !== undefined)
      byKey.set(block.key, answers[block.id]!);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined && !byKey.has(key)) byKey.set(key, value);
  }
  const out: Record<string, Json> = {};
  for (const block of to.blocks) {
    if (block.kind === "field" && byKey.has(block.key)) out[block.id] = byKey.get(block.key)!;
  }
  return out;
}

/** One answer as a cell: option labels for choices, Yes/No, lists joined with commas. */
export function answerCell(field: FieldBlock, value: Json | undefined): Cell {
  if (value === undefined || value === null) return "";
  if (field.type === "yes-no")
    return value === true ? "Yes" : value === false ? "No" : String(value);
  if (field.type === "consent")
    return value === true ? "Agreed" : value === false ? "Didn't agree" : String(value);
  const options = Array.isArray(field.props?.["options"])
    ? (field.props["options"] as { value: string; label?: string }[])
    : [];
  const label = (v: Json) => options.find((o) => o.value === v)?.label ?? String(v);
  // Structured values (a worksheet's rows, notes or highlights) use each type's own summary
  // from genesis-forms. Flat values keep raw numbers, so a Sheet can sort and average them.
  const structured = Array.isArray(value)
    ? value.some((v) => v !== null && typeof v === "object")
    : typeof value === "object";
  if (structured) {
    // A type genesis-forms doesn't know (yet) summarizes as "[object Object]": fall back to JSON.
    const summary = summarizeValue(value, field);
    return summary && !summary.includes("[object Object]") ? summary : JSON.stringify(value);
  }
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (options.length) return label(value);
  return typeof value === "number" || typeof value === "boolean" ? value : String(value);
}

/** A label with recall tokens replaced by their fallback. */
export const plainLabel = (label: string) =>
  label.replace(/\{\{[^}|]*\|?([^}]*)\}\}/g, (_, fallback: string) => fallback || "…");

export interface AnswerColumn {
  /** The field's key: stable across versions, so one column covers every version's answers. */
  key: string;
  label: string;
}

/**
 * One column per field key across the given definitions, in the order the newest
 * definition asks them, then keys only older versions had (in their order). Labels come
 * from the newest definition that has the key.
 */
export function answerColumns(
  definitions: readonly FormDefinition[],
  skip: ReadonlySet<string> = new Set(),
): AnswerColumn[] {
  const columns: AnswerColumn[] = [];
  const seen = new Set<string>();
  for (const definition of definitions) {
    for (const block of definition.blocks) {
      if (block.kind !== "field" || seen.has(block.key) || skip.has(block.key)) continue;
      seen.add(block.key);
      columns.push({ key: block.key, label: plainLabel(block.label) });
    }
  }
  return columns;
}

/** A response's answers by field key, as cells (answers are stored by field id). */
export function answersByKey(
  definition: FormDefinition,
  answers: Record<string, Json>,
): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  for (const block of definition.blocks) {
    if (block.kind !== "field") continue;
    const value = answers[block.id];
    if (value !== undefined) cells[block.key] = answerCell(block, value);
  }
  return cells;
}

/** A response's raw answers by field key, with the field each was given to (answers are stored by field id). */
export function valuesByKey(
  definition: FormDefinition,
  answers: Record<string, Json>,
): Map<string, { field: FieldBlock; value: Json }> {
  const values = new Map<string, { field: FieldBlock; value: Json }>();
  for (const block of definition.blocks) {
    if (block.kind !== "field") continue;
    const value = answers[block.id];
    if (value !== undefined && value !== null) values.set(block.key, { field: block, value });
  }
  return values;
}

/**
 * CSV text (RFC 4180, CRLF) with a header row; every cell is quoted when it needs to be.
 * Text that a spreadsheet would run as a formula (starting with = + - @, tab or CR) gets a
 * leading apostrophe, so a respondent's answer can't run in Excel when staff open the
 * download. Numbers stay as they are. (Sheets delivery writes RAW values and needs none.)
 */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const quote = (v: Cell) => {
    const raw = String(v);
    const s = typeof v === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}
