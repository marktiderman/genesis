// What a list's person can change, as plain data (ADR 0017): its segment, its declared filters'
// values, search, sort, columns, view type and grouping. Checked and turned into provider filters
// here, with no React, so the web, a phone and a server export read a list's state the same way.

import type { FilterParam } from "../provider/types";
import type { FieldSchema } from "../schema/types";
import { titleCase } from "../utils";
import type {
  ResolvedFilter,
  SegmentWhere,
  ViewField,
  ViewFilter,
  ViewFilterKind,
  ViewFilterValue,
  ViewSegment,
  ViewTone,
} from "./types";

const SEGMENT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
/** The longest "contains" text a filter sends. */
const MAX_TEXT = 200;
/** The most values one choice filter sends. */
const MAX_CHOICES = 100;

/** A filter's kind from its field when the view doesn't say. */
export function filterKindOf(field: Pick<FieldSchema, "type" | "enumValues" | "array">): ViewFilterKind {
  if (field.enumValues?.length || field.type === "boolean") return "choice";
  if (field.type === "datetime" || field.type === "number") return "range";
  return "text";
}

/** What's wrong with a view's `filters`, one sentence each. */
export function filterProblems(fields: ReadonlyMap<string, FieldSchema>, filters: unknown): string[] {
  if (filters === undefined) return [];
  if (!Array.isArray(filters)) return ["filters isn't a list"];
  const problems: string[] = [];
  const seen = new Set<string>();
  filters.forEach((raw: unknown, i) => {
    const where = `filters[${i}]`;
    if (!raw || typeof raw !== "object") {
      problems.push(`${where} isn't a filter`);
      return;
    }
    const f = raw as ViewFilter;
    const field = typeof f.field === "string" ? fields.get(f.field) : undefined;
    if (!field) {
      problems.push(`${where}.field names "${String(f.field)}", which isn't a field`);
      return;
    }
    if (seen.has(f.field)) problems.push(`filters lists "${f.field}" twice`);
    seen.add(f.field);
    if (field.permissions?.read === false) problems.push(`${where}.field "${f.field}" can't be read, so it can't filter`);
    const kind = f.kind ?? filterKindOf(field);
    if (!["choice", "range", "text"].includes(kind)) problems.push(`${where}.kind is choice, range or text, not ${JSON.stringify(f.kind)}`);
    if (kind === "range" && field.type !== "datetime" && field.type !== "number") problems.push(`${where} is a range, but "${f.field}" isn't a date or a number`);
    if (kind === "choice" && !field.enumValues?.length && field.type !== "boolean" && !f.options?.length) {
      problems.push(`${where} is a choice, but "${f.field}" has no fixed values: name them in options`);
    }
    if (f.options !== undefined) {
      if (!Array.isArray(f.options) || !f.options.every((o) => typeof o === "string")) problems.push(`${where}.options isn't a list of values`);
      else if (field.enumValues?.length) {
        for (const o of f.options) if (!field.enumValues.includes(o)) problems.push(`${where}.options lists "${o}", which isn't a value of ${f.field}`);
      }
    }
    if (f.label !== undefined && (typeof f.label !== "string" || !f.label.trim())) problems.push(`${where}.label isn't text`);
  });
  return problems;
}

/** Resolve a view's filters: label, kind and each choice's words and tone. */
export function resolveFilters(
  fields: ReadonlyMap<string, FieldSchema>,
  filters: readonly ViewFilter[] | undefined,
  label: (name: string) => string,
  viewField: (name: string) => ViewField | undefined,
  valueLabel: (name: string, value: unknown) => string,
): readonly ResolvedFilter[] {
  return Object.freeze(
    (filters ?? []).map((f): ResolvedFilter => {
      const field = fields.get(f.field)!;
      const kind = f.kind ?? filterKindOf(field);
      const tones = viewField(f.field)?.tones;
      const values = f.options ?? field.enumValues ?? (field.type === "boolean" ? ["true", "false"] : []);
      const options =
        kind === "choice"
          ? Object.freeze(
              values.map((value) => {
                const tone: ViewTone | undefined = tones && Object.hasOwn(tones, value) ? tones[value] : undefined;
                const words = field.type === "boolean" && !viewField(f.field)?.labels ? (value === "true" ? "Yes" : "No") : valueLabel(f.field, value);
                return Object.freeze({ value, label: words, ...(tone ? { tone } : {}) });
              }),
            )
          : Object.freeze([]);
      const input =
        kind === "range" ? (field.type === "number" ? "number" : /^date$/i.test(field.dbType ?? "") || viewField(f.field)?.display === "date" ? "date" : "datetime") : undefined;
      return Object.freeze({
        field: f.field,
        label: f.label ?? label(f.field),
        kind,
        options,
        ...(input ? { input: input as "date" | "datetime" | "number" } : {}),
        ...(f.default !== undefined ? { default: f.default } : {}),
      });
    }),
  );
}

