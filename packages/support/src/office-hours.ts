/**
 * A help desk's office hours, and whether someone is in: platform-neutral, for the messenger's
 * reply expectation (`SupportMessenger`'s `officeHours`) on the web or a phone.
 */

/** When someone answers, in the help desk's own time zone. */
export interface OfficeHours {
  /** The IANA zone the hours are in ("America/New_York"). */
  timeZone: string;
  /** Spans of a day: `days` 0 (Sunday) to 6 (Saturday), `open` and `close` as "HH:MM", close after open on the same day. */
  hours: readonly { days: readonly number[]; open: string; close: string }[];
}

export interface OfficeHoursState {
  /** Someone is in now. True when the hours can't be read (an unknown zone, a bad time): never say "away" by mistake. */
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
  return h <= 24 && min < 60 ? h * 60 + min : null;
};

interface Zoned {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
}

function zoned(date: Date, timeZone: string): Zoned {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    weekday: WEEKDAYS.indexOf(String(parts["weekday"])),
    minutes: (Number(parts["hour"]) % 24) * 60 + Number(parts["minute"]),
  };
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
    if (today.weekday < 0 || !spans.length) return { open: true, nextOpen: null };
    if (spans.some((s) => s.days.includes(today.weekday) && s.open <= today.minutes && today.minutes < s.close)) return { open: true, nextOpen: null };
    for (let ahead = 0; ahead <= 7; ahead++) {
      const weekday = (today.weekday + ahead) % 7;
      const opens = spans.filter((s) => s.days.includes(weekday) && (ahead > 0 || s.open > today.minutes)).map((s) => s.open);
      if (!opens.length) continue;
      return { open: false, nextOpen: instantOf(today.year, today.month, today.day + ahead, Math.min(...opens), office.timeZone, now) };
    }
    return { open: false, nextOpen: null };
  } catch {
    return { open: true, nextOpen: null };
  }
}
