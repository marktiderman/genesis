// The one shape every calendar source becomes: a provider, an iCal feed, or an app's own rows
// through an adapter. The occurrence itself is core/dates' `EventOccurrence`; this adds only
// where it came from.
import { isDay, type Day, type EventOccurrence } from "@marktiderman/genesis-core/dates";

/** One occurrence of an event on one source (a recurring event is one per occurrence). @stability Beta */
export interface CalendarEvent extends EventOccurrence {
  /** The source (one calendar or feed) it came from. */
  sourceId: string;
  /** The source's id for this occurrence, unique within the source. */
  externalRef: string;
  /** The iCalendar UID, the same on every attendee's copy: what merges an event across people. */
  icalUid: string | null;
  /** The repeating series this occurrence belongs to (the source's id for it), or null. */
  seriesRef: string | null;
}

/** Whether others may see an event's details. @stability Beta */
export type EventVisibility = EventOccurrence["visibility"];

/** A window of time: `from` inclusive, `to` exclusive. @stability Beta */
export interface TimeWindow {
  from: Date;
  to: Date;
}

/**
 * Turns an app's own rows (its sessions, its bookings) into events for a window: the seam any
 * source that isn't a provider or a feed plugs in through. Lives with the rows' package, which
 * depends on this one, never the reverse.
 *
 * @stability Beta
 */
export type CalendarSourceAdapter<Row> = (rows: readonly Row[], window: TimeWindow) => CalendarEvent[];

/** An event time as a day or an instant; an ISO string that isn't a day is read as an instant. */
export type EventTime = Day | Date;

/** Where an event time falls on the timeline (a day reads as UTC midnight), in ms. @stability Beta */
export function toTimeValue(t: EventTime | string): number {
  if (t instanceof Date) return t.getTime();
  return isDay(t) ? Date.parse(`${t}T00:00:00Z`) : Date.parse(t);
}

/**
 * One string per moment, whatever zone wrote it: an instant as UTC ISO
 * (`2026-11-05T23:00:00.000Z`), a day as `YYYY-MM-DD`. A timed copy written `18:00-05:00` and one
 * written `23:00Z` get the same key.
 *
 * @stability Beta
 */
export function toTimeKey(t: EventTime | string): string {
  if (t instanceof Date) return t.toISOString();
  if (isDay(t)) return t;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : t;
}

/** Whether the event touches the window. @stability Beta */
export function isInWindow(event: Pick<EventOccurrence, "start" | "end">, window: TimeWindow): boolean {
  const s = toTimeValue(event.start);
  const e = toTimeValue(event.end);
  const from = window.from.getTime();
  const to = window.to.getTime();
  // A moment (end = start) counts when it is inside the window.
  return s < to && (e > from || (e === s && s >= from));
}
