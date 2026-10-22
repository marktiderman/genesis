/**
 * One response as a flat row: the shape the sheet appends, the email lists
 * and the webhook sends alongside the raw answers.
 */
import { getFieldType, isEmptyValue, isSensitive, summarizeValue } from "../fields";
import { own, withheld } from "../logic";
import { recall } from "../recall";
import type { FieldBlock, FormDefinition, Json } from "../types";
import type { Cell, DeliverySubmission } from "./types";

export interface RowOptions {
  /**
   * Fields marked `sensitive`: `"include"` their values (default), `"mask"`
   * them as `[sensitive]`, or `"omit"` their columns.
   */
  sensitive?: "include" | "mask" | "omit" | undefined;
}

export interface ResponseRow {
  /** Cells by column key. */
  row: Record<string, Cell>;
  /** The column keys in order: `id`, `submitted_at`, the meta keys, then one per field key. */
  columns: string[];
  /** Field labels by key, recall filled in from this submission. */
  labels: Record<string, string>;
}

export const SENSITIVE_MASK = "[sensitive]";

// Never used as column keys, so a hostile meta key cannot touch a prototype.
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

/**
 * One answer as a cell: numbers stay numbers (ratings, NPS), choices show
 * their labels, a list is joined with ", ", yes/no reads "Yes"/"No", and a
 * plugin type's `summarize` is used where it has one.
 */
export function answerCell(field: FieldBlock, value: Json | undefined): Cell {
  if (value === undefined || isEmptyValue(value, field)) return "";
  if (typeof value === "number") return value;
  const manifest = getFieldType(field.type);
  if (manifest?.summarize) return summarizeValue(value, field);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value) && value.every((v) => typeof v !== "object" || v === null)) {
    return value.map((v) => String(v)).join(", ");
  }
  return JSON.stringify(value);
}

/**
 * The row for one submission. Columns: `id` (the response id), then
 * `submitted_at` when given, then the app's `meta` columns in order, then
 * one per field key in form order (blank when unanswered or hidden by
 * logic). Content blocks get no column. On an anonymous form, identifying
 * fields get no column at all, whatever the answers hold.
 */
export function responseRow(
  submission: DeliverySubmission,
  definition: FormDefinition,
  options: RowOptions = {},
): ResponseRow {
  const row: Record<string, Cell> = {};
  const columns: string[] = [];
  const set = (key: string, value: Cell) => {
    if (RESERVED.has(key)) return;
    if (!Object.prototype.hasOwnProperty.call(row, key)) columns.push(key);
    row[key] = value;
  };
  set("id", submission.id);
  if (submission.submittedAt !== undefined) set("submitted_at", submission.submittedAt);
  for (const [key, value] of Object.entries(submission.meta ?? {})) {
    if (key !== "id" && key !== "submitted_at") set(key, value);
  }

  const fields = definition.blocks.filter((b): b is FieldBlock => b.kind === "field");
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  const sensitive = options.sensitive ?? "include";
  // Recall in a label must not leak what the row itself withholds or masks.
  const values: Record<string, Json> = {};
  for (const field of fields) {
    const value = own(submission.answers, field.id);
    if (value === undefined || withheld(definition, field)) continue;
    if (isSensitive(field) && sensitive !== "include") continue;
    values[field.id] = value;
  }
  const scope = { fieldsByKey, values, hidden: visibleInputs(submission, definition, sensitive) };
  const labels: Record<string, string> = {};
  for (const field of fields) {
    if (withheld(definition, field)) continue;
    if (isSensitive(field) && sensitive === "omit") continue;
    if (RESERVED.has(field.key)) continue;
    labels[field.key] = recall(field.label, scope).trim() || field.key;
    const cell = answerCell(field, own(submission.answers, field.id));
    set(field.key, isSensitive(field) && sensitive === "mask" && cell !== "" ? SENSITIVE_MASK : cell);
  }
  return { row, columns, labels };
}

/**
 * Hidden and server inputs as recall and the webhook may show them: on an
 * anonymous form identifying ones are left out, and sensitive ones are left
 * out unless `sensitive` is `"include"`.
 */
export function visibleInputs(
  submission: DeliverySubmission,
  definition: FormDefinition,
  sensitive: RowOptions["sensitive"] = "include",
): Record<string, Json> {
  const declared = new Map((definition.hidden ?? []).map((h) => [h.name, h]));
  const out: Record<string, Json> = {};
  for (const [name, value] of Object.entries({ ...submission.hidden, ...submission.context })) {
    const input = declared.get(name);
    if (RESERVED.has(name)) continue;
    if (input?.identifying && definition.settings?.anonymous === true) continue;
    if (input?.sensitive && sensitive !== "include") continue;
    out[name] = value;
  }
  return out;
}

/**
 * A cell that a spreadsheet will never run as a formula when the text is
 * opened elsewhere (a CSV export opened in Excel). Text starting with `=`,
 * `@`, a tab or a carriage return gets a leading `'`, as OWASP recommends;
 * so does text starting with `+` or `-` unless it is only digits and
 * number punctuation (a phone number such as `+1 (555) 010-0000`, `-2.5`),
 * which cannot call a function or name a cell. Numbers and booleans are
 * returned as they are.
 */
export function escapeFormula(cell: Cell): Cell {
  if (typeof cell !== "string" || cell === "") return cell;
  const first = cell[0]!;
  if (first === "=" || first === "@" || first === "\t" || first === "\r") return `'${cell}`;
  if ((first === "+" || first === "-") && !/^[+-][\d\s().,+-]*$/.test(cell)) return `'${cell}`;
  return cell;
}
