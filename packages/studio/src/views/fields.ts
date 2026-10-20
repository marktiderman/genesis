// Which fields can lay out a board or a calendar, and reading the dates the
// handler sends (Postgres text, e.g. `2026-10-19 09:30:00.123456+00`).

import type { FieldSchema, ResourceSchema } from "@marktiderman/genesis-core/schema";
import { choicesFor } from "../values";

/** Fields with a fixed set of values: an enum, or a yes/no. */
export function boardFields(schema: ResourceSchema): FieldSchema[] {
  return schema.fields.filter((f) => !f.array && Boolean(choicesFor(f)));
}

/** Date and timestamp fields. */
export function dateFields(schema: ResourceSchema): FieldSchema[] {
  return schema.fields.filter((f) => !f.array && f.type === "datetime" && !/^time( |$)|interval/.test(f.dbType ?? ""));
}

/** True for a `date` column: no time, no zone. */
export function isDateOnly(field: FieldSchema): boolean {
  return field.dbType === "date" || field.widget === "date";
}

const DB_DATE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * The local calendar day (`YYYY-MM-DD`) a stored value falls on, or null.
 * A `date` is that day wherever you are; a timestamp is placed on the day it
 * is in the viewer's time zone.
 */
export function localDay(value: unknown, dateOnly: boolean): string | null {
  if (typeof value !== "string") return null;
  const m = DB_DATE.exec(value.trim());
  if (!m) return null;
  if (dateOnly || !m[2]) return m[1]!;
  let zone = m[4] ?? "";
  if (/^[+-]\d{2}$/.test(zone)) zone += ":00";
  else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
  const ms = m[3] ? m[3].slice(0, 4).padEnd(4, "0") : "";
  const date = new Date(`${m[1]}T${time}${ms}${zone}`);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True for a timestamp that names an instant (`timestamptz`), not a wall-clock time. */
export function isZoned(field: FieldSchema): boolean {
  return !isDateOnly(field) && (field.dbType === undefined || /with time zone|timestamptz/.test(field.dbType));
}

/**
 * The bounds of a month, as filter values for this field: `[start, nextStart)`.
 * An instant is bounded by the viewer's midnights; a date or wall-clock
 * timestamp by the calendar days themselves.
 */
export function monthBounds(month: string, field: FieldSchema): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const start = new Date(y, m - 1, 1);
  const next = new Date(y, m, 1);
  return isZoned(field)
    ? { from: start.toISOString(), to: next.toISOString() }
    : { from: dayKey(start), to: dayKey(next) };
}

export function currentMonth(now = new Date()): string {
  return dayKey(now).slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return currentMonth(new Date(y, m - 1 + by, 1));
}
