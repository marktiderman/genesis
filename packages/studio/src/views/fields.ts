// Which fields can lay out a board or a calendar, and reading the dates the
// handler sends (Postgres text, e.g. `2026-10-19 09:30:00.123456+00`).

import type { FieldSchema, ResourceSchema } from "@marktiderman/genesis-core/schema";
import { deviceTimeZone } from "@marktiderman/genesis-core/dates";
import { calendarWindow, readEventTime, timeStorage, windowBounds } from "@marktiderman/genesis-ui/data";
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
  return field.dbType === "date" || (field.control ?? field.widget) === "date";
}

/**
 * The local calendar day (`YYYY-MM-DD`) a stored value falls on, or null.
 * A `date` is that day wherever you are; a timestamp is placed on the day it
 * is in the viewer's time zone.
 */
export function localDay(value: unknown, dateOnly: boolean): string | null {
  const read = readEventTime(value, { dateOnly });
  return read === null ? null : typeof read === "string" ? read : dayKey(read);
}

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The bounds of the month grid a calendar shows (the month's whole weeks, Monday first), as
 * filter values for this field: `[start, end)`. An instant is bounded by the viewer's midnights;
 * a date by the days themselves; a wall-clock timestamp by wall-clock midnights.
 */
export function monthBounds(month: string, field: FieldSchema): { from: string; to: string } {
  return windowBounds(calendarWindow("month", `${month}-01`, { weekStartsOn: 1 }), timeStorage(field), deviceTimeZone());
}

export function currentMonth(now = new Date()): string {
  return dayKey(now).slice(0, 7);
}
