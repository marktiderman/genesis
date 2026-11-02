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

/** A `[start, end)` run of days: `end` is the first day after it. @stability Beta */
export interface DayRange {
  start: Day;
  end: Day;
}

/** Days in `day`'s month (28 to 31). @stability Beta */
export function daysInMonth(day: Day): number {
  const [y, m] = assertDay(day, "daysInMonth");
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The first day of `day`'s month. @stability Beta */
export function startOfMonth(day: Day): Day {
  const [y, m] = assertDay(day, "startOfMonth");
  return dayOf(y, m, 1);
}

/**
 * `day` moved by `months`, keeping its day of the month where the month has it and taking the
 * month's last day where it doesn't (31 January + 1 is 28 or 29 February). @stability Beta
 */
export function addMonths(day: Day, months: number): Day {
  const [y, m, d] = assertDay(day, "addMonths");
  if (!Number.isInteger(months)) throw new RangeError(`addMonths: ${months} is not a whole number of months`);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = index - ny * 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return dayOf(ny, nm, Math.min(d, last));
}

/** The first day of `day`'s quarter (1 January, 1 April, 1 July or 1 October). @stability Beta */
export function startOfQuarter(day: Day): Day {
  const [y, m] = assertDay(day, "startOfQuarter");
  return dayOf(y, m - ((m - 1) % 3), 1);
}

/** `day` moved by whole weeks. @stability Beta */
export function addWeeks(day: Day, weeks: number): Day {
  if (!Number.isInteger(weeks)) throw new RangeError(`addWeeks: ${weeks} is not a whole number of weeks`);
  return addDays(day, weeks * 7);
}

/** `day`'s month as a range: its first day to the next month's first. @stability Beta */
export function monthRange(day: Day): DayRange {
  const start = startOfMonth(day);
  return { start, end: addMonths(start, 1) };
}

/** `day`'s quarter as a range. @stability Beta */
export function quarterRange(day: Day): DayRange {
  const start = startOfQuarter(day);
  return { start, end: addMonths(start, 3) };
}

/**
 * `weeks` whole weeks (1 or more) from the week `day` is in: what a 1-to-4-week calendar shows.
 *
 * ```ts
 * weeksRange("2026-11-04", 2, 0); // { start: "2026-11-01", end: "2026-11-15" } (weeks from Sunday)
 * ```
 *
 * @stability Beta
 */
export function weeksRange(day: Day, weeks: number, weekStartsOn = 1): DayRange {
  if (!Number.isInteger(weeks) || weeks < 1) throw new RangeError(`weeksRange: ${weeks} is not a whole number of weeks, 1 or more`);
  const start = startOfWeek(day, weekStartsOn);
  return { start, end: addWeeks(start, weeks) };
}

/** The whole weeks that cover `day`'s month: what a month grid shows, leading and trailing days included. @stability Beta */
export function monthGridRange(day: Day, weekStartsOn = 1): DayRange {
  const month = monthRange(day);
  const start = startOfWeek(month.start, weekStartsOn);
  const lastWeek = startOfWeek(addDays(month.end, -1), weekStartsOn);
  return { start, end: addWeeks(lastWeek, 1) };
}

/** Every day of a range, in order. @stability Beta */
export function eachDay(range: DayRange): Day[] {
  const n = daysBetween(range.start, range.end);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(range.start, i));
}

/**
 * The `[start, end)` instants of a range of days on `zone`'s clock: what to filter a timestamp
 * column by for a calendar's visible window. @stability Beta
 */
export function rangeIn(range: DayRange, zone: string): { start: Date; end: Date } {
  return { start: startOfDayIn(range.start, zone), end: startOfDayIn(range.end, zone) };
}

// ---------------------------------------------------------------------------
// Wall-clock times in a zone
// ---------------------------------------------------------------------------

/** A time on the wall clock, `HH:MM` or `HH:MM:SS`. @stability Beta */
export type WallTime = string;

const WALL_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function validWallTime(time: string): boolean {
  const m = WALL_TIME.exec(time);
  return Boolean(m) && Number(m![1]) <= 23 && Number(m![2]) <= 59 && Number(m![3] ?? 0) <= 59;
}

