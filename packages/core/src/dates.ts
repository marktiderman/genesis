/**
 * `@marktiderman/genesis-core/dates`: calendar days on a person's clock.
 *
 * A "day" here is a `YYYY-MM-DD` string: the date on some time zone's wall
 * clock. Which zone is the whole question. `new Date().toISOString().slice(0, 10)`
 * is the day in UTC, which is tomorrow for an evening in the Americas and
 * yesterday for a morning in Asia. The browser's zone is the device's, not
 * necessarily the person's, and a server's is usually UTC. So every function
 * here takes the zone, and `personDay` picks it in one order everywhere: the
 * person's saved zone, then the device's, then UTC.
 *
 * No dependencies: `Intl.DateTimeFormat` does the zone arithmetic, so daylight
 * saving is right wherever the runtime's time zone data is.
 *
 * @packageDocumentation
 */

/** `YYYY-MM-DD`. */
export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is a real `YYYY-MM-DD` day (not `2026-02-30`). @stability Beta */
export function isDay(value: unknown): value is Day {
  if (typeof value !== "string") return false;
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function assertDay(day: Day, where: string): [number, number, number] {
  if (!isDay(day)) throw new RangeError(`${where}: "${String(day)}" is not a YYYY-MM-DD day`);
  const m = DAY.exec(day)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// One formatter per zone, made once: building an Intl.DateTimeFormat is the slow part.
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Whether the runtime knows `zone` (`"America/Denver"`). @stability Beta */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  if (formatters.has(zone)) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The device's (or server's) zone, `"UTC"` when the runtime can't say. @stability Beta */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(zone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall clock in a zone at one instant. `weekday` is 0 for Sunday. @stability Beta */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

/** What the clock on the wall in `zone` says at `at`. @stability Beta */
export function wallClock(zone: string, at: Date = new Date()): WallClock {
  if (!isTimeZone(zone)) throw new RangeError(`wallClock: unknown time zone "${zone}"`);
  const parts: Record<string, string> = {};
  for (const p of partsFormatter(zone).formatToParts(at)) parts[p.type] = p.value;
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
    second: Number(parts["second"]),
    weekday: WEEKDAYS.indexOf(parts["weekday"] ?? ""),
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const dayOf = (y: number, m: number, d: number): Day => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** The day on `zone`'s clock at `at` (default now). @stability Beta */
export function dayIn(zone: string, at: Date = new Date()): Day {
  const c = wallClock(zone, at);
  return dayOf(c.year, c.month, c.day);
}

/** Someone whose days are counted: their saved zone, when they have one. */
export interface PersonClock {
  timeZone?: string | null | undefined;
}

/**
 * The zone a person's days are counted in: their saved zone if the runtime
 * knows it, else the device's, else UTC. On a server, pass the person's zone:
 * the server's own is rarely theirs.
 *
 * @stability Beta
 */
export function personTimeZone(person?: PersonClock | null): string {
  const saved = person?.timeZone;
  return saved && isTimeZone(saved) ? saved : deviceTimeZone();
}

/**
 * Today (or the day at `at`) for this person: `dayIn(personTimeZone(person), at)`.
 *
 * ```ts
 * const today = personDay(profile);                     // "2026-10-26" on their clock
 * const dueToday = tasks.filter((t) => t.due_on === today);
 * ```
 *
 * @stability Beta
 */
export function personDay(person?: PersonClock | null, at: Date = new Date()): Day {
  return dayIn(personTimeZone(person), at);
}

/** `day` moved by `days` (negative goes back). Calendar arithmetic: no zone, no daylight saving. @stability Beta */
export function addDays(day: Day, days: number): Day {
  const [y, m, d] = assertDay(day, "addDays");
  if (!Number.isInteger(days)) throw new RangeError(`addDays: ${days} is not a whole number of days`);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return dayOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from `from` to `to` (`to` − `from`; negative when `to` is earlier). @stability Beta */
export function daysBetween(from: Day, to: Day): number {
  const [y1, m1, d1] = assertDay(from, "daysBetween");
  const [y2, m2, d2] = assertDay(to, "daysBetween");
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** The weekday of a day, 0 for Sunday. @stability Beta */
export function weekdayOf(day: Day): number {
  const [y, m, d] = assertDay(day, "weekdayOf");
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The first day of `day`'s week, with weeks starting on `weekStartsOn` (0 Sunday … 6 Saturday; default 1, Monday). @stability Beta */
export function startOfWeek(day: Day, weekStartsOn = 1): Day {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) throw new RangeError("startOfWeek: weekStartsOn is 0 to 6");
  return addDays(day, -((weekdayOf(day) - weekStartsOn + 7) % 7));
}

/**
 * The instant `day` starts on `zone`'s clock: what to compare `created_at`
 * with for "since midnight". Where midnight doesn't exist (a daylight-saving
 * jump at 00:00), it's the first instant of the day that does.
 *
 * @stability Beta
 */
export function startOfDayIn(day: Day, zone: string): Date {
  const [y, m, d] = assertDay(day, "startOfDayIn");
  const target = Date.UTC(y, m - 1, d);
  // Guess the instant as if the zone were UTC, then correct by the zone's offset there, twice
  // (the second pass settles a guess that landed across a transition).
  let at = target;
  for (let i = 0; i < 2; i++) {
    const c = wallClock(zone, new Date(at));
    const shown = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
    at -= shown - target;
  }
  // Midnight skipped by a transition: step forward to the first instant on that day.
  while (dayIn(zone, new Date(at)) < day) at += 15 * 60_000;
  while (dayIn(zone, new Date(at - 1)) === day) at -= 15 * 60_000;
  return new Date(at);
}

/** The `[start, end)` instants of `day` on `zone`'s clock (23 or 25 hours on daylight-saving days). @stability Beta */
export function dayRangeIn(day: Day, zone: string): { start: Date; end: Date } {
  return { start: startOfDayIn(day, zone), end: startOfDayIn(addDays(day, 1), zone) };
}
