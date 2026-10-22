import type { FieldTypeManifest } from "./fields";
import type { FieldBlock, Json } from "./types";

type JsonObject = { [key: string]: Json };
const isObject = (v: unknown): v is JsonObject => !!v && typeof v === "object" && !Array.isArray(v);
function intProp(field: FieldBlock, name: string, fallback: number, floor = 1): number {
  const v = field.props?.[name];
  return typeof v === "number" && Number.isInteger(v) && v >= floor ? v : fallback;
}
function optionalIntProp(field: FieldBlock, name: string, floor = 0): number | undefined {
  const v = field.props?.[name];
  return typeof v === "number" && Number.isInteger(v) && v >= floor ? v : undefined;
}
const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";
/**
 * Unanswered: nothing, or a list whose every entry is a blank one. Anything
 * else (a string, a list with a malformed entry) is an answer, so validation
 * rejects it instead of dropping it silently.
 */
const blankText = (v: unknown) => typeof v === "string" && v.trim() === "";
const emptyList = (value: Json | undefined, isBlank: (entry: Json) => boolean) =>
  value === undefined || value === null || (Array.isArray(value) && value.every(isBlank));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function listLimits(field: FieldBlock) {
  return { min: optionalIntProp(field, "min") ?? 0, max: intProp(field, "max", 10), itemMaxLength: intProp(field, "itemMaxLength", 500) };
}
const listItems = (value: Json | undefined): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];

export interface RowsColumn { key: string; label: string; long?: boolean }
export const MAX_ROWS_COLUMNS = 6;
export const MAX_ROWS_CELL_LENGTH = 2000;
export function rowsColumns(field: FieldBlock): RowsColumn[] {
  const raw = field.props?.columns;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RowsColumn[] = [];
  for (const c of raw) {
    if (!isObject(c) || typeof c.key !== "string" || !c.key || seen.has(c.key)) continue;
    seen.add(c.key);
    const column: RowsColumn = { key: c.key, label: typeof c.label === "string" ? c.label : c.key };
    if (c.long === true) column.long = true;
    out.push(column);
  }
  return out;
}
export function rowsLimits(field: FieldBlock) {
  return { minRows: optionalIntProp(field, "minRows") ?? 0, maxRows: intProp(field, "maxRows", 3) };
}
const filledRows = (value: Json | undefined): JsonObject[] =>
  Array.isArray(value) ? value.filter((r): r is JsonObject => isObject(r) && Object.values(r).some((c) => !blank(c))) : [];

export interface TimestampNote { at: number; text: string }
export const MAX_TIMESTAMP_SECONDS = 86400;
export function formatTimestamp(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
export function parseTimestamp(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length > 3) return null;
  if (parts.length === 1) {
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return n <= MAX_TIMESTAMP_SECONDS ? n : null;
  }
  const last = parts.length - 1;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const ok = i === 0 ? /^\d+$/.test(p) : i === last ? /^\d{2}(\.\d+)?$/.test(p) : /^\d{2}$/.test(p);
    if (!ok) return null;
    const n = Number(p);
    if (i > 0 && n >= 60) return null;
    total = total * 60 + n;
  }
  return total <= MAX_TIMESTAMP_SECONDS ? total : null;
}
const isTimestamp = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_TIMESTAMP_SECONDS;
const notesWithText = (value: Json | undefined): JsonObject[] =>
  Array.isArray(value) ? value.filter((n): n is JsonObject => isObject(n) && !blank(n.text)) : [];

export interface Highlight { start: number; end: number; quote: string; note: string }
export const MAX_HIGHLIGHT_NOTE_LENGTH = 1000;
export const HIGHLIGHT_NOTE_MESSAGE = "Add a note to each highlight.";
const subjectText = (field: FieldBlock) => (typeof field.props?.text === "string" && field.props.text ? field.props.text : undefined);

/**
 * The worksheet field types. They're registered like any other, but the builder
 * offers them only to a host that names them in its palette (`FormBuilder palette`),
 * so forms that never had them don't change.
 */
export const WORKSHEET_FIELD_TYPES = ["list", "rows", "timestamp-notes", "highlights"] as const;