function parseWallTime(time: WallTime, where: string): [number, number, number] {
  const m = WALL_TIME.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) {
    throw new RangeError(`${where}: "${time}" is not an HH:MM[:SS] time`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

/** How far `zone`'s clock is ahead of UTC at `at`, in milliseconds. */
function offsetAt(zone: string, at: number): number {
  const c = wallClock(zone, new Date(at));
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - (at - (((at % 1000) + 1000) % 1000));
}

/**
 * The instant `zone`'s clock shows `time` on `day`. A time the clock skips (the hour lost when
 * daylight saving starts) is read with the offset before the jump, so 02:30 becomes 03:30; a time
 * it shows twice (the hour repeated when it ends) is the first of the two. Both as RFC 5545 says.
 *
 * @stability Beta
 */
export function instantIn(day: Day, time: WallTime, zone: string): Date {
  const [y, m, d] = assertDay(day, "instantIn");
  const [h, mi, s] = parseWallTime(time, "instantIn");
  if (!isTimeZone(zone)) throw new RangeError(`instantIn: unknown time zone "${zone}"`);
  const target = Date.UTC(y, m - 1, d, h, mi, s);
  // Transitions are weeks apart, so a day either side gives the offsets before and after one.
  const before = offsetAt(zone, target - 86_400_000);
  const after = offsetAt(zone, target + 86_400_000);
  const shows = (at: number) => offsetAt(zone, at) + at === target;
  const early = target - Math.max(before, after);
  const late = target - Math.min(before, after);
  if (shows(early)) return new Date(early);
  if (shows(late)) return new Date(late);
  return new Date(target - before);
}

/** The day and wall time `zone`'s clock shows at `at`. @stability Beta */
export function wallTimeIn(zone: string, at: Date): { day: Day; time: WallTime } {
  const c = wallClock(zone, at);
  return { day: dayOf(c.year, c.month, c.day), time: `${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}` };
}

// ---------------------------------------------------------------------------
// Recurrence (RFC 5545 RRULE, the subset calendars send)
// ---------------------------------------------------------------------------

/** A weekday in a rule: 0 Sunday … 6 Saturday, with an optional position (`2MO` is 2, `-1FR` is −1). @stability Beta */
export interface RuleWeekday {
  weekday: number;
  nth?: number;
}

/** A parsed RRULE. @stability Beta */
export interface RRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  /**
   * A last day (`UNTIL=20261231`), a last instant (`UNTIL=20261231T235959Z`), or a last wall time
   * with no zone (`UNTIL=20261231T235959`), read on the series' own clock.
   */
  until?: Day | Date | { day: Day; time: WallTime };
  byDay?: RuleWeekday[];
  /** 1 to 31, or −1 (last) to −31. */
  byMonthDay?: number[];
  /** 1 to 12. */
  byMonth?: number[];
  /** The week's first day, 0 Sunday … 6 Saturday. Default 1 (Monday), as RFC 5545 says. */
  weekStart: number;
}

const RULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

function ruleInts(value: string, part: string, min: number, max: number, signed: boolean): number[] {
  return value.split(",").map((raw) => {
    const n = Number(raw);
    if (!/^[+-]?\d+$/.test(raw) || Math.abs(n) < min || Math.abs(n) > max || (!signed && n < 0)) {
      throw new RangeError(`parseRRule: ${part}=${value} is out of range`);
    }
    return n;
  });
}

function ruleDate(value: string): NonNullable<RRule["until"]> {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!m) throw new RangeError(`parseRRule: UNTIL=${value} is not a date`);
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isDay(day)) throw new RangeError(`parseRRule: UNTIL=${value} is not a date`);
  if (!m[4]) return day;
  // No Z: a wall time on the series' own clock, read when the series' zone is known.
  if (!m[7]) {
    const time = `${m[4]}:${m[5]}:${m[6]}`;
    if (!WALL_TIME.test(time) || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) throw new RangeError(`parseRRule: UNTIL=${value} is not a date`);
    return { day, time };
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
}

