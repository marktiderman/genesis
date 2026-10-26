// CSV of every row a filtered list matches (not one page): paged through the
// provider, so it works with any DataProvider and never asks for an
// unbounded query.

import type { DataProvider, FilterParam, SortParam } from "./provider";
import type { FieldSchema } from "./schema/types";

/** RFC 4180 field: quoted when it holds a comma, quote or line break. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // A leading =, +, - or @ turns into a formula in a spreadsheet, even after spaces (some apps
  // trim them on import); neutralise
  // it. A plain number (-5, -1.5e3) stays a number: it computes nothing, and a
  // prefix would turn it into text nobody can sum. Postgres numerics arrive
  // as strings, so the check is on the text, not the type.
  const plainNumber = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text);
  const safe = !plainNumber && /^\s*[=+\-@]|^[\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(fields: readonly FieldSchema[], rows: readonly Record<string, unknown>[]): string {
  const lines = [fields.map((f) => csvField(f.name)).join(",")];
  for (const row of rows) lines.push(fields.map((f) => csvField(row[f.name])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export interface ExportOptions {
  provider: DataProvider;
  resource: string;
  fields: readonly FieldSchema[];
  sorts: SortParam[];
  filters: FilterParam[];
  search?: string;
  /** Stop after this many rows. Default 10 000. */
  maxRows?: number;
  onProgress?: (rows: number) => void;
}

export async function exportCsv(options: ExportOptions): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const perPage = 200;
  const max = options.maxRows ?? 10_000;
  const rows: Record<string, unknown>[] = [];
  let truncated = false;
  for (let page = 1; ; page++) {
    const result = await options.provider.getList(options.resource, {
      pagination: { page, perPage },
      sort: options.sorts[0],
      sorts: options.sorts,
      filters: options.filters,
      ...(options.search ? { search: { query: options.search, fields: [] } } : {}),
    });
    rows.push(...(result.data as Record<string, unknown>[]));
    options.onProgress?.(rows.length);
    if (rows.length >= max) {
      truncated = rows.length > max || result.total > max;
      rows.length = Math.min(rows.length, max);
      break;
    }
    if (result.data.length < perPage || rows.length >= result.total) break;
  }
  return { csv: toCsv(options.fields, rows), rows: rows.length, truncated };
}

/**
 * Parse CSV text (RFC 4180: quoted fields, doubled quotes, CRLF or LF) into
 * a header and rows. A cell is always text: nothing is guessed or coerced,
 * so the database decides whether "1,5" is a number.
 */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => r.some((v) => v !== ""));
  const [header = [], ...rows] = nonEmpty;
  return { header: header.map((h) => h.trim()), rows };
}
