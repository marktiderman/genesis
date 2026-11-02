// Reads an iCalendar feed (RFC 5545), as a calendar's secret iCal link serves it, into one
// CalendarEvent per occurrence inside a window: RRULE expanded by core/dates' expandRecurrence,
// EXDATE and RDATE honoured, RECURRENCE-ID overrides put in place of the occurrence they replace,
// and TZID read as IANA, Windows or vendor-prefixed names (zones.ts). Cancelled occurrences are
// left out. The feed's text is the caller's to fetch (fetchFeed in ./fetch, or anything else).
import { addDays, expandRecurrence, instantIn, isDay, wallTimeIn, type Day, type DayRange } from "@marktiderman/genesis-core/dates";
import { isInWindow, toTimeValue, type CalendarEvent, type TimeWindow } from "./types";
import { resolveZone } from "./zones";

const DAY_MS = 86_400_000;
/** The longest event read: ten years. */
const MAX_LENGTH_MS = 3653 * DAY_MS;

/** One content line: `NAME;PARAM=value:value`. @stability Beta */
export interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** A component (VCALENDAR, VEVENT, VTIMEZONE…) with its properties and the components inside it. @stability Beta */
export interface IcsComponent {
  type: string;
  properties: IcsProperty[];
  components: IcsComponent[];
}

/** What `parseIcs` takes. @stability Beta */
export interface ParseIcsOptions {
  /** Components nested deeper than this are skipped, with everything inside them. Default 8 (a feed needs 3). */
  maxDepth?: number;
}

/**
 * Splits a feed into its components (VCALENDAR, VEVENT, ...), lines unfolded and parameters read.
 * Lenient: a line that isn't a property is skipped, an END with no BEGIN is ignored, and a
 * component left open is closed at the end.
 *
 * @stability Beta
 */
export function parseIcs(text: string, options: ParseIcsOptions = {}): IcsComponent[] {
  const maxDepth = options.maxDepth ?? 8;
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const root: IcsComponent = { type: "ROOT", properties: [], components: [] };
  const stack: IcsComponent[] = [root];
  // How deep inside a skipped (too deeply nested) component we are.
  let skipping = 0;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const prop = parseLine(raw);
    if (!prop) continue;
    if (skipping) {
      if (prop.name === "BEGIN") skipping++;
      else if (prop.name === "END") skipping--;
      continue;
    }
    const top = stack[stack.length - 1]!;
    if (prop.name === "BEGIN") {
      if (stack.length > maxDepth) {
        skipping = 1;
        continue;
      }
      const c: IcsComponent = { type: prop.value.trim().toUpperCase(), properties: [], components: [] };
      top.components.push(c);
      stack.push(c);
    } else if (prop.name === "END") {
      if (stack.length > 1) stack.pop();
    } else {
      top.properties.push(prop);
    }
  }
  return root.components;
}

function parseLine(line: string): IcsProperty | null {
  // NAME;PARAM=a;PARAM="b:c":value — the first colon outside quotes ends the name and parameters.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments: string[] = [];
  let current = "";
  inQuotes = false;
  for (const ch of head) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === ";" && !inQuotes) {
      segments.push(current);
      current = "";
    } else current += ch;
  }
  segments.push(current);
  const [name, ...rest] = segments;
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").trim().toUpperCase(), params, value };
}

const unescapeText = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

const prop = (c: IcsComponent, name: string) => c.properties.find((p) => p.name === name);
const props = (c: IcsComponent, name: string) => c.properties.filter((p) => p.name === name);

/** A DATE or DATE-TIME value: a day, or a wall time on a zone's clock. */
interface IcsTime {
  day: boolean;
  /** The wall clock's fields as Date.UTC gives them (a day is its midnight), so arithmetic never crosses a daylight-saving jump. */
  wall: number;
  zone: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const dayString = (wall: number): Day => {
  const d = new Date(wall);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const timeString = (wall: number) => {
  const d = new Date(wall);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
const timeOfDay = (wall: number) => ((wall % DAY_MS) + DAY_MS) % DAY_MS;
const dayWall = (day: Day) => Date.parse(`${day}T00:00:00Z`);

function readTimeValue(value: string, params: Record<string, string>, defaultZone: string): IcsTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!isDay(`${y}-${mo}-${d}`) || +y! < 1000) return null;
  if (h === undefined || params["VALUE"] === "DATE") return { day: true, wall: Date.UTC(+y!, +mo! - 1, +d!), zone: "UTC" };
  if (+h > 23 || +mi! > 59 || +(s ?? 0) > 59) return null;
  const wall = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!, +(s ?? 0));
  if (z) return { day: false, wall, zone: "UTC" };
  return { day: false, wall, zone: resolveZone(params["TZID"]) ?? defaultZone };
}