/**
 * Read an RRULE (`"FREQ=WEEKLY;BYDAY=MO,WE"`, with or without the `RRULE:` prefix). Supports
 * FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH and
 * WKST. Any other part (BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR, BYMINUTE, BYSECOND, sub-daily
 * frequencies…) throws a `RangeError` naming it, so a caller can show the series' first instance
 * rather than a wrong pattern.
 *
 * @stability Beta
 */
export function parseRRule(text: string): RRule {
  const body = text.trim().replace(/^RRULE:/i, "");
  const rule: Partial<RRule> & { weekStart: number; interval: number } = { interval: 1, weekStart: 1 };
  const seen = new Set<string>();
  for (const piece of body.split(";")) {
    if (!piece) continue;
    const eq = piece.indexOf("=");
    const key = piece.slice(0, eq).toUpperCase();
    const value = piece.slice(eq + 1).toUpperCase();
    if (eq < 1 || !value) throw new RangeError(`parseRRule: "${piece}" is not KEY=VALUE`);
    if (seen.has(key)) throw new RangeError(`parseRRule: ${key} is set twice`);
    seen.add(key);
    switch (key) {
      case "FREQ":
        if (!(FREQS as readonly string[]).includes(value)) throw new RangeError(`parseRRule: FREQ=${value} isn't supported`);
        rule.freq = value as RRule["freq"];
        break;
      case "INTERVAL":
        rule.interval = ruleInts(value, key, 1, 10_000, false)[0]!;
        break;
      case "COUNT":
        rule.count = ruleInts(value, key, 1, 100_000, false)[0]!;
        break;
      case "UNTIL":
        rule.until = ruleDate(value);
        break;
      case "BYDAY":
        rule.byDay = value.split(",").map((raw) => {
          const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(raw);
          if (!m) throw new RangeError(`parseRRule: BYDAY=${value} isn't a weekday list`);
          const nth = m[1] ? Number(m[1]) : undefined;
          if (nth !== undefined && (nth === 0 || Math.abs(nth) > 53)) throw new RangeError(`parseRRule: BYDAY=${value} is out of range`);
          return nth === undefined ? { weekday: RULE_DAYS.indexOf(m[2]!) } : { weekday: RULE_DAYS.indexOf(m[2]!), nth };
        });
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = ruleInts(value, key, 1, 31, true);
        break;
      case "BYMONTH":
        rule.byMonth = ruleInts(value, key, 1, 12, false);
        break;
      case "WKST":
        if (!RULE_DAYS.includes(value)) throw new RangeError(`parseRRule: WKST=${value} isn't a weekday`);
        rule.weekStart = RULE_DAYS.indexOf(value);
        break;
      default:
        throw new RangeError(`parseRRule: ${key} isn't supported`);
    }
  }
  return checkRule(rule as RRule, "parseRRule");
}

const intIn = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/**
 * The same checks for a rule given as text or as an object: values in range, and none of the
 * combinations RFC 5545 forbids (a BYDAY position outside MONTHLY or YEARLY; BYMONTHDAY with
 * WEEKLY), each refused naming the part.
 */
