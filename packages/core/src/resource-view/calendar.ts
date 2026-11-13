// Calendars over a view's rows (ADR 0017, ADR 0021): the days a layout shows, where each event
// lands, how a column stores time, and a view's rows as events. Pure, so the web's EventCalendar,
// a custom view and the phone's calendar all place events the same way.

import {
  addDays,
  addMonths,
  addWeeks,
  dayIn,
  deviceTimeZone,
  eachDay,
  isTimeZone,
  monthGridRange,
  rangeIn,
  readEventTime,
  weeksRange,
  type Day,
  type DayRange,
} from "../dates";
import { isDevelopment } from "../errors";
import { encodeRecordKey } from "../schema/keys";
import type { DataRow, ResourceContract } from "../schema/types";
import type { ResourceView, ViewCalendar, ViewCalendarDurationUnit } from "./types";

// Each bad value is warned about once, not on every render while it stays in the URL.
const warned = new Set<string>();

/** A development-only hint, once per message: a bad URL value or override that fell back. @stability Beta */
export function warnOnce(message: string): void {
  if (!isDevelopment() || warned.has(message)) return;
  warned.add(message);
  // genesis-allow-console: a development-only hint about a value that fell back; nothing failed.
  console.warn(message);
}


/** How a calendar lays out its window. @stability Beta */
export type CalendarLayout = "month" | "weeks" | "agenda" | "lanes";

/** Weeks a `weeks`, `agenda` or `lanes` layout shows. @stability Beta */
export type CalendarWeeks = 1 | 2 | 3 | 4;

/**
 * One event. An all-day event's `start` and `end` are days, `end` the last day it covers
 * (inclusive: a weekend away is Saturday to Sunday). A timed event's are instants, `end`
 * exclusive; without one it is a moment.
 *
 * @stability Beta
 */
export interface CalendarEvent<T = unknown> {
  key: string;
  title: string;
  start: Day | Date;
  end?: Day | Date | undefined;
  /** Default: true when `start` is a day. */
  allDay?: boolean | undefined;
  /** The lanes (people) it belongs to: one dot each, and a place in each lane of a `lanes` layout. */
  lanes?: readonly string[] | undefined;
  /** Dot colours, when not the lanes' own. Any CSS colour. */
  colors?: readonly string[] | undefined;
  /**
   * Classes for the event's item, on the grid and the printed agenda: `line-through opacity-60`
   * strikes out a cancelled event rather than dropping it. Pair a look with `status`, so it isn't
   * the only cue.
   */
  className?: string | undefined;
  /** Words read out after the title ("Cancelled"), for what `className` shows. Visually hidden. */
  status?: string | undefined;
  /** The record it came from, handed back on select. */
  row?: T;
}

/** A lane: one person (or room, or team) a `lanes` layout gives a row. @stability Beta */
export interface CalendarLane {
  key: string;
  label: string;
  /** Its dot colour, any CSS colour. */
  color?: string | undefined;
}

/** An event on one of its days. @stability Beta */
export interface PlacedEvent<T = unknown> {
  event: CalendarEvent<T>;
  day: Day;
  allDay: boolean;
  /** It started on an earlier day. */
  continued: boolean;
  /** It runs on past this day. */
  continues: boolean;
}

/** What a layout's window depends on. */
export interface CalendarWindowOptions {
  weeks?: CalendarWeeks | undefined;
  /** 0 Sunday or 1 Monday (default). */
  weekStartsOn?: 0 | 1 | undefined;
}

/**
 * The days a layout shows around `anchor`: a month grid's whole weeks, or `weeks` weeks from the
 * week `anchor` is in. This is the window a calendar asks its data for. @stability Beta
 */
export function calendarWindow(layout: CalendarLayout, anchor: Day, options: CalendarWindowOptions = {}): DayRange {
  const weekStartsOn = options.weekStartsOn ?? 1;
  return layout === "month" ? monthGridRange(anchor, weekStartsOn) : weeksRange(anchor, options.weeks ?? 2, weekStartsOn);
}

/** The anchor one step back (−1) or on (1): a month for `month`, else the window's weeks. @stability Beta */
export function shiftAnchor(layout: CalendarLayout, anchor: Day, step: number, weeks: CalendarWeeks = 2): Day {
  return layout === "month" ? addMonths(anchor, step) : addWeeks(anchor, step * weeks);
}

function isAllDay(event: CalendarEvent<unknown>): boolean {
  return event.allDay ?? typeof event.start === "string";
}