const toInstant = (t: IcsTime) => (t.day || t.zone === "UTC" ? t.wall : instantIn(dayString(t.wall), timeString(t.wall), t.zone).getTime());
const eventTime = (t: IcsTime): Day | Date => (t.day ? dayString(t.wall) : new Date(toInstant(t)));
/** One key for the same moment whatever zone wrote it: what EXDATE and RECURRENCE-ID match on. */
const momentKey = (t: IcsTime) => (t.day ? dayString(t.wall) : new Date(toInstant(t)).toISOString());

/** An iCalendar DURATION (P1D, PT1H30M, -PT15M, P2W) in ms, or null. @stability Beta */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 24 * 3600 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

interface ReadEvent {
  uid: string;
  start: IcsTime;
  /** Length: wall ms for days and zoned times (so a 9-10 event stays 9-10 across a DST change). */
  length: number;
  title: string;
  location: string | null;
  private: boolean;
  status: "confirmed" | "tentative" | "cancelled";
  rrule: string | null;
  exdates: Set<string>;
  rdates: IcsTime[];
  recurrenceId: IcsTime | null;
}

function readEvent(c: IcsComponent, defaultZone: string, index: number): ReadEvent | null {
  const dtstart = prop(c, "DTSTART");
  const start = dtstart ? readTimeValue(dtstart.value, dtstart.params, defaultZone) : null;
  if (!start) return null;
  const dtend = prop(c, "DTEND");
  const end = dtend ? readTimeValue(dtend.value, dtend.params, start.zone) : null;
  const duration = prop(c, "DURATION");
  let length: number;
  if (end) {
    length = end.day === start.day && end.zone === start.zone ? end.wall - start.wall : toInstant(end) - toInstant(start);
  } else if (duration) {
    length = parseDuration(duration.value) ?? 0;
  } else {
    length = start.day ? DAY_MS : 0;
  }
  // A length no calendar means (P99999999999999999999W, or an end centuries away) skips the event.
  if (!Number.isFinite(length) || length > MAX_LENGTH_MS) return null;
  if (length < 0) length = 0;
  if (start.day && length < DAY_MS) length = DAY_MS;

  const exdates = new Set<string>();
  for (const p of props(c, "EXDATE")) {
    for (const v of p.value.split(",")) {
      const t = readTimeValue(v, p.params, start.zone);
      if (t) exdates.add(momentKey(t));
    }
  }
  const rdates: IcsTime[] = [];
  for (const p of props(c, "RDATE")) {
    if (p.params["VALUE"] === "PERIOD") continue;
    for (const v of p.value.split(",")) {
      const t = readTimeValue(v, p.params, start.zone);
      if (t) rdates.push(t);
    }
  }
  const rid = prop(c, "RECURRENCE-ID");
  const status = (prop(c, "STATUS")?.value ?? "").trim().toUpperCase();
  const klass = (prop(c, "CLASS")?.value ?? "").trim().toUpperCase();
  return {
    // A feed without UIDs still gets a stable key per event.
    uid: unescapeText(prop(c, "UID")?.value ?? "").trim().slice(0, 500) || `no-uid-${index}-${start.wall}`,
    start,
    length,
    title: unescapeText(prop(c, "SUMMARY")?.value ?? "").trim().slice(0, 500),
    location: unescapeText(prop(c, "LOCATION")?.value ?? "").trim().slice(0, 500) || null,
    private: klass === "PRIVATE" || klass === "CONFIDENTIAL",
    status: status === "CANCELLED" ? "cancelled" : status === "TENTATIVE" ? "tentative" : "confirmed",
    rrule: prop(c, "RRULE")?.value.trim() || null,
    exdates,
    rdates,
    recurrenceId: rid ? readTimeValue(rid.value, rid.params, start.zone) : null,
  };
}

function occurrence(sourceId: string, e: ReadEvent, start: IcsTime, originalKey: string | null, recurring: boolean): CalendarEvent {
  const end: IcsTime = { ...start, wall: start.wall + e.length };
  return {
    sourceId,
    externalRef: originalKey ? `${e.uid}|${originalKey}` : e.uid,
    icalUid: e.uid,
    seriesRef: recurring ? e.uid : null,
    title: e.title,
    location: e.location,
    allDay: start.day,
    start: eventTime(start),
    end: eventTime(end),
    timeZone: start.day || start.zone === "UTC" ? null : start.zone,
    recurring,
    visibility: e.private ? "private" : "public",
    status: e.status === "tentative" ? "tentative" : "confirmed",
  };
}