function checkRule(rule: RRule, where: string): RRule {
  if (!rule || typeof rule !== "object") throw new RangeError(`${where}: not a rule`);
  if (!rule.freq) throw new RangeError(`${where}: FREQ is required`);
  if (!(FREQS as readonly string[]).includes(rule.freq)) throw new RangeError(`${where}: FREQ=${String(rule.freq)} isn't supported`);
  if (!intIn(rule.interval, 1, 10_000)) throw new RangeError(`${where}: INTERVAL=${String(rule.interval)} is out of range`);
  if (rule.count !== undefined && !intIn(rule.count, 1, 100_000)) throw new RangeError(`${where}: COUNT=${String(rule.count)} is out of range`);
  if (rule.count !== undefined && rule.until !== undefined) throw new RangeError(`${where}: COUNT and UNTIL can't both be set`);
  if (!intIn(rule.weekStart, 0, 6)) throw new RangeError(`${where}: WKST=${String(rule.weekStart)} isn't a weekday`);
  for (const b of rule.byDay ?? []) {
    if (!intIn(b.weekday, 0, 6) || (b.nth !== undefined && (!intIn(Math.abs(b.nth), 1, 53) || b.nth === 0))) throw new RangeError(`${where}: BYDAY is out of range`);
    if (b.nth !== undefined && rule.freq !== "MONTHLY" && rule.freq !== "YEARLY") {
      throw new RangeError(`${where}: BYDAY with a position (${b.nth}${RULE_DAYS[b.weekday]}) needs FREQ=MONTHLY or YEARLY`);
    }
  }
  for (const d of rule.byMonthDay ?? []) if (!intIn(Math.abs(d), 1, 31)) throw new RangeError(`${where}: BYMONTHDAY=${d} is out of range`);
  if (rule.byMonthDay && rule.freq === "WEEKLY") throw new RangeError(`${where}: BYMONTHDAY can't be used with FREQ=WEEKLY`);
  for (const m of rule.byMonth ?? []) if (!intIn(m, 1, 12)) throw new RangeError(`${where}: BYMONTH=${m} is out of range`);
  const until = rule.until as unknown;
  if (until !== undefined) {
    const ok =
      typeof until === "string"
        ? isDay(until)
        : until instanceof Date
          ? !Number.isNaN(until.getTime())
          : Boolean(until) &&
            typeof until === "object" &&
            isDay((until as { day?: unknown }).day) &&
            typeof (until as { time?: unknown }).time === "string" &&
            validWallTime((until as { time: string }).time);
    if (!ok) throw new RangeError(`${where}: UNTIL isn't a day, an instant or a { day, time } wall time`);
  }
  for (const key of Object.keys(rule)) {
    if (!["freq", "interval", "count", "until", "byDay", "byMonthDay", "byMonth", "weekStart"].includes(key)) throw new RangeError(`${where}: ${key} isn't supported`);
  }
  return rule;
}

/**
 * Where a series starts: a day (an all-day series), or a wall time on a zone's clock. Give the
 * zone the series was written in (the calendar's), so 09:00 stays 09:00 there across daylight
 * saving; an instant (`at`) is read on that zone's clock.
 */
/** @stability Beta */
export type RecurrenceStart =
  | Day
  | { day: Day; time: WallTime; timeZone: string }
  | { at: Date; timeZone: string };

/** One occurrence: its day on the series' clock, and for a timed series its instant. @stability Beta */
export interface Occurrence {
  day: Day;
  start?: Date;
}

/** What `expandRecurrence` returns: the occurrences in order, and whether `limit` cut them short. @stability Beta */
export interface RecurrenceResult {
  occurrences: Occurrence[];
  /** True when there were more than `limit` in the window. */
  truncated: boolean;
}

/** What `expandRecurrence` takes. @stability Beta */
export interface RecurrenceOptions {
  /** The rule: RRULE text or `parseRRule`'s result. */
  rule: string | RRule;
  start: RecurrenceStart;
  /**
   * Occurrences removed (EXDATE): days for an all-day series (an instant throws: it has no day
   * without a zone); instants or days for a timed one (a day removes that day's occurrence).
   */
  exdates?: readonly (Day | Date)[];
  /**
   * Which occurrences to return, by their day on the series' clock: `[start, end)`. Widen the start
   * by an event's length to catch ones that began earlier and still run into it. Required: a rule
   * without COUNT or UNTIL never ends.
   */
  window: DayRange;
  /** Most occurrences returned. Default 1,000; the result's `truncated` says when it cut. */
  limit?: number;
}

function weekdayPositions(days: Day[], spec: RuleWeekday): Day[] {
  const matching = days.filter((d) => weekdayOf(d) === spec.weekday);
  if (spec.nth === undefined) return matching;
  const pick = spec.nth > 0 ? matching[spec.nth - 1] : matching[matching.length + spec.nth];
  return pick ? [pick] : [];
}

function monthDays(y: number, m: number): Day[] {
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => dayOf(y, m, i + 1));
}

function byMonthDays(days: Day[], byMonthDay: number[]): Day[] {
  return byMonthDay.map((n) => (n > 0 ? days[n - 1] : days[days.length + n])).filter((d): d is Day => d !== undefined);
}

