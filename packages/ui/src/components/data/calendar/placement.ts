// Where calendar events land: the days a layout shows, and each event on every day it covers,
// all-day ones first. Pure, so web and native draw from the same placement.

import {
  addDays,
  addMonths,
  addWeeks,
  dayIn,
  eachDay,
  monthGridRange,
  weeksRange,
  type Day,
  type DayRange,
} from "@marktiderman/genesis-core/dates";

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
