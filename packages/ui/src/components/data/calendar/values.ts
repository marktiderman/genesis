// Reading a stored date into a calendar value: a `date` column is a day wherever you are; a
// timestamp is an instant. Postgres sends text like `2026-10-19 09:30:00.123456+00`.

import { addDays, rangeIn, type Day, type DayRange } from "@marktiderman/genesis-core/dates";

const DB_DATE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * A stored value as a calendar `start` or `end`: a day for a date column (or a value with no
 * time), an instant for a timestamp, null when it isn't a date. A timestamp without a zone is
 * read on the device's clock. @stability Beta
 */
export function readEventTime(value: unknown, dateOnly: boolean): Day | Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
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
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A window as filter values for a column: days for a date column, ISO instants on `zone`'s clock
 * for a timestamp. `[from, to)`; `lead` widens the start for events that began earlier. @stability Beta
 */
export function windowBounds(range: DayRange, dateOnly: boolean, zone: string, lead = 0): { from: string; to: string } {
  const widened = { start: addDays(range.start, -lead), end: range.end };
  if (dateOnly) return { from: widened.start, to: widened.end };
  const { start, end } = rangeIn(widened, zone);
  return { from: start.toISOString(), to: end.toISOString() };
}
