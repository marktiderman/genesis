// Google Calendar's events, synced the way Google means them to be: one full read of a window with
// recurring events expanded by Google (singleEvents=true), then only what changed, with the sync
// token the last read handed back. A token Google no longer honours (410 Gone) starts a full read
// again. Pages are followed to the end. Never logs or returns the access token, which comes from
// genesis-connect (this package does no OAuth).
//
// Google's incremental sync (https://developers.google.com/calendar/api/guides/sync): a request
// with `syncToken` can't also carry `timeMin`/`timeMax` (events.list,
// https://developers.google.com/calendar/api/v3/reference/events/list: those parameters "cannot
// be specified together with" a sync token), so its pages hold every change on the calendar,
// inside the window or not, and deleted events come back with `status: "cancelled"`. Both are
// handled here: a change outside the window, or a cancellation, is reported in `removed`, so a
// stored copy goes and nothing outside the window is kept.
import { isDay, type Day } from "@marktiderman/genesis-core/dates";
import { isInWindow, type CalendarEvent, type TimeWindow } from "./types";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MAX_PAGES = 100;

/** Why a Google Calendar read failed. @stability Beta */
export type GoogleCalendarErrorCode =
  /** The access token was refused: get a new one (or the grant is gone). */
  | "unauthorized"
  /** The calendar is no longer readable with this account (unshared, deleted). */
  | "forbidden"
  | "not_found"
  /** Google is busy or failing: try again later. */
  | "unavailable"
  | "bad_response";

/** A Google Calendar read that failed, with why. Its message never holds the token. @stability Beta */
export class GoogleCalendarError extends Error {
  readonly code: GoogleCalendarErrorCode;
  readonly status: number | null;
  constructor(code: GoogleCalendarErrorCode, status: number | null) {
    super(`Google Calendar: ${code}${status ? ` (${status})` : ""}`);
    this.name = "GoogleCalendarError";
    this.code = code;
    this.status = status;
  }
}

/** @stability Beta */
export const isGoogleCalendarError = (e: unknown): e is GoogleCalendarError => e instanceof GoogleCalendarError;

/** What `syncGoogleCalendar` takes. @stability Beta */
export interface GoogleSyncOptions {
  /** From genesis-connect's `accessToken`, with a read-only calendar scope. */
  accessToken: string;
  /** Google's calendar id. */
  calendarId: string;
  /** The source the events are kept under. */
  sourceId: string;
  /** The last read's token; absent for the first read. */
  syncToken?: string | null;
  /** The window kept: a full read asks Google for it, an incremental one filters to it. */
  window: TimeWindow;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** What `syncGoogleCalendar` returns. @stability Beta */
export interface GoogleSyncResult {
  /**
   * A full read: `events` is every event in the window, and the source's other stored events go.
   * Otherwise only changes: upsert `events`, remove `removed`.
   */
  full: boolean;
  events: CalendarEvent[];
  /** `externalRef`s to remove: cancelled or deleted occurrences, and changes that moved outside the window. */
  removed: string[];
  /** For the next read. */
  syncToken: string | null;
}

/** A start or end as Google's API writes it. @stability Beta */
export interface GoogleTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

/** The fields of a Google Calendar event this package reads. @stability Beta */
export interface GoogleEvent {
  id?: string;
  status?: string;
  iCalUID?: string;
  recurringEventId?: string;
  summary?: string;
  location?: string;
  visibility?: string;
  start?: GoogleTime;
  end?: GoogleTime;
}

function time(t: GoogleTime | undefined): Day | Date | null {
  if (t?.date && isDay(t.date)) return t.date;
  if (t?.dateTime) {
    const ms = Date.parse(t.dateTime);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return null;
}

/** One Google event as a CalendarEvent, or null when it is cancelled or unreadable. @stability Beta */
export function fromGoogleEvent(sourceId: string, e: GoogleEvent): CalendarEvent | null {
  if (!e.id || e.status === "cancelled") return null;
  const start = time(e.start);
  const end = time(e.end) ?? start;
  if (!start || !end) return null;
  const allDay = typeof start === "string";
  // A day start with an instant end (or the reverse) isn't an event Google writes.
  if (allDay !== (typeof end === "string")) return null;
  return {
    sourceId,
    externalRef: e.id,
    icalUid: e.iCalUID ?? null,
    seriesRef: e.recurringEventId ?? null,
    title: (e.summary ?? "").slice(0, 500),
    location: e.location ? e.location.slice(0, 500) : null,
    allDay,
    start,
    end,
    timeZone: allDay ? null : (e.start?.timeZone ?? null),
    recurring: Boolean(e.recurringEventId),
    visibility: e.visibility === "private" || e.visibility === "confidential" ? "private" : "public",
    status: e.status === "tentative" ? "tentative" : "confirmed",
  };
}

function failure(status: number): GoogleCalendarError {
  if (status === 401) return new GoogleCalendarError("unauthorized", status);
  if (status === 403) return new GoogleCalendarError("forbidden", status);
  if (status === 404) return new GoogleCalendarError("not_found", status);
  if (status === 429 || status >= 500) return new GoogleCalendarError("unavailable", status);
  return new GoogleCalendarError("bad_response", status);
}

class Gone extends Error {}

async function read(options: GoogleSyncOptions, syncToken: string | null): Promise<GoogleSyncResult> {
  const doFetch = options.fetch ?? fetch;
  const events: CalendarEvent[] = [];
  const removed: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(options.calendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "2500");
    if (syncToken) {
      url.searchParams.set("syncToken", syncToken);
    } else {
      url.searchParams.set("timeMin", options.window.from.toISOString());
      url.searchParams.set("timeMax", options.window.to.toISOString());
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { authorization: `Bearer ${options.accessToken}`, accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
    } catch {
      throw new GoogleCalendarError("unavailable", null);
    }
    if (res.status === 410 && syncToken) throw new Gone();
    if (!res.ok) throw failure(res.status);
    const body = (await res.json().catch(() => null)) as { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string } | null;
    if (!body || typeof body !== "object") throw new GoogleCalendarError("bad_response", res.status);
    for (const item of Array.isArray(body.items) ? body.items : []) {
      const event = fromGoogleEvent(options.sourceId, item);
      if (event && isInWindow(event, options.window)) events.push(event);
      // Cancelled, or changed to a time outside the window (an incremental page isn't bounded by it).
      else if (item.id && (event || item.status === "cancelled")) removed.push(item.id);
    }
    if (body.nextPageToken) {
      pageToken = body.nextPageToken;
      continue;
    }
    return { full: !syncToken, events, removed, syncToken: body.nextSyncToken ?? null };
  }
  throw new GoogleCalendarError("bad_response", null);
}

/**
 * Reads what changed since the last token, or the whole window the first time (or when the token
 * expired). Throws `GoogleCalendarError`.
 *
 * @stability Beta
 */
export async function syncGoogleCalendar(options: GoogleSyncOptions): Promise<GoogleSyncResult> {
  const token = options.syncToken || null;
  try {
    return await read(options, token);
  } catch (error) {
    if (error instanceof Gone) return read(options, null);
    throw error;
  }
}
