/**
 * Quiet hours on the phone: only for showing them ("on now, until 07:00").
 * Whether a push waits is decided on the server (migration 0005's
 * genesis_push_status), in the person's saved time zone, so a phone with a
 * wrong clock or in another zone can't change it.
 */
import type { QuietHours } from "./backend";

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for `"HH:MM"`, or null. */
export function parseClock(value: string): number | null {
  const match = CLOCK.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** `"HH:MM"` for minutes since midnight (wrapping a day). */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** `"HH:MM"` for a `Date`'s local time (what a time picker hands back). */
export function clockOf(date: Date): string {
  return formatClock(date.getHours() * 60 + date.getMinutes());
}

/** Today at `"HH:MM"` local, for a time picker's value. */
export function dateAt(clock: string, today = new Date()): Date {
  const minutes = parseClock(clock) ?? 0;
  const d = new Date(today);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** This phone's IANA time zone, or null when the JavaScript engine can't say. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone.length > 0 ? zone : null;
  } catch {
    return null;
  }
}

/** Minutes since midnight at `at` in `timeZone`, or null for a zone the engine doesn't know. */
export function minutesIn(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? (hour % 24) * 60 + minute : null;
  } catch {
    return null;
  }
}

/**
 * Are quiet hours on at `at`? The same rule as the server: the start is
 * inclusive, the end exclusive, a start after the end runs past midnight, a
 * start equal to the end is no quiet hours, and an unknown zone is never quiet.
 */
export function isQuietAt(quiet: QuietHours, at: Date = new Date()): boolean {
  if (!quiet.enabled || !quiet.timeZone) return false;
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  if (start === null || end === null || start === end) return false;
  const now = minutesIn(quiet.timeZone, at);
  if (now === null) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}
