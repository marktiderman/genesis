// CalendarEvents to an iCalendar feed (RFC 5545), so an app can publish what it schedules as a
// link people subscribe to. Every value is escaped and every line folded, so no text in an event
// can start a line of its own (and so a property or a component).
import { isDay } from "@marktiderman/genesis-core/dates";
import type { CalendarEvent } from "./types";

/** What `writeIcs` takes. @stability Beta */
export interface WriteIcsOptions {
  /** PRODID: who wrote the feed, `-//Acme//Schedule//EN`. */
  prodId: string;
  /** X-WR-CALNAME: the name a calendar app shows for the subscription. */
  calendarName?: string;
  /** DTSTAMP for every event. Default now. */
  now?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

const utc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** A TEXT value (RFC 5545 §3.3.11): `\`, `;` and `,` escaped, any line break as `\n`, other control characters dropped. */
function text(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

const encoder = new TextEncoder();

/** One content line folded at 75 octets (§3.1), never inside a UTF-8 character; each continuation starts with a space. */
function fold(line: string): string {
  if (encoder.encode(line).byteLength <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).byteLength;
    // The first line holds 75 octets; a continuation's leading space takes one of its 75.
    const room = parts.length ? 74 : 75;
    if (bytes + size > room) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * The start an occurrence was scheduled at, which RECURRENCE-ID names: for one `readIcs` read (its
 * `externalRef` is `<uid>|<original start>`), that original start, so a moved occurrence keeps
 * its identity; otherwise its start.
 */
function originalStart(e: CalendarEvent, uid: string): string | Date {
  const prefix = `${uid}|`;
  if (e.externalRef.startsWith(prefix)) {
    const key = e.externalRef.slice(prefix.length);
    if (typeof e.start === "string" ? isDay(key) : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(key)) return isDay(key) ? key : new Date(key);
  }
  return e.start;
}

// A day is written as a DATE; any other string is read as an instant, and one that isn't throws.
const dateValue = (t: string | Date, name: string) => {
  if (typeof t === "string" && isDay(t)) return `${name};VALUE=DATE:${t.replace(/-/g, "")}`;
  const d = typeof t === "string" ? new Date(t) : t;
  if (Number.isNaN(d.getTime())) throw new RangeError(`writeIcs: ${name} isn't a day or a valid time`);
  return `${name}:${utc(d)}`;
};

/**
 * An iCalendar feed of the events: one VEVENT each, with UID (`icalUid`, else
 * `<sourceId>-<externalRef>`), DTSTART and DTEND (UTC instants, or VALUE=DATE days with the
 * exclusive end), SUMMARY, LOCATION, STATUS (TENTATIVE or CONFIRMED), CLASS:PRIVATE for a private
 * event, and DTSTAMP. An occurrence of a series sharing its UID with others carries a
 * RECURRENCE-ID (the start it was scheduled at), so each occurrence stands on its own; the feed
 * writes occurrences, not rules. A second copy of the same occurrence is written once. Times are written in UTC, so
 * `timeZone` isn't kept.
 *
 * @stability Beta
 */
export function writeIcs(events: readonly CalendarEvent[], options: WriteIcsOptions): string {
  const stamp = utc(options.now ?? new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${text(options.prodId)}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (options.calendarName) lines.push(`X-WR-CALNAME:${text(options.calendarName)}`);
  const written = new Set<string>();
  for (const e of events) {
    const uid = e.icalUid ?? `${e.sourceId}-${e.externalRef}`;
    const recurrenceId = e.recurring && e.icalUid ? dateValue(originalStart(e, e.icalUid), "RECURRENCE-ID") : null;
    const id = `${uid}\u0000${recurrenceId ?? ""}`;
    if (written.has(id)) continue;
    written.add(id);
    lines.push("BEGIN:VEVENT", `UID:${text(uid)}`, `DTSTAMP:${stamp}`, dateValue(e.start, "DTSTART"), dateValue(e.end, "DTEND"));
    if (recurrenceId) lines.push(recurrenceId);
    lines.push(`SUMMARY:${text(e.title)}`);
    if (e.location) lines.push(`LOCATION:${text(e.location)}`);
    lines.push(`STATUS:${e.status === "tentative" ? "TENTATIVE" : "CONFIRMED"}`);
    if (e.visibility === "private") lines.push("CLASS:PRIVATE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