/** What's wrong with a view's `segments`, one sentence each. */
export function segmentProblems(fields: ReadonlyMap<string, FieldSchema>, segments: unknown, columnPresets: (name: string) => boolean): string[] {
  if (segments === undefined) return [];
  if (!Array.isArray(segments)) return ["segments isn't a list"];
  const problems: string[] = [];
  const seen = new Set<string>();
  segments.forEach((raw: unknown, i) => {
    const where = `segments[${i}]`;
    if (!raw || typeof raw !== "object") {
      problems.push(`${where} isn't a segment`);
      return;
    }
    const s = raw as ViewSegment;
    if (typeof s.id !== "string" || !SEGMENT_ID.test(s.id)) problems.push(`${where}.id is lowercase letters, digits, - and _ (it goes in the URL), not ${JSON.stringify(s.id)}`);
    else if (seen.has(s.id)) problems.push(`segments lists "${s.id}" twice`);
    else seen.add(s.id);
    if (typeof s.label !== "string" || !s.label.trim()) problems.push(`${where} has no label`);
    if (s.count !== undefined && typeof s.count !== "boolean") problems.push(`${where}.count isn't true or false`);
    if (s.args !== undefined && (!s.args || typeof s.args !== "object" || Array.isArray(s.args))) problems.push(`${where}.args isn't a map of arguments to values`);
    if (s.columns !== undefined && (typeof s.columns !== "string" || !columnPresets(s.columns))) problems.push(`${where}.columns names "${String(s.columns)}", which isn't a column preset`);
    if (s.where !== undefined && typeof s.where !== "function") {
      if (!s.where || typeof s.where !== "object" || Array.isArray(s.where)) problems.push(`${where}.where isn't a map of fields to values`);
      else for (const name of Object.keys(s.where)) if (!fields.has(name)) problems.push(`${where}.where names "${name}", which isn't a field`);
    }
  });
  return problems;
}

/** A segment's `where` as provider filters. A range keeps only the ends it has. */
export function whereParams(where: SegmentWhere | null | undefined): FilterParam[] {
  const out: FilterParam[] = [];
  for (const [field, value] of Object.entries(where ?? {})) {
    if (value === undefined) continue;
    if (value === null) out.push({ field, operator: "is_null" });
    else if (Array.isArray(value)) out.push({ field, operator: "in", value: [...(value as readonly (string | number)[])] });
    else if (typeof value === "object") {
      const range = value as { gte?: string | number; lte?: string | number };
      if (range.gte !== undefined) out.push({ field, operator: "gte", value: range.gte });
      if (range.lte !== undefined) out.push({ field, operator: "lte", value: range.lte });
    } else out.push({ field, operator: "eq", value: value as string | number | boolean });
  }
  return out;
}

/** One end of a range, checked for its input: a day, an instant or a number. */
function rangeEnd(value: unknown, input: ResolvedFilter["input"]): string | number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const v = value.trim();
  if (input === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (input === "date") return DAY.test(v) ? v : undefined;
  return INSTANT.test(v) ? v : undefined;
}

/**
 * Declared filters' values as provider filters (`ResourceView.filterParams`). Values a filter
 * doesn't take are dropped, never sent.
 */
export function filterValueParams(
  resolved: readonly ResolvedFilter[],
  fields: ReadonlyMap<string, FieldSchema>,
  values: Readonly<Record<string, ViewFilterValue | undefined>> | null | undefined,
): FilterParam[] {
  const out: FilterParam[] = [];
  for (const filter of resolved) {
    const value = values && Object.hasOwn(values, filter.field) ? values[filter.field] : undefined;
    if (value === undefined) continue;
    if (filter.kind === "choice") {
      if (!Array.isArray(value)) continue;
      const offered = new Set(filter.options.map((o) => o.value));
      const chosen = [...new Set((value as readonly unknown[]).filter((v): v is string => typeof v === "string" && offered.has(v)))].slice(0, MAX_CHOICES);
      if (!chosen.length) continue;
      const boolean = fields.get(filter.field)?.type === "boolean";
      const typed = boolean ? chosen.map((v) => v === "true") : chosen;
      out.push(typed.length === 1 ? { field: filter.field, operator: "eq", value: typed[0]! } : { field: filter.field, operator: "in", value: typed });
    } else if (filter.kind === "range") {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const range = value as { gte?: unknown; lte?: unknown };
      const gte = rangeEnd(range.gte, filter.input);
      const lte = rangeEnd(range.lte, filter.input);
      if (gte !== undefined) out.push({ field: filter.field, operator: "gte", value: gte });
      if (lte !== undefined) out.push({ field: filter.field, operator: "lte", value: lte });
    } else {
      if (typeof value !== "string") continue;
      const text = value.trim().slice(0, MAX_TEXT);
      if (text) out.push({ field: filter.field, operator: "contains", value: text });
    }
  }
  return out;
}