/** The first and last day an event covers on `zone`'s clock. */
export function eventDays(event: CalendarEvent<unknown>, zone: string): { first: Day; last: Day } {
  const dayOfValue = (v: Day | Date) => (typeof v === "string" ? v : dayIn(zone, v));
  const first = dayOfValue(event.start);
  if (event.end === undefined) return { first, last: first };
  let last: Day;
  if (typeof event.end === "string") last = event.end;
  // A timed end is exclusive: an event to midnight ends the day before.
  else last = dayIn(zone, new Date(Math.max(event.end.getTime() - 1, typeof event.start === "string" ? 0 : event.start.getTime())));
  return { first, last: last < first ? first : last };
}

const startTime = (e: CalendarEvent<unknown>) => (typeof e.start === "string" ? 0 : e.start.getTime());

/**
 * Each day of `range` with the events on it: an event that spans days is on each one, all-day
 * events (and the middle days of a long timed one) come first, then timed ones by start, then by
 * title. @stability Beta
 */
export function placeEvents<T>(events: readonly CalendarEvent<T>[], range: DayRange, zone: string): Map<Day, PlacedEvent<T>[]> {
  const byDay = new Map<Day, PlacedEvent<T>[]>(eachDay(range).map((d) => [d, []]));
  for (const event of events) {
    const { first, last } = eventDays(event, zone);
    if (last < range.start || first >= range.end) continue;
    const allDay = isAllDay(event);
    for (let day = first < range.start ? range.start : first; day <= last && day < range.end; day = addDays(day, 1)) {
      byDay.get(day)!.push({
        event,
        day,
        // A timed event's middle days have no start of their own: they read as all day.
        allDay: allDay || (day !== first && day !== last),
        continued: day !== first,
        continues: day !== last,
      });
    }
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        (a.allDay ? 0 : (a.continued ? 0 : startTime(a.event)) - (b.continued ? 0 : startTime(b.event))) ||
        a.event.title.localeCompare(b.event.title) ||
        a.event.key.localeCompare(b.event.key),
    );
  }
  return byDay;
}

/**
 * The lanes a `lanes` layout draws: the ones given, in order, then any an event names that
 * weren't given (labelled by key). @stability Beta
 */
export function calendarLanes(events: readonly CalendarEvent<unknown>[], lanes: readonly CalendarLane[] = []): CalendarLane[] {
  const out = [...lanes];
  const seen = new Set(out.map((l) => l.key));
  for (const e of events) {
    for (const key of e.lanes ?? []) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, label: key });
      }
    }
  }
  return out;
}

/** An event's dots: its own colours, else its lanes' colours. @stability Beta */
export function eventDots(event: CalendarEvent<unknown>, lanes: readonly CalendarLane[]): { color: string; label?: string }[] {
  if (event.colors?.length) return event.colors.map((color) => ({ color }));
  const byKey = new Map(lanes.map((l) => [l.key, l]));
  return (event.lanes ?? []).flatMap((key) => {
    const lane = byKey.get(key);
    return lane?.color ? [{ color: lane.color, label: lane.label }] : [];
  });
}



/**
 * How a column stores time: `date` (a calendar day), `zoned` (an instant, `timestamptz`) or
 * `wall` (a wall time with no zone, `timestamp without time zone`). @stability Beta
 */
export type TimeStorage = "date" | "zoned" | "wall";

/** How a field stores time, from its database type (an unknown type with a time counts as an instant). @stability Beta */
export function timeStorage(field: { dbType?: string | undefined; control?: string | undefined; widget?: string | undefined } | undefined): TimeStorage {
  if (!field || field.dbType === "date" || (field.control ?? field.widget) === "date") return "date";
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

/** The clock a field's cells use: its own zone, the scope's, the viewer's, the device's. @stability Beta */
export function displayZone(own: string | undefined, viewer: string | undefined, scope: string | undefined): string {
  if (own && own !== "viewer" && own !== "scope" && isTimeZone(own)) return own;
  const picked = own === "scope" ? (scope ?? viewer) : viewer;
  return picked && isTimeZone(picked) ? picked : deviceTimeZone();
}

const UNIT_MS: Readonly<Record<ViewCalendarDurationUnit, number>> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

function durationOf(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

const atUtcMidnight = (at: Date) => at.getTime() % UNIT_MS.days === 0;

const MAX_TIME = 8.64e15;

function durationEnd(start: Day | Date, startDay: Day, allDay: boolean, ms: number): Day | Date | null {
  if (!Number.isFinite(ms)) return null;
  if (typeof start === "string" || allDay) {
    const days = Math.max(1, Math.ceil(ms / UNIT_MS.days));
    if (!Number.isSafeInteger(days) || days * UNIT_MS.days > MAX_TIME) return null;
    try {
      return addDays(startDay, days - 1);
    } catch {
      return null;
    }
  }
  const end = start.getTime() + ms;
  return Number.isFinite(end) && Math.abs(end) <= MAX_TIME ? new Date(end) : null;
}

/** A lane field's value as lane keys. */
export function laneKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).map(String);
  return value === null || value === undefined || value === "" ? [] : [String(value)];
}