/**
 * The candidate days of one month for a MONTHLY rule, or a YEARLY one expanded by month. With
 * BYMONTHDAY, BYDAY only narrows, its positions counted in `scope` (the month, or the year for a
 * YEARLY rule without BYMONTH).
 */
function monthCandidates(rule: RRule, y: number, m: number, startDay: number, scope?: Day[]): Day[] {
  const days = monthDays(y, m);
  if (rule.byMonthDay) {
    const picked = byMonthDays(days, rule.byMonthDay);
    if (!rule.byDay) return picked;
    const allowed = new Set(rule.byDay.flatMap((b) => weekdayPositions(scope ?? days, b)));
    return picked.filter((d) => allowed.has(d));
  }
  if (rule.byDay) return rule.byDay.flatMap((b) => weekdayPositions(days, b));
  const d = days[startDay - 1];
  return d ? [d] : [];
}

/** The candidate days of the period that starts at `period`. */
function periodCandidates(rule: RRule, period: Day, first: [number, number, number]): Day[] {
  const [py, pm] = assertDay(period, "expandRecurrence");
  let days: Day[];
  switch (rule.freq) {
    case "DAILY":
      days = [period];
      if (rule.byMonthDay) days = days.filter((d) => byMonthDays(monthDays(py, pm), rule.byMonthDay!).includes(d));
      if (rule.byDay) days = days.filter((d) => rule.byDay!.some((b) => b.weekday === weekdayOf(d)));
      break;
    case "WEEKLY": {
      const week = Array.from({ length: 7 }, (_, i) => addDays(period, i));
      days = rule.byDay ? week.filter((d) => rule.byDay!.some((b) => b.weekday === weekdayOf(d))) : week.filter((d) => weekdayOf(d) === weekdayOf(dayOf(...first)));
      break;
    }
    case "MONTHLY":
      days = monthCandidates(rule, py, pm, first[2]);
      break;
    case "YEARLY":
      if (rule.byDay && !rule.byMonth && !rule.byMonthDay) {
        const year = Array.from({ length: 12 }, (_, i) => monthDays(py, i + 1)).flat();
        days = rule.byDay.flatMap((b) => weekdayPositions(year, b));
      } else {
        const months = rule.byMonth ?? (rule.byDay || rule.byMonthDay ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [first[1]]);
        // Without BYMONTH, a BYDAY position counts through the year (20MO is the year's 20th Monday).
        const year = rule.byMonth ? undefined : Array.from({ length: 12 }, (_, i) => monthDays(py, i + 1)).flat();
        days = months.flatMap((m) => monthCandidates(rule, py, m, first[2], year));
      }
      break;
  }
  if (rule.byMonth) days = days.filter((d) => rule.byMonth!.includes(Number(d.slice(5, 7))));
  return [...new Set(days)].sort();
}

/** The start of the `k`th period from the first one. */
function periodAt(rule: RRule, firstPeriod: Day, k: number): Day {
  switch (rule.freq) {
    case "DAILY":
      return addDays(firstPeriod, k);
    case "WEEKLY":
      return addWeeks(firstPeriod, k);
    case "MONTHLY":
      return addMonths(firstPeriod, k);
    case "YEARLY":
      return addMonths(firstPeriod, 12 * k);
  }
}

/** Whole periods from the first one to the one `day` is in. */
function periodsTo(rule: RRule, firstPeriod: Day, day: Day): number {
  switch (rule.freq) {
    case "DAILY":
      return daysBetween(firstPeriod, day);
    case "WEEKLY":
      return Math.floor(daysBetween(firstPeriod, day) / 7);
    case "MONTHLY":
      return (Number(day.slice(0, 4)) - Number(firstPeriod.slice(0, 4))) * 12 + Number(day.slice(5, 7)) - Number(firstPeriod.slice(5, 7));
    case "YEARLY":
      return Number(day.slice(0, 4)) - Number(firstPeriod.slice(0, 4));
  }
}