/**
 * The series' occurrence starts in (a margin around) the window, through core/dates. A rule
 * core/dates refuses (BYSETPOS, BYHOUR, sub-daily frequencies, COUNT with UNTIL…) gives the first
 * occurrence only, reported as unexpanded rather than guessed.
 */
function seriesStarts(e: ReadEvent, rrule: string, window: TimeWindow, limit: number): { starts: IcsTime[]; truncated: boolean; unexpanded: boolean } {
  // Widen by the event's length (plus a day either side for zones) to catch occurrences that
  // started before the window and still run into it.
  const margin = e.length + 2 * DAY_MS;
  const from = window.from.getTime() - margin;
  const to = window.to.getTime();
  const range: DayRange = e.start.day
    ? { start: dayString(from), end: addDays(dayString(to), 2) }
    : { start: wallTimeIn(e.start.zone, new Date(from)).day, end: addDays(wallTimeIn(e.start.zone, new Date(to)).day, 2) };
  const exdates: (Day | Date)[] = [];
  for (const key of e.exdates) {
    if (isDay(key)) exdates.push(key);
    else if (!e.start.day) exdates.push(new Date(key));
  }
  try {
    const result = expandRecurrence({
      rule: rrule,
      start: e.start.day ? dayString(e.start.wall) : { day: dayString(e.start.wall), time: timeString(e.start.wall), timeZone: e.start.zone },
      exdates,
      window: range,
      limit,
    });
    const clock = timeOfDay(e.start.wall);
    const starts = result.occurrences.map((o): IcsTime => ({ ...e.start, wall: dayWall(o.day) + (e.start.day ? 0 : clock) }));
    return { starts, truncated: result.truncated, unexpanded: false };
  } catch (error) {
    if (error instanceof RangeError) return { starts: [e.start], truncated: false, unexpanded: true };
    throw error;
  }
}

/** An occurrence, or null when its times can't be written (a guard: readEvent refuses those first). */
function occurrenceOrNull(...args: Parameters<typeof occurrence>): CalendarEvent | null {
  try {
    return occurrence(...args);
  } catch {
    return null;
  }
}

/** seriesStarts, with any unexpected failure read as an unexpanded rule. */
function seriesStartsOrFirst(...args: Parameters<typeof seriesStarts>): ReturnType<typeof seriesStarts> {
  try {
    return seriesStarts(...args);
  } catch {
    return { starts: [args[0].start], truncated: false, unexpanded: true };
  }
}

/** What `readIcs` takes. @stability Beta */
export interface ReadIcsOptions {
  sourceId: string;
  window: TimeWindow;
  /** The zone for floating times when the feed names none (X-WR-TIMEZONE). Default UTC. */
  defaultZone?: string;
  /** The largest feed read, in UTF-8 bytes; a larger one throws a RangeError. Default 5 MiB. */
  maxBytes?: number;
  /** VEVENTs read; the rest are left out and `truncated` is set. Default 10,000. */
  maxEvents?: number;
  /** Occurrences one series gives in the window (core/dates' `limit`). Default 1,000. */
  maxOccurrencesPerSeries?: number;
  /** Occurrences returned in all. Default 50,000. */
  maxOccurrences?: number;
}

