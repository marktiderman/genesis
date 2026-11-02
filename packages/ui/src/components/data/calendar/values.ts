// A calendar window as filter values for a column, by how the column stores time.

import { addDays, rangeIn, type DayRange } from "@marktiderman/genesis-core/dates";

/**
 * How a column stores time: `date` (a calendar day), `zoned` (an instant, `timestamptz`) or
 * `wall` (a wall time with no zone, `timestamp without time zone`). @stability Beta
 */
export type TimeStorage = "date" | "zoned" | "wall";

/** How a field stores time, from its database type (an unknown type with a time counts as an instant). @stability Beta */
export function timeStorage(field: { dbType?: string | undefined; widget?: string | undefined } | undefined): TimeStorage {
  if (!field || field.dbType === "date" || field.widget === "date") return "date";
  if (field.dbType === undefined || /with time zone|timestamptz/.test(field.dbType)) return "zoned";
  return "wall";
}

/**
 * A window as filter values for a column: days for a date column, ISO instants of `zone`'s
 * midnights for a timestamp, and wall-clock midnights (no zone) for a timestamp without one.
 * `[from, to)`; `lead` widens the start by days. @stability Beta
 */
export function windowBounds(range: DayRange, storage: TimeStorage, zone: string, lead = 0): { from: string; to: string } {
  const start = addDays(range.start, -lead);
  if (storage === "date") return { from: start, to: range.end };
  if (storage === "wall") return { from: `${start}T00:00:00`, to: `${range.end}T00:00:00` };
  const instants = rangeIn({ start, end: range.end }, zone);
  return { from: instants.start.toISOString(), to: instants.end.toISOString() };
}