function startOf(start: RecurrenceStart): { day: Day; time?: WallTime; zone?: string } {
  if (typeof start === "string") {
    assertDay(start, "expandRecurrence");
    return { day: start };
  }
  if (!isTimeZone(start.timeZone)) throw new RangeError(`expandRecurrence: unknown time zone "${start.timeZone}"`);
  if ("at" in start) return { ...wallTimeIn(start.timeZone, start.at), zone: start.timeZone };
  assertDay(start.day, "expandRecurrence");
  parseWallTime(start.time, "expandRecurrence");
  return { day: start.day, time: start.time, zone: start.timeZone };
}

/**
 * The occurrences of a repeating series inside a window, in order. No dependencies; daylight
 * saving is right because each occurrence keeps the series' wall time on its own zone's clock
 * (a 09:00 meeting is 09:00 in Denver in both January and July).
 *
 * Follows RFC 5545: the start is the first occurrence; COUNT counts from it, whatever the window;
 * EXDATE removes occurrences after counting, so it never adds one at the end; days a rule names
 * that a month lacks (the 31st in April) are skipped, not moved.
 *
 * ```ts
 * expandRecurrence({
 *   rule: "FREQ=MONTHLY;BYDAY=2MO;COUNT=10",
 *   start: { day: "2026-11-09", time: "18:30", timeZone: "America/Denver" },
 *   window: { start: "2026-11-01", end: "2027-02-01" },
 * }); // 9 Nov, 14 Dec, 11 Jan, each 18:30 in Denver
 * ```
 *
 * @stability Beta
 */
export function expandRecurrence(options: RecurrenceOptions): RecurrenceResult {
  const rule = typeof options.rule === "string" ? parseRRule(options.rule) : checkRule(options.rule, "expandRecurrence");
  const given = options.start;
  const { day: firstDay, time, zone } = startOf(given);
  const { window } = options;
  // A rule with neither COUNT nor UNTIL never ends: the window and the limit are what stop it.
  if (!window) throw new RangeError("expandRecurrence: a window is required");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new RangeError(`expandRecurrence: limit ${options.limit} is not a whole number, 1 or more`);
  }
  assertDay(window.start, "expandRecurrence");
  assertDay(window.end, "expandRecurrence");
  const limit = options.limit ?? 1000;
  const first = assertDay(firstDay, "expandRecurrence");
  const timed = Boolean(time && zone);
  // The first occurrence is the start itself: an `at` in a repeated hour keeps its own instant.
  // Its milliseconds (a wall time has whole seconds) carry through to every occurrence.
  const givenAt = typeof given === "object" && "at" in given ? given.at : undefined;
  const ms = givenAt ? ((givenAt.getTime() % 1000) + 1000) % 1000 : 0;
  const firstAt = givenAt ?? (timed ? instantIn(firstDay, time!, zone!) : undefined);
  const at = (day: Day) => (day === firstDay ? firstAt : timed ? new Date(instantIn(day, time!, zone!).getTime() + ms) : undefined);

  const exDays = new Set<string>();
  const exInstants = new Set<number>();
  for (const ex of options.exdates ?? []) {
    if (ex instanceof Date) {
      if (!timed) throw new RangeError("expandRecurrence: an all-day series' EXDATE is a day, not an instant");
      exInstants.add(ex.getTime());
    } else {
      assertDay(ex, "expandRecurrence");
      exDays.add(ex);
    }
  }
  // UNTIL as the last day, or the last instant on the series' clock (a wall-time UNTIL read there).
  const until = rule.until;
  const untilAt =
    until === undefined || typeof until === "string"
      ? undefined
      : until instanceof Date
        ? until
        : timed
          ? instantIn(until.day, until.time, zone!)
          : undefined;
  const untilDay =
    typeof until === "string" ? until : until instanceof Date ? (timed ? undefined : dayIn("UTC", until)) : until && !timed ? until.day : undefined;
  const pastUntil = (day: Day): boolean => {
    if (untilDay !== undefined) return day > untilDay;
    if (untilAt !== undefined) return at(day)!.getTime() > untilAt.getTime();
    return false;
  };

  const firstPeriod =
    rule.freq === "WEEKLY" ? startOfWeek(firstDay, rule.weekStart) : rule.freq === "DAILY" ? firstDay : rule.freq === "MONTHLY" ? startOfMonth(firstDay) : dayOf(first[0], 1, 1);
  const out: Occurrence[] = [];
  let truncated = false;
  const done = (): RecurrenceResult => ({ occurrences: out, truncated });
  let counted = 0;
  // Counted (COUNT) before EXDATE removes it; an instant is worked out only for a day that's shown.
  const take = (day: Day): boolean => {
    counted++;
    if (day >= window.start && day < window.end && !exDays.has(day)) {
      const start = at(day);
      if (!(start && exInstants.has(start.getTime()))) {
        if (out.length >= limit) {
          truncated = true;
          return true;
        }
        out.push(start ? { day, start } : { day });
      }
    }
    return rule.count !== undefined && counted >= rule.count;
  };

  // The start is always the first occurrence, even when the rule wouldn't pick it, unless UNTIL is before it.
  if (pastUntil(firstDay)) return done();
  if (take(firstDay)) return done();

  // Without COUNT, the periods before the window can't matter: skip straight to it.
  let k = 0;
  if (rule.count === undefined && window.start > firstDay) {
    const behind = periodsTo(rule, firstPeriod, window.start) - 1;
    k = Math.max(0, Math.floor(behind / rule.interval) * rule.interval);
  }
  // A rule that names no real day (BYMONTHDAY=30;BYMONTH=2) never ends on its own. Every real
  // pattern repeats within the Gregorian calendar's 400-year cycle, so 400 years without a match
  // means none will come, whatever the frequency.
  let lastYear = first[0];
  for (; ; k += rule.interval) {
    const period = periodAt(rule, firstPeriod, k);
    // Past 9999 there are no YYYY-MM-DD days.
    if (period.length > 10 || period >= window.end) break;
    const periodYear = Number(period.slice(0, 4));
    if (periodYear - lastYear > 400) break;
    const days = periodCandidates(rule, period, first).filter((d) => d > firstDay);
    if (days.length) lastYear = periodYear;
    for (const day of days) {
      if (pastUntil(day)) return done();
      if (day >= window.end && rule.count === undefined) return done();
      if (take(day)) return done();
    }
  }
  return done();
}