/** What `readIcs` returns. @stability Beta */
export interface ReadIcsResult {
  /** Every occurrence in the window, in start order, cancelled ones left out. */
  events: CalendarEvent[];
  /** Some were left out: a series past `maxOccurrencesPerSeries`, or the feed past `maxEvents` or `maxOccurrences`. */
  truncated: boolean;
  /**
   * UIDs of series whose RRULE core/dates doesn't expand (BYSETPOS, BYHOUR…): each shows its first
   * occurrence, its RDATEs and its overrides, never a guessed pattern.
   */
  unexpanded: string[];
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function utf8Length(text: string, cap: number): number {
  // UTF-16 units never outnumber UTF-8 bytes, and never exceed a third of them.
  if (text.length > cap || text.length * 3 <= cap) return text.length;
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Every occurrence of every event in the feed that touches the window. Throws a RangeError for a
 * feed over `maxBytes`; everything else malformed is skipped, never thrown.
 *
 * @stability Beta
 */
export function readIcs(text: string, options: ReadIcsOptions): ReadIcsResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const bytes = utf8Length(text, maxBytes);
  if (bytes > maxBytes) throw new RangeError(`readIcs: the feed is over the ${maxBytes}-byte limit`);
  const maxEvents = options.maxEvents ?? 10_000;
  const perSeries = options.maxOccurrencesPerSeries ?? 1_000;
  const maxOccurrences = options.maxOccurrences ?? 50_000;
  const { window, sourceId } = options;
  const fallbackZone = resolveZone(options.defaultZone) ?? "UTC";

  const out: CalendarEvent[] = [];
  const refs = new Set<string>();
  const unexpanded: string[] = [];
  let truncated = false;
  let readCount = 0;
  // COUNT rules are walked from their first occurrence, however far before the window: a feed's
  // counted rules share this budget, and a rule past it is reported as unexpanded.
  let countBudget = 1_000_000;
  /** Adds an occurrence in the window; false once the total cap is reached. */
  const push = (ev: CalendarEvent): boolean => {
    if (!isInWindow(ev, window) || refs.has(ev.externalRef)) return true;
    if (out.length >= maxOccurrences) {
      truncated = true;
      return false;
    }
    out.push(ev);
    refs.add(ev.externalRef);
    return true;
  };

  feeds: for (const cal of parseIcs(text).filter((c) => c.type === "VCALENDAR")) {
    const zone = resolveZone(prop(cal, "X-WR-TIMEZONE")?.value) ?? fallbackZone;
    const events: ReadEvent[] = [];
    for (const c of cal.components) {
      if (c.type !== "VEVENT") continue;
      if (readCount >= maxEvents) {
        truncated = true;
        break;
      }
      readCount++;
      // Never throw on a hostile feed: an event that can't be read is skipped (a guard behind
      // the checks in readEvent, which should already have refused it).
      let e: ReadEvent | null = null;
      try {
        e = readEvent(c, zone, readCount);
      } catch {
        e = null;
      }
      if (e) events.push(e);
    }

    // Overrides by UID, keyed by the moment of the occurrence they replace.
    const overrides = new Map<string, Map<string, ReadEvent>>();
    const masters = new Map<string, ReadEvent>();
    for (const e of events) {
      if (!e.recurrenceId) {
        if (!masters.has(e.uid)) masters.set(e.uid, e);
        continue;
      }
      let byMoment = overrides.get(e.uid);
      if (!byMoment) overrides.set(e.uid, (byMoment = new Map()));
      byMoment.set(momentKey(e.recurrenceId), e);
    }

    for (const e of events) {
      if (e.recurrenceId) continue;
      const own = overrides.get(e.uid);
      if (!e.rrule && !e.rdates.length) {
        if (e.status === "cancelled") continue;
        const ev = occurrenceOrNull(sourceId, e, e.start, null, false);
        if (ev && !push(ev)) break feeds;
        continue;
      }
      let starts: IcsTime[] = [e.start];
      const count = e.rrule ? Number(/(?:^|;)COUNT=(\d+)/i.exec(e.rrule)?.[1] ?? 0) : 0;
      if (e.rrule && count > countBudget) unexpanded.push(e.uid);
      else if (e.rrule) {
        countBudget -= count;
        const expanded = seriesStartsOrFirst(e, e.rrule, window, perSeries);
        starts = expanded.starts;
        if (expanded.truncated) truncated = true;
        if (expanded.unexpanded) unexpanded.push(e.uid);
      }
      const rdates = e.rdates.slice(0, perSeries);
      if (rdates.length < e.rdates.length) truncated = true;
      const seen = new Set<string>();
      for (const start of [...starts, ...rdates]) {
        const key = momentKey(start);
        if (seen.has(key)) continue;
        seen.add(key);
        if (e.exdates.has(key)) continue;
        const override = own?.get(key);
        if (override) {
          own!.delete(key);
          if (override.status === "cancelled") continue;
          // A moved occurrence of a private series stays private, whatever the override says.
          const moved = occurrenceOrNull(sourceId, { ...override, uid: e.uid, private: override.private || e.private }, override.start, key, true);
          if (moved && !push(moved)) break feeds;
          continue;
        }
        if (e.status === "cancelled") continue;
        const ev = occurrenceOrNull(sourceId, e, start, key, true);
        if (ev && !push(ev)) break feeds;
      }
    }

    // Overrides whose original occurrence the expansion didn't give (moved from outside the
    // window, or a master the feed left out) still stand on their own.
    for (const [uid, byMoment] of overrides) {
      const master = masters.get(uid);
      if (master && !master.rrule && !master.rdates.length) continue;
      for (const [key, override] of byMoment) {
        if (override.status === "cancelled") continue;
        const ev = occurrenceOrNull(sourceId, { ...override, private: override.private || Boolean(master?.private) }, override.start, key, true);
        if (ev && !push(ev)) break feeds;
      }
    }
  }
  out.sort((a, b) => toTimeValue(a.start) - toTimeValue(b.start));
  return { events: out, truncated, unexpanded };
}
