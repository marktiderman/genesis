// A merged event as genesis-ui's EventCalendar and PrintableAgenda take it, without importing
// genesis-ui (this package has no React). The shapes differ in one place: EventCalendar's all-day
// end is the last day (inclusive), core/dates' EventOccurrence's the day after (exclusive). Until
// EventCalendar takes EventOccurrence itself, this is the mapping.
import { addDays, type Day } from "@marktiderman/genesis-core/dates";
import type { MergedEvent, PersonEvent } from "./merge";

/** An event as EventCalendar draws it (its `CalendarEvent`, structurally). @stability Beta */
export interface CalendarDisplayEvent<E extends PersonEvent = PersonEvent> {
  key: string;
  title: string;
  start: Day | Date;
  /** All-day: the last day it covers (inclusive). Timed: the instant it ends (exclusive). */
  end: Day | Date;
  allDay: boolean;
  /** The people it belongs to: one lane (and dot) each. */
  lanes: readonly string[];
  /** The copy shown, handed back on select; absent for a busy block. */
  row?: E;
}

/** What `toCalendarEvent` takes. @stability Beta */
export interface ToCalendarEventOptions {
  /** The title of an event the viewer may only see as busy. Default "Busy". */
  busyTitle?: string;
}

/** A merged event for EventCalendar: people as lanes, a busy block's title replaced. @stability Beta */
export function toCalendarEvent<E extends PersonEvent>(merged: MergedEvent<E>, options: ToCalendarEventOptions = {}): CalendarDisplayEvent<E> {
  const { start, end, allDay } = merged;
  let last = end;
  if (allDay && typeof start === "string" && typeof end === "string") {
    const before = addDays(end, -1);
    last = before < start ? start : before;
  }
  const out: CalendarDisplayEvent<E> = {
    key: merged.key,
    title: merged.event ? merged.event.title : (options.busyTitle ?? "Busy"),
    start,
    end: last,
    allDay,
    lanes: merged.people,
  };
  if (merged.event) out.row = merged.event;
  return out;
}