/** Whether a filter value narrows anything (an empty choice or range doesn't). @stability Beta */
export function isFilterSet(value: ViewFilterValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  const range = value as { gte?: string; lte?: string };
  return Boolean(range.gte?.trim() || range.lte?.trim());
}

/**
 * Everything a person can change about a list, as plain data: what a saved view stores and what
 * the URL keeps (ADR 0017 §4).
 *
 * @stability Beta
 */
export interface ListState {
  /** The segment's id. */
  segment?: string;
  /** Declared filters' values, by field. */
  filters?: Readonly<Record<string, ViewFilterValue>>;
  search?: string;
  sort?: { readonly field: string; readonly order: "asc" | "desc" };
  /** A column preset. */
  columns?: string;
  /** The view type (`table`, `board`, a registered one). */
  type?: string;
  /** The field rows are grouped by, or `null` for none (over the view's own `groupBy`). */
  groupBy?: string | null;
}

/** The URL keys a list's state uses beside `q`, `sort`, `page` and `id`. @stability Beta */
export const LIST_URL_KEYS = Object.freeze({ segment: "seg", filterPrefix: "f." });

/** A filter value as one URL parameter: choices joined by commas, a range as `from..to`, text as is. */
export function encodeFilterValue(value: ViewFilterValue): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => encodeURIComponent(v)).join(",");
  const range = value as { gte?: string; lte?: string };
  return `${range.gte ?? ""}..${range.lte ?? ""}`;
}

/** One URL parameter as a declared filter's value, by its kind; undefined when it doesn't parse. */
export function decodeFilterValue(kind: ViewFilterKind, raw: string): ViewFilterValue | undefined {
  if (kind === "text") return raw.trim() ? raw.slice(0, MAX_TEXT) : undefined;
  if (kind === "choice") {
    const values = raw.split(",").filter(Boolean).map((v) => {
      try {
        return decodeURIComponent(v);
      } catch {
        return "";
      }
    }).filter(Boolean);
    return values.length ? values.slice(0, MAX_CHOICES) : undefined;
  }
  const at = raw.indexOf("..");
  if (at < 0) return undefined;
  const gte = raw.slice(0, at);
  const lte = raw.slice(at + 2);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/**
 * A list's segment and declared filters from URL parameters. Only declared filters and defined
 * segments are read; anything else is ignored.
 *
 * @stability Beta
 */
export function readListUrl(
  view: { filters(): readonly ResolvedFilter[]; segments(): readonly { id: string }[] },
  get: (key: string) => string | null | undefined,
): Pick<ListState, "segment" | "filters"> {
  const out: { segment?: string; filters?: Record<string, ViewFilterValue> } = {};
  const seg = get(LIST_URL_KEYS.segment);
  if (seg && view.segments().some((s) => s.id === seg)) out.segment = seg;
  for (const f of view.filters()) {
    const raw = get(`${LIST_URL_KEYS.filterPrefix}${f.field}`);
    if (raw === null || raw === undefined || raw === "") continue;
    const value = decodeFilterValue(f.kind, raw);
    if (value !== undefined) (out.filters ??= {})[f.field] = value;
  }
  return out;
}

/**
 * The URL parameters a list's segment and declared filters set, `null` for each to remove: pass
 * them to a router adapter's `setSearchParams`.
 *
 * @stability Beta
 */
export function listUrlParams(
  view: { filters(): readonly ResolvedFilter[]; segments(): readonly { id: string }[] },
  state: Pick<ListState, "segment" | "filters">,
  defaultSegment?: string,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (view.segments().length) out[LIST_URL_KEYS.segment] = state.segment && state.segment !== defaultSegment ? state.segment : null;
  for (const f of view.filters()) {
    const value = state.filters?.[f.field];
    out[`${LIST_URL_KEYS.filterPrefix}${f.field}`] = value !== undefined && isFilterSet(value) ? encodeFilterValue(value) : null;
  }
  return out;
}

/** A value's words for a filter chip: its label, or the value in title case. */
export function filterOptionLabel(filter: ResolvedFilter, value: string): string {
  return filter.options.find((o) => o.value === value)?.label ?? titleCase(value);
}