/** How a view's rows become events: its calendar block's fields, and the screen's look per row. @stability Beta */
export interface CalendarEventOptions<T> extends Pick<ViewCalendar, "field"> {
  endField?: string | undefined;
  durationField?: string | undefined;
  durationUnit?: ViewCalendarDurationUnit | undefined;
  allDayField?: string | undefined;
  laneBy?: string | undefined;
  /** The clock the rows are read on. */
  timeZone: string;
  lanesOf?: ((row: T) => readonly string[]) | undefined;
  colorsOf?: ((row: T) => readonly string[]) | undefined;
  classNameOf?: ((row: T) => string | undefined) | undefined;
  statusOf?: ((row: T) => string | undefined) | undefined;
}

/**
 * A view's rows as calendar events: each row's start (and its end, or start plus its duration),
 * all day or timed, its title from the view's summary and its lanes. A row without a start is
 * left out. The web's calendar and the phone's read rows through it.
 *
 * @stability Beta
 */
export function calendarEvents<T extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: ResourceView<ResourceContract<any>, T & DataRow>,
  rows: readonly T[],
  options: CalendarEventOptions<T>,
): CalendarEvent<T>[] {
  const { field: fieldName, endField, durationField, durationUnit = "minutes", allDayField, laneBy, timeZone: zone, lanesOf, colorsOf, classNameOf, statusOf } = options;
  const storage = timeStorage(view.field(fieldName));
  const endStorage = endField ? timeStorage(view.field(endField)) : storage;
  return rows.flatMap((row): CalendarEvent<T>[] => {
    const start = readEventTime(row[fieldName], { dateOnly: storage === "date", timeZone: zone });
    if (start === null) return [];
    const ownEnd = endField ? readEventTime(row[endField], { dateOnly: endStorage === "date", timeZone: zone }) : null;
    const allDay = allDayField ? Boolean(row[allDayField]) : typeof start === "string";
    // An all-day row's days. Stored as days (`YYYY-MM-DD`), they are those days, with no clock
    // at all. Stored as instants at UTC midnight (how Google's API and most sources write an
    // all-day event), they are read on UTC: on a clock behind UTC that midnight is the
    // evening before. Any other instants (a midnight on the viewer's clock) are read on the
    // viewer's clock.
    const clock = allDay && typeof start !== "string" && atUtcMidnight(start) && (ownEnd === null || typeof ownEnd === "string" || atUtcMidnight(ownEnd)) ? "UTC" : zone;
    const startDay = typeof start === "string" ? start : dayIn(clock, start);
    // No end of its own: the start plus its duration. A timed row ends that long after it starts
    // (exclusive, like a stored end); a date or an all-day row runs that many days from its start
    // day, so its last day is the one before, and never before its first. An end that can't be
    // represented leaves the row on its start alone.
    const length = ownEnd === null && durationField ? durationOf(row[durationField]) : null;
    const rowEnd = length === null ? ownEnd : durationEnd(start, startDay, allDay, length * UNIT_MS[durationUnit]);
    // An all-day row stored as instants runs to an exclusive end: its last day is the one before
    // the end instant, and never before its first.
    const lastDay = (v: Day | Date) => {
      const d = typeof v === "string" ? v : dayIn(clock, new Date(v.getTime() - 1));
      return d < startDay ? startDay : d;
    };
    const rowLanes = lanesOf ? lanesOf(row) : laneBy ? laneKeys(row[laneBy]) : undefined;
    const colors = colorsOf?.(row);
    const look = classNameOf?.(row);
    const status = statusOf?.(row);
    return [
      {
        key: String(encodeRecordKey(view.contract, row as T & DataRow)),
        title: view.summary(row as T & DataRow).title,
        start: allDay ? startDay : start,
        ...(rowEnd !== null ? { end: allDay ? lastDay(rowEnd) : rowEnd } : {}),
        allDay,
        ...(rowLanes ? { lanes: rowLanes } : {}),
        ...(colors ? { colors } : {}),
        ...(look ? { className: look } : {}),
        ...(status ? { status } : {}),
        row,
      },
    ];
  });
}
