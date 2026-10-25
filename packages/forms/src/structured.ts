import type { FieldTypeManifest } from "./fields";
import { isPlainRecord, type PropsCheck } from "./props-check";
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

export interface TableColumn { key: string; label: string; long?: boolean }
export const MAX_TABLE_COLUMNS = 6;
export const MAX_TABLE_CELL_LENGTH = 2000;
export function tableColumns(field: FieldBlock): TableColumn[] {
  const raw = field.props?.columns;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TableColumn[] = [];
  for (const c of raw) {
    if (!isObject(c) || typeof c.key !== "string" || !c.key || seen.has(c.key)) continue;
    seen.add(c.key);
    const column: TableColumn = { key: c.key, label: typeof c.label === "string" ? c.label : c.key };
    if (c.long === true) column.long = true;
    out.push(column);
  }
  return out;
}
export function tableLimits(field: FieldBlock) {
  return { minRows: optionalIntProp(field, "minRows") ?? 0, maxRows: intProp(field, "maxRows", 3) };
}
const filledRows = (value: Json | undefined): JsonObject[] =>
  Array.isArray(value) ? value.filter((r): r is JsonObject => isObject(r) && Object.values(r).some((c) => !blank(c))) : [];

export interface MediaNote { at: number; text: string }
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
/** The longest passage one highlight may quote; also bounds a quote the server can't check against `props.text`. */
export const MAX_HIGHLIGHT_QUOTE_LENGTH = 2000;
export const HIGHLIGHT_NOTE_MESSAGE = "Add a note to each highlight.";
const sourceText = (field: FieldBlock) => (typeof field.props?.text === "string" && field.props.text ? field.props.text : undefined);

/**
 * The structured field types, whose answers are lists or records rather than one
 * value:
 * - `list`: several short answers, e.g. goals, action items, three things that went well.
 * - `table`: a small table each answer fills row by row, e.g. an action plan
 *   (What / Who / By when), pros and cons.
 * - `media-notes`: notes pinned to times in a video or audio, e.g. lecture notes,
 *   a recorded call review.
 * - `text-highlights`: highlight passages of a text and note on each, e.g.
 *   annotating an article, a policy or a contract.
 *
 * They are registered like any other, but the builder offers them only to a
 * host that names them in its palette (`FormBuilder palette`), so forms that
 * never had them don't change.
 */
export const STRUCTURED_FIELD_TYPES = ["list", "table", "media-notes", "text-highlights"] as const;

const listProps: PropsCheck = (props, check) => {
  check.optionalInt(props.min, "min", 0);
  check.optionalInt(props.max, "max", 1);
  check.optionalInt(props.itemMaxLength, "itemMaxLength", 1);
  check.optionalText(props.placeholder, "placeholder");
  check.ordered(props.min, props.max ?? 10, "min", "most items");
};

// Checked with or without props: a table with no columns would block every submission.
const tableProps: PropsCheck = (props, check) => {
  const columns = props.columns;
  if (!Array.isArray(columns) || columns.length < 1 || columns.length > MAX_TABLE_COLUMNS) {
    check.issue("columns", `Must be a list of 1 to ${MAX_TABLE_COLUMNS} columns.`);
  } else {
    const seen = new Set<string>();
    columns.forEach((c, j) => {
      const at = `columns[${j}]`;
      if (!isPlainRecord(c)) return check.issue(at, "Each column needs a key and a label.");
      if (check.name(c.key, `${at}.key`, "A column key")) {
        if (seen.has(c.key)) check.issue(`${at}.key`, `Duplicate column key "${c.key}".`);
        seen.add(c.key);
      }
      check.text(c.label, `${at}.label`);
      check.optionalBoolean(c.long, `${at}.long`);
    });
  }
  check.optionalInt(props.minRows, "minRows", 0);
  check.optionalInt(props.maxRows, "maxRows", 1);
  check.ordered(props.minRows, props.maxRows ?? 3, "minRows", "most rows");
};

