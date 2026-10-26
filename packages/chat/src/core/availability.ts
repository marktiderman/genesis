/**
 * @feat:chat
 * Availability, the same on every platform: is someone inside their working hours (read in
 * their own time zone), are they away, and the one line a thread shows about it ("Mark
 * replies Mon–Fri, 9–5 (Eastern)", "Away until Monday: Back Monday"). Pure: `now` is passed
 * in, and time zones come from Intl.
 */
import type { ChatAvailability, Weekday, WorkingHours } from "./types";

export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const SHORT: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** "09:30" → 570; a bad value → null. "24:00" is allowed as the end of a day. */
export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** The weekday and minute of the day at `now` in `timeZone` (the device's zone when null or unknown). */
export function localClock(now: Date, timeZone?: string | null): { day: Weekday; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase() as Weekday;
  const hour = Number(get("hour")) % 24;
  return { day: WEEKDAYS.includes(day) ? day : "mon", minutes: hour * 60 + Number(get("minute")) };
}

/**
 * Is `now` inside these working hours, read in `timeZone`? No hours set means always.
 * A range whose end is at or before its start runs overnight into the next day
 * (`fri: [["22:00","02:00"]]` covers Friday 22:00 to Saturday 02:00).
 */
export function isWithinWorkingHours(hours: WorkingHours | null | undefined, timeZone: string | null | undefined, now: Date = new Date()): boolean {
  if (!hours || WEEKDAYS.every((d) => !hours[d]?.length)) return true;
  const { day, minutes } = localClock(now, timeZone);
  const yesterday = WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7]!;
  for (const [from, to] of hours[day] ?? []) {
    const a = minutesOf(from);
    const b = minutesOf(to);
    if (a == null || b == null) continue;
    if (b > a ? minutes >= a && minutes < b : minutes >= a) return true;
  }
  for (const [from, to] of hours[yesterday] ?? []) {
    const a = minutesOf(from);
    const b = minutesOf(to);
    if (a == null || b == null) continue;
    if (b <= a && minutes < b) return true;
  }
  return false;
}

/** Away now: an away message with no end date, or an end date still ahead. */
export function isAway(a: Pick<ChatAvailability, "awayMessage" | "awayUntil"> | null | undefined, now: Date = new Date()): boolean {
  if (!a) return false;
  if (a.awayUntil) return Date.parse(a.awayUntil) > now.getTime();
  return Boolean(a.awayMessage?.trim());
}

/** "9", "9:30", "5" (12-hour, no am/pm: the range reads "9–5"). */
function clock(hhmm: string): string {
  const total = minutesOf(hhmm) ?? 0;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}` : String(h12);
}

/** "Mon–Fri, 9–5", "Mon–Thu, 9–5; Fri, 9–1". Days with the same hours are grouped. Empty when none. */
export function hoursSummary(hours: WorkingHours | null | undefined): string {
  if (!hours) return "";
  const key = (d: Weekday) => (hours[d] ?? []).map(([a, b]) => `${clock(a)}–${clock(b)}`).join(", ");
  const runs: { from: Weekday; to: Weekday; text: string }[] = [];
  for (const d of WEEKDAYS) {
    const text = key(d);
    if (!text) continue;
    const last = runs[runs.length - 1];
    if (last && last.text === text && WEEKDAYS.indexOf(last.to) === WEEKDAYS.indexOf(d) - 1) last.to = d;
    else runs.push({ from: d, to: d, text });
  }
  return runs
    .map((r) => {
      const days = r.from === r.to ? SHORT[r.from] : WEEKDAYS.indexOf(r.to) - WEEKDAYS.indexOf(r.from) === 1 ? `${SHORT[r.from]}, ${SHORT[r.to]}` : `${SHORT[r.from]}–${SHORT[r.to]}`;
      return `${days}, ${r.text}`;
    })
    .join("; ");
}

/** "Eastern" for America/New_York (the zone's generic name, less " Time"); the city when Intl has no name. */
export function timeZoneLabel(timeZone: string | null | undefined, locale = "en-US"): string {
  if (!timeZone) return "";
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    if (name && !/^GMT|^UTC/.test(name)) return name.replace(/ Time$/, "");
  } catch {
    // an unknown zone: fall through
  }
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}

/** "3:00 PM" today, "Monday" within the week, else "12 Mar". */
export function untilLabel(iso: string, now: Date = new Date(), locale?: string, timeZone?: string | null): string {
  const d = new Date(iso);
  const tz = timeZone || undefined;
  const dayKey = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  if (dayKey(d) === dayKey(now)) return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: tz });
  const days = (d.getTime() - now.getTime()) / 86_400_000;
  if (days < 7) return d.toLocaleDateString(locale, { weekday: "long", timeZone: tz });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: tz });
}

export interface AwayLineOptions {
  now?: Date;
  locale?: string;
  /** Show the hours line even inside working hours (a profile, not a banner). */
  always?: boolean;
}

/**
 * The line a thread shows about someone, or null when they are around:
 * - away with a date: "Away until Monday: Back Monday" (the away message after the colon);
 * - away with no date: "Mark is away: On a retreat";
 * - outside working hours: "Mark replies Mon–Fri, 9–5 (Eastern)".
 */
export function awayLine(a: ChatAvailability | null | undefined, name: string, opts: AwayLineOptions = {}): string | null {
  if (!a) return null;
  const now = opts.now ?? new Date();
  const message = a.awayMessage?.trim();
  if (isAway(a, now)) {
    if (a.awayUntil) return `Away until ${untilLabel(a.awayUntil, now, opts.locale, a.timeZone)}${message ? `: ${message}` : ""}`;
    return `${name} is away${message ? `: ${message}` : ""}`;
  }
  const summary = hoursSummary(a.hours);
  if (!summary) return null;
  if (!opts.always && isWithinWorkingHours(a.hours, a.timeZone, now)) return null;
  const zone = timeZoneLabel(a.timeZone, opts.locale);
  return `${name} replies ${summary}${zone ? ` (${zone})` : ""}`;
}

/** "Sam", "Sam and Lee", "Sam, Lee and 3 others": at most two names. */
export function namesLine(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest === 1 ? "1 other" : `${rest} others`}`;
}

/**
 * The line for several people (a group's members): one person's full `awayLine`, or for more
 * "Sam and Lee are away", "Sam, Lee and 2 others are outside their hours", or "… are away or
 * outside their hours" when it's a mix. Null when everyone is around.
 */
export function awaySummary(people: { availability: ChatAvailability | null | undefined; name: string }[], opts: AwayLineOptions = {}): string | null {
  const now = opts.now ?? new Date();
  const out = people.filter((p) => awayLine(p.availability, p.name, { ...opts, now, always: false }) !== null);
  if (out.length === 0) return null;
  if (out.length === 1) return awayLine(out[0]!.availability, out[0]!.name, { ...opts, now, always: false });
  const away = out.filter((p) => isAway(p.availability, now)).length;
  const what = away === out.length ? "away" : away === 0 ? "outside their hours" : "away or outside their hours";
  return `${namesLine(out.map((p) => p.name))} are ${what}`;
}
