// Google Calendar's events, synced the way Google means them to be: one full read of a window with
// recurring events expanded by Google (singleEvents=true), then only what changed, with the sync
// token the last read handed back. A token Google no longer honours (410 Gone) starts a full read
// again. Pages are followed up to `maxPages`, and a read cut there can be resumed. Never logs or
// returns the access token, which comes from genesis-connect (this package does no OAuth).
//
// Google's incremental sync (https://developers.google.com/calendar/api/guides/sync): a request
// with `syncToken` can't also carry `timeMin`/`timeMax` (events.list,
// https://developers.google.com/calendar/api/v3/reference/events/list: those parameters "cannot
// be specified together with" a sync token), so its pages hold every change on the calendar,
// inside the window or not, and deleted events come back with `status: "cancelled"`. Both are
// handled here: a change outside the window, or a cancellation, is reported in `removed`, so a
// stored copy goes and nothing outside the window is kept. A cancelled item that isn't an
// instance of a series (no `recurringEventId`) may be a whole series deleted, so its id is also in
// `removedSeries`: delete the stored occurrences whose `seriesRef` it is.
import { isDay, type Day } from "@marktiderman/genesis-core/dates";
import { isInWindow, type CalendarEvent, type EventVisibility, type TimeWindow } from "./types";

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

/** How to read Google events. @stability Beta */
export interface GoogleEventOptions {
  /**
   * The visibility of an event left at the calendar's default (`visibility` absent or
   * `"default"`). Default `"public"`. Pass `"private"` for a calendar shared as free/busy only,
   * or whenever the calendar's own default isn't known to be public.
   */
  defaultVisibility?: EventVisibility;
}

/** Where a read cut at `maxPages` stopped, to pass back as `resume`. @stability Beta */
export interface GoogleSyncResume {
  pageToken: string;
  /** The sync token the cut read used (null: a full read of the window). */
  syncToken: string | null;
}

/** What `syncGoogleCalendar` takes. @stability Beta */
export interface GoogleSyncOptions extends GoogleEventOptions {
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
  /** Continue a read that stopped at `maxPages` (the last result's `resume`); `syncToken` is then ignored. */
  resume?: GoogleSyncResume | null;
  /** Pages read in one call (up to 2,500 events each). Default 100. */
  maxPages?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** What `syncGoogleCalendar` returns. @stability Beta */
export interface GoogleSyncResult {
  /**
   * A full read: once `complete`, `events` (with any earlier resumed parts) is every event in the
   * window, and the source's other stored events go. Otherwise only changes: upsert `events`,
   * remove `removed` and `removedSeries`.
   */
  full: boolean;
  /**
   * False when the read stopped at `maxPages`: apply `events`, `removed` and `removedSeries`
   * (for a full read, upsert only: delete nothing yet), keep no sync token, and call again with
   * `resume`.
   */
  complete: boolean;
  events: CalendarEvent[];
  /** `externalRef`s to remove: cancelled or deleted occurrences, and changes that moved outside the window. */
  removed: string[];
  /** Ids of cancelled items that may be whole series: remove the stored occurrences whose `seriesRef` is one of them. */
  removedSeries: string[];
  /** For the next read; null while `complete` is false. */
  syncToken: string | null;
  /** Where to continue when `complete` is false, else null. */
  resume: GoogleSyncResume | null;
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

function visibility(value: string | undefined, options: GoogleEventOptions): EventVisibility {
  if (value === "private" || value === "confidential") return "private";
  if (value === "public") return "public";
  // "default" or absent: the calendar's default, which Google doesn't say in the event.
  return options.defaultVisibility ?? "public";
}

/** One Google event as a CalendarEvent, or null when it is cancelled or unreadable. @stability Beta */
export function fromGoogleEvent(sourceId: string, e: GoogleEvent, options: GoogleEventOptions = {}): CalendarEvent | null {
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
    visibility: visibility(e.visibility, options),
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

async function read(options: GoogleSyncOptions, syncToken: string | null, startPage: string | undefined): Promise<GoogleSyncResult> {
  const doFetch = options.fetch ?? fetch;
  const maxPages = Math.max(1, options.maxPages ?? MAX_PAGES);
  const events: CalendarEvent[] = [];
  const removed: string[] = [];
  const removedSeries: string[] = [];
  let pageToken = startPage;
  for (let page = 0; page < maxPages; page++) {
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
      const event = fromGoogleEvent(options.sourceId, item, options);
      if (event && isInWindow(event, options.window)) events.push(event);
      // Cancelled, or changed to a time outside the window (an incremental page isn't bounded by it).
      else if (item.id && (event || item.status === "cancelled")) {
        removed.push(item.id);
        if (item.status === "cancelled" && !item.recurringEventId) removedSeries.push(item.id);
      }
    }
    if (body.nextPageToken) {
      pageToken = body.nextPageToken;
      continue;
    }
    return { full: !syncToken, complete: true, events, removed, removedSeries, syncToken: body.nextSyncToken ?? null, resume: null };
  }
  // Stopped at maxPages: keep what was read, and say where to go on.
  return { full: !syncToken, complete: false, events, removed, removedSeries, syncToken: null, resume: { pageToken: pageToken!, syncToken } };
}

/**
 * Reads what changed since the last token, or the whole window the first time (or when the token
 * expired). A read longer than `maxPages` returns what it read with `complete: false` and a
 * `resume` to pass back. Throws `GoogleCalendarError`.
 *
 * @stability Beta
 */
export async function syncGoogleCalendar(options: GoogleSyncOptions): Promise<GoogleSyncResult> {
  const token = options.resume ? options.resume.syncToken : options.syncToken || null;
  try {
    return await read(options, token, options.resume?.pageToken);
  } catch (error) {
    if (error instanceof Gone) return read(options, null, undefined);
    throw error;
  }
}