// ---------------------------------------------------------------------------
// Stored values
// ---------------------------------------------------------------------------

const STORED = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * A stored date or timestamp as a calendar value: a day for a `date` column (`dateOnly`) or a
 * value with no time; an instant for a timestamp. A timestamp written without a zone (Postgres
 * `timestamp without time zone`, `2026-11-02 09:30:00`) is a wall time, read on `timeZone`'s
 * clock (default the device's). Postgres text (`2026-10-19 09:30:00.123456+00`), ISO strings and
 * `Date`s are all read. Null when it isn't a date.
 *
 * @stability Beta
 */
export function readEventTime(value: unknown, options: { dateOnly?: boolean; timeZone?: string } = {}): Day | Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const m = STORED.exec(value.trim());
  if (!m || !isDay(m[1])) return null;
  if (options.dateOnly || !m[2]) return m[1];
  const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
  if (!m[4]) {
    const zone = options.timeZone && isTimeZone(options.timeZone) ? options.timeZone : deviceTimeZone();
    const [h, mi, sec] = time.split(":").map(Number) as [number, number, number];
    // Out of range (25:00) is not a time: null, like the zoned branch's invalid Date.
    if (!WALL_TIME.test(time) || h > 23 || mi > 59 || sec > 59) return null;
    const at = instantIn(m[1], time, zone);
    return m[3] ? new Date(at.getTime() + Math.round(Number(`0${m[3]}`) * 1000)) : at;
  }
  let zone = m[4];
  if (/^[+-]\d{2}$/.test(zone)) zone += ":00";
  else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const ms = m[3] ? m[3].slice(0, 4).padEnd(4, "0") : "";
  const date = new Date(`${m[1]}T${time}${ms}${zone}`);
  return Number.isNaN(date.getTime()) ? null : date;
}
