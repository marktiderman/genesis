/**
 * @marktiderman/genesis-calendar: the calendar read layer. What is on these people's calendars,
 * merged: Google Calendar's incremental sync, an iCal feed reader (recurrence through
 * core/dates), an iCal feed writer, merging one event across people with per-viewer privacy,
 * marks, and the mapping to genesis-ui's EventCalendar. Pure TypeScript: no storage, no OAuth,
 * no React. Fetching a feed is the optional `/fetch` entry.
 *
 * @packageDocumentation
 */
export {
  isInWindow,
  toTimeKey,
  toTimeValue,
  type CalendarEvent,
  type CalendarSourceAdapter,
  type EventTime,
  type EventVisibility,
  type TimeWindow,
} from "./types";
export type { EventOccurrence } from "@marktiderman/genesis-core/dates";
export {
  fromGoogleEvent,
  GoogleCalendarError,
  isGoogleCalendarError,
  syncGoogleCalendar,
  type GoogleCalendarErrorCode,
  type GoogleEvent,
  type GoogleEventOptions,
  type GoogleSyncOptions,
  type GoogleSyncResult,
  type GoogleSyncResume,
  type GoogleTime,
} from "./google";
export { parseDuration, parseIcs, readIcs, type IcsComponent, type IcsProperty, type ParseIcsOptions, type ReadIcsOptions, type ReadIcsResult } from "./ics";
export { writeIcs, type WriteIcsOptions } from "./write";
export { resolveZone } from "./zones";
export { mergeEvents, occurrenceKey, seriesKey, toBusyKey, type EventKeyFields, type MergedEvent, type MergeOptions, type PersonEvent } from "./merge";
export { applyMarks, markKey, MARK_KINDS, type EventMark, type MarkedEvent, type MarkKind } from "./marks";
export { toCalendarEvent, type CalendarDisplayEvent, type ToCalendarEventOptions } from "./display";
export { syncWindow, SYNC_DAYS_AHEAD, SYNC_DAYS_BACK } from "./window";
