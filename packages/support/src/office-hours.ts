/**
 * A help desk's office hours, and whether someone is in: platform-neutral, for the messenger's
 * reply expectation on the web (`SupportMessenger`'s `officeHours`) and on a phone
 * (`createSupport`'s `officeHours`).
 */

/** When someone answers, in the help desk's own time zone. */
export interface OfficeHours {
  /** The IANA zone the hours are in ("America/New_York"). */
  timeZone: string;
  /** Spans of a day: `days` 0 (Sunday) to 6 (Saturday), `open` and `close` as "HH:MM" from "00:00" to "24:00", close after open on the same day. A span it can't read is left out. */
  hours: readonly { days: readonly number[]; open: string; close: string }[];
}

export interface OfficeHoursState {
  /**
   * Someone is in now. True when the hours can't be read (an unknown zone, a bad time, or a
   * JavaScript engine whose `Intl` can't do time zones): never say "away" by mistake. In a
   * development build, an engine or zone it can't use is also said with `console.warn`, once.
   */
  open: boolean;
  /** When someone is next in, while they're away; null when open or never. */
  nextOpen: Date | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const minutesOf = (time: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  // "24:00" is the end of the day; nothing later is a time.
  return min < 60 && (h < 24 || (h === 24 && min === 0)) ? h * 60 + min : null;
};

interface Zoned {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
}

/**
 * The date and time in the zone. Throws when the engine can't say: an unknown zone, or an `Intl`
 * without time zones (some phone engines have none, or ignore the option), which would otherwise
 * give the device's own time and a wrong "away".
 */
function zoned(date: Date, timeZone: string): Zoned {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  if (!format.resolvedOptions().timeZone) throw new Error("this JavaScript engine's Intl.DateTimeFormat has no time zone support");
  const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  const z = {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    weekday: WEEKDAYS.indexOf(String(parts["weekday"])),
    minutes: (Number(parts["hour"]) % 24) * 60 + Number(parts["minute"]),
  };
  if (z.weekday < 0 || ![z.year, z.month, z.day, z.minutes].every(Number.isFinite)) throw new Error("Intl.DateTimeFormat gave a date it can't read");
  return z;
}

declare const __DEV__: boolean | undefined;

/** A development build: `__DEV__` on React Native, else `NODE_ENV`, else true. */
function isDevelopment(): boolean {
  if (typeof __DEV__ !== "undefined") return Boolean(__DEV__);
  try {
    // Written out in full: bundlers replace exactly `process.env.NODE_ENV`, and a browser has no `process`.
    return process.env.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

const warned = new Set<string>();

/** Says once per zone and reason, in development, that office hours fell back to "open". */
function warnUnreadable(timeZone: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  const key = `${timeZone}\u0000${reason}`;
  if (warned.has(key) || !isDevelopment()) return;
  warned.add(key);
  // genesis-allow-console: a development hint that the app's office hours can't be read here; the desk says it's open instead.
  console.warn(`genesis-support: office hours in "${timeZone}" can't be read (${reason}), so the help desk shows as open. Check the zone, or the engine's Intl support on this platform.`);
}

/** How far the zone is ahead of UTC at this moment, in ms. */
function offsetAt(date: Date, timeZone: string): number {
  const z = zoned(date, timeZone);
  return Date.UTC(z.year, z.month - 1, z.day, Math.floor(z.minutes / 60), z.minutes % 60) - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** A wall-clock time in the zone as an instant. */
function instantOf(year: number, month: number, day: number, minutes: number, timeZone: string, near: Date): Date {
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const guess = wall - offsetAt(near, timeZone);
  // Once more at the guess, for a daylight-saving change in between.
  return new Date(wall - offsetAt(new Date(guess), timeZone));
}

/** Whether someone is in at `now`, and if not, when they're next in. */
export function officeHoursState(office: OfficeHours, now: Date = new Date()): OfficeHoursState {
  try {
    const today = zoned(now, office.timeZone);
    const spans = office.hours
      .map((h) => ({ days: h.days, open: minutesOf(h.open), close: minutesOf(h.close) }))
      .filter((h): h is { days: readonly number[]; open: number; close: number } => h.open !== null && h.close !== null && h.close > h.open);
    if (!spans.length) return { open: true, nextOpen: null };
    if (spans.some((s) => s.days.includes(today.weekday) && s.open <= today.minutes && today.minutes < s.close)) return { open: true, nextOpen: null };
    for (let ahead = 0; ahead <= 7; ahead++) {
      const weekday = (today.weekday + ahead) % 7;
      const opens = spans.filter((s) => s.days.includes(weekday) && (ahead > 0 || s.open > today.minutes)).map((s) => s.open);
      if (!opens.length) continue;
      return { open: false, nextOpen: instantOf(today.year, today.month, today.day + ahead, Math.min(...opens), office.timeZone, now) };
    }
    return { open: false, nextOpen: null };
  } catch (error) {
    warnUnreadable(office.timeZone, error);
    return { open: true, nextOpen: null };
  }
}