export const structuredFieldTypes: FieldTypeManifest[] = [
  {
    type: "list", label: "List", category: "text", value: { json: true }, literal: "string",
    checkProps: listProps,
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
    type: "table", label: "Table", category: "advanced", value: { json: true },
    checkProps: tableProps,
    operators: ["answered", "empty"], a11y: { semantics: "group" },
    isEmpty: (value) => emptyList(value, (r) => isObject(r) && Object.values(r).every(blankText)),
    validate: (value, field) => {
      const columns = tableColumns(field);
      if (!columns.length) return "This question has no columns.";
      if (!Array.isArray(value) || !value.every(isObject)) return "Fill in the rows.";
      const keys = new Set(columns.map((c) => c.key));
      for (const row of value as JsonObject[]) {
        for (const [key, cell] of Object.entries(row)) {
          if (!keys.has(key)) return "An answer names a column this question doesn't have.";
          if (typeof cell !== "string") return "Fill in the rows with text.";
          if (cell.trim().length > MAX_TABLE_CELL_LENGTH) return `Keep each answer under ${MAX_TABLE_CELL_LENGTH} characters.`;
        }
      }
      const { minRows, maxRows } = tableLimits(field);
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
      const columns = tableColumns(field);
      return filledRows(value)
        .map((row) => columns.filter((c) => !blank(row[c.key])).map((c) => `${c.label}: ${(row[c.key] as string).trim()}`).join(" · "))
        .join(" / ");
    },
    samples: (field) => {
      const columns = tableColumns(field);
      if (!columns.length) return [];
      const { minRows, maxRows } = tableLimits(field);
      const row = Object.fromEntries(columns.map((c) => [c.key, "sample"]));
      return [Array.from({ length: Math.min(Math.max(1, minRows), maxRows) }, () => ({ ...row }))];
    },
  },
  {
    type: "media-notes", label: "Notes at moments", category: "media", value: { json: true },
    checkProps: (props, check) => {
      check.optionalInt(props.maxNotes, "maxNotes", 1);
      check.optionalInt(props.textMaxLength, "textMaxLength", 1);
    },
    operators: ["answered", "empty"], a11y: { semantics: "group" },
    isEmpty: (value) => emptyList(value, (n) => isObject(n) && blankText(n.text)),
    validate: (value, field) => {
      if (!Array.isArray(value)) return "Add notes.";
      const textMaxLength = intProp(field, "textMaxLength", 1000);
      for (const note of value) {
        if (!isObject(note) || typeof note.text !== "string") return "Add notes.";
        if (!isTimestamp(note.at)) return "Each note needs a time.";
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
    type: "text-highlights", label: "Highlights", category: "media", value: { json: true },
    checkProps: (props, check) => {
      check.optionalText(props.text, "text");
      check.optionalInt(props.maxHighlights, "maxHighlights", 1);
    },
    operators: ["answered", "empty"], a11y: { semantics: "group" },
    isEmpty: (value) => emptyList(value, () => false),
    validate: (value, field) => {
      if (!Array.isArray(value)) return "Highlight a passage.";
      const maxHighlights = intProp(field, "maxHighlights", 20);
      if (value.length > maxHighlights) return `Add at most ${plural(maxHighlights, "highlight")}.`;
      const text = sourceText(field);
      for (const h of value) {
        if (!isObject(h) || !Number.isInteger(h.start) || !Number.isInteger(h.end) || typeof h.quote !== "string" || typeof h.note !== "string") {
          return "Highlight a passage of the text.";
        }
        const start = h.start as number;
        const end = h.end as number;
        if (start < 0 || end <= start || h.quote.length !== end - start) return "Highlight a passage of the text.";
        if (end - start > MAX_HIGHLIGHT_QUOTE_LENGTH) return `Highlight under ${MAX_HIGHLIGHT_QUOTE_LENGTH} characters at a time.`;
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
      const text = sourceText(field);
      if (text === undefined) return [[{ start: 0, end: 6, quote: "sample", note: "sample" }]];
      const end = Math.min(text.length, 20);
      return [[{ start: 0, end, quote: text.slice(0, end), note: "sample" }]];
    },
  },
];