export const worksheetFieldTypes: FieldTypeManifest[] = [
  {
    type: "list", label: "List", category: "text", value: { json: true },
    // logic.ts `contains` on an array is exact item equality, same as multi-choice, so it is offered.
    operators: ["contains", "answered", "empty"], a11y: { semantics: "group" },
    isEmpty: (value) => emptyList(value, blankText),
    validate: (value, field) => {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return "Enter a list of answers.";
      const { min, max, itemMaxLength } = listLimits(field);
      if (value.some((v) => (v as string).trim().length > itemMaxLength)) return `Keep each item under ${itemMaxLength} characters.`;
      const count = listItems(value).length;
      if (count < min) return `Add at least ${plural(min, "item")}.`;
      if (count > max) return `Add at most ${plural(max, "item")}.`;
      return null;
    },
    normalize: (value) => (Array.isArray(value) ? listItems(value).map((v) => v.trim()) : value),
    summarize: (value) => listItems(value).map((v) => v.trim()).join("; "),
    samples: (field) => {
      const { min, max } = listLimits(field);
      return [Array.from({ length: Math.min(Math.max(1, min), max) }, (_, i) => `Item ${i + 1}`)];
    },
  },
  {
    type: "rows", label: "Rows", category: "advanced", value: { json: true },
    operators: ["answered", "empty"], a11y: { semantics: "group" },
    isEmpty: (value) => emptyList(value, (r) => isObject(r) && Object.values(r).every(blankText)),
    validate: (value, field) => {
      const columns = rowsColumns(field);
      if (!columns.length) return "This question has no columns.";
      if (!Array.isArray(value) || !value.every(isObject)) return "Fill in the rows.";
      const keys = new Set(columns.map((c) => c.key));
      for (const row of value as JsonObject[]) {
        for (const [key, cell] of Object.entries(row)) {
          if (!keys.has(key)) return "An answer names a column this question doesn't have.";
          if (typeof cell !== "string") return "Fill in the rows with text.";
          if (cell.trim().length > MAX_ROWS_CELL_LENGTH) return `Keep each answer under ${MAX_ROWS_CELL_LENGTH} characters.`;
        }
      }
      const { minRows, maxRows } = rowsLimits(field);
      const count = filledRows(value).length;
      if (count < minRows) return `Fill in at least ${plural(minRows, "row")}.`;
      if (count > maxRows) return `Fill in at most ${plural(maxRows, "row")}.`;
      return null;
    },
    normalize: (value) => Array.isArray(value)
      ? filledRows(value).map((row) => {
          const out: JsonObject = {};
          for (const [key, cell] of Object.entries(row)) if (typeof cell === "string") out[key] = cell.trim();
          return out;
        })
      : value,
    summarize: (value, field) => {
      const columns = rowsColumns(field);
      return filledRows(value)
        .map((row) => columns.filter((c) => !blank(row[c.key])).map((c) => `${c.label}: ${(row[c.key] as string).trim()}`).join(" · "))
        .join(" / ");
    },
    samples: (field) => {
      const columns = rowsColumns(field);
      if (!columns.length) return [];
      const { minRows, maxRows } = rowsLimits(field);
      const row = Object.fromEntries(columns.map((c) => [c.key, "sample"]));
      return [Array.from({ length: Math.min(Math.max(1, minRows), maxRows) }, () => ({ ...row }))];
    },
  },
  {
    type: "timestamp-notes", label: "Notes at moments", category: "media", value: { json: true },
    operators: ["answered", "empty"], a11y: { semantics: "group" },
    isEmpty: (value) => emptyList(value, (n) => isObject(n) && blankText(n.text)),
    validate: (value, field) => {
      if (!Array.isArray(value)) return "Add notes.";
      const textMaxLength = intProp(field, "textMaxLength", 1000);
      for (const note of value) {
        if (!isObject(note) || typeof note.text !== "string") return "Add notes.";
        if (!isTimestamp(note.at)) return "Each note needs a time in the video.";
        if (note.text.trim().length > textMaxLength) return `Keep each note under ${textMaxLength} characters.`;
      }
      const maxNotes = intProp(field, "maxNotes", 20);
      return notesWithText(value).length > maxNotes ? `Add at most ${plural(maxNotes, "note")}.` : null;
    },
    normalize: (value) => Array.isArray(value)
      ? notesWithText(value).map((n) => ({ at: n.at as number, text: (n.text as string).trim() })).sort((a, b) => a.at - b.at)
      : value,
    summarize: (value) => notesWithText(value)
      .map((n) => ({ at: typeof n.at === "number" ? n.at : 0, text: (n.text as string).trim() }))
      .sort((a, b) => a.at - b.at)
      .map((n) => `${formatTimestamp(n.at)} ${n.text}`)
      .join("; "),
    samples: () => [[{ at: 0, text: "sample" }]],
  },
  {
    type: "highlights", label: "Highlights", category: "media", value: { json: true },
    operators: ["answered", "empty"], a11y: { semantics: "group" },
    isEmpty: (value) => emptyList(value, () => false),
    validate: (value, field) => {
      if (!Array.isArray(value)) return "Highlight a passage.";
      const maxHighlights = intProp(field, "maxHighlights", 20);
      if (value.length > maxHighlights) return `Add at most ${plural(maxHighlights, "highlight")}.`;
      const text = subjectText(field);
      for (const h of value) {
        if (!isObject(h) || !Number.isInteger(h.start) || !Number.isInteger(h.end) || typeof h.quote !== "string" || typeof h.note !== "string") {
          return "Highlight a passage of the text.";
        }
        const start = h.start as number;
        const end = h.end as number;
        if (start < 0 || end <= start || h.quote.length !== end - start) return "Highlight a passage of the text.";
        if (text !== undefined && (end > text.length || text.slice(start, end) !== h.quote)) return "A highlight doesn't match the text.";
        if (h.note.trim() === "") return HIGHLIGHT_NOTE_MESSAGE;
        if (h.note.trim().length > MAX_HIGHLIGHT_NOTE_LENGTH) return `Keep each note under ${MAX_HIGHLIGHT_NOTE_LENGTH} characters.`;
      }
      return null;
    },
    normalize: (value) => Array.isArray(value)
      ? value.filter(isObject)
          .map((h) => ({ start: h.start as number, end: h.end as number, quote: h.quote as string, note: String(h.note).trim() }))
          .sort((a, b) => a.start - b.start || a.end - b.end)
      : value,
    summarize: (value) => Array.isArray(value)
      ? value.filter(isObject).map((h) => `"${String(h.quote)}" — ${String(h.note).trim()}`).join("; ")
      : "",
    samples: (field) => {
      const text = subjectText(field);
      if (text === undefined) return [[{ start: 0, end: 6, quote: "sample", note: "sample" }]];
      const end = Math.min(text.length, 20);
      return [[{ start: 0, end, quote: text.slice(0, end), note: "sample" }]];
    },
  },
];
