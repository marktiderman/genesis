import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { dayIn, daysBetween, deviceTimeZone, isTimeZone } from "@marktiderman/genesis-core/dates";
import { uiMessages, type UiMessages } from "./messages-en";
import { fillMessage } from "./messages";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return format(new Date(date), "MMM d, yyyy");
}

/** How `formatRelativeTime` and `DateCell` word a time: date-fns' distance (the default) or `relativeTime`'s. */
export type RelativeTimeStyle = "distance" | "short";

/**
 * A time relative to now. The default, `style: "distance"`, is date-fns' wording ("about 2 hours
 * ago"); `style: "short"` is `relativeTime`'s ("2 hours ago", "yesterday", "Oct 21").
 */
export function formatRelativeTime(date: string | Date, options: { style?: RelativeTimeStyle | undefined } = {}) {
  if (options.style === "short") return relativeTime(date);
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The words `relativeTime` uses itself (`uiMessages.time`); hours and days come from Intl in the runtime's language. */
export type RelativeTimeWords = UiMessages["time"];

/** An instant as a Date, or null when it isn't one. */
function instantOf(value: unknown): Date | null {
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * When something happens, as people say it: "just now", "3 min ago", "2 hours ago",
 * "yesterday", "4 days ago", or ahead "in 5 min", "in 2 hours", "tomorrow"; past a week, the date
 * ("Oct 21", with the year when it isn't this one). Days are counted on the viewer's calendar
 * (`timeZone`, default the device's). The one relative-time wording in Genesis UI:
 * `formatRelativeTime(…, { style: "short" })`, `DateCell({ relative: "short" })` and
 * `relativeDatetimeRenderer` all use it.
 */
export function relativeTime(
  value: unknown,
  now: Date = new Date(),
  options: { timeZone?: string | undefined; words?: RelativeTimeWords | undefined } = {},
): string {
  const at = instantOf(value);
  if (!at) return String(value);
  // An unknown zone name reads on the device's clock, never throws.
  const zone = options.timeZone && isTimeZone(options.timeZone) ? options.timeZone : deviceTimeZone();
  const w = options.words ?? uiMessages.time;
  const ago = now.getTime() - at.getTime();
  if (Math.abs(ago) < MINUTE) return w.justNow;
  if (Math.abs(ago) < HOUR) {
    const n = String(Math.floor(Math.abs(ago) / MINUTE));
    return fillMessage(ago > 0 ? w.minutesAgo : w.inMinutes, { n });
  }
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const days = daysBetween(dayIn(zone, at), dayIn(zone, now)); // > 0: in the past
  if (days === 0) return rtf.format(-Math.trunc(ago / HOUR), "hour");
  if (Math.abs(days) < 7) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: zone,
    ...(dayIn(zone, at).slice(0, 4) === dayIn(zone, now).slice(0, 4) ? {} : { year: "numeric" }),
  }).format(at);
}
