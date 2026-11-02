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
 * ago"); `style: "short"` is `relativeTime`'s ("2 hours ago", "yesterday", "Oct 21"), in `words`
 * (a screen's `useUiMessages().time`, so a translation applies) or the English catalogue.
 */
export function formatRelativeTime(
  date: string | Date,
  options: { style?: RelativeTimeStyle | undefined; words?: RelativeTimeWords | undefined } = {},
) {
  if (options.style === "short") return relativeTime(date, new Date(), { words: options.words });
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The words `relativeTime` uses (`uiMessages.time`), with the locale Intl formats hours, days and
 * dates in, so a translated catalogue gets its own language's "yesterday" and "Oct 21".
 */
export type RelativeTimeWords = UiMessages["time"];

/** How `relativeTime` says it. */
export interface RelativeTimeOptions {
  /** The calendar days are counted on; default the device's. An unknown zone reads as the device's. */
  timeZone?: string | undefined;
  /** The words, from the messages in effect (`useUiMessages().time`); default the English catalogue. */
  words?: RelativeTimeWords | undefined;
  /**
   * `"short"` (the default): "3 min ago", "2 hours ago", "yesterday", "Oct 21". `"compact"`, for a
   * dense list such as an inbox: "now", "5m", the clock time today, "Yesterday", the weekday, "12 Mar".
   */
  style?: "short" | "compact" | undefined;
  /** The locale Intl formats in, when it isn't the words' own (`words.locale`). */
  locale?: string | undefined;
}

/** An instant as a Date, or null when it isn't one. */
function instantOf(value: unknown): Date | null {
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * When something happens, as people say it: "just now", "3 min ago", "2 hours ago",
 * "yesterday", "4 days ago", or ahead "in 5 min", "in 2 hours", "tomorrow"; past a week, the date
 * ("Oct 21", with the year when it isn't this one). Days are counted on the viewer's calendar
 * (`timeZone`, default the device's). `style: "compact"` is the inbox wording. The one relative-time
 * wording in Genesis: `formatRelativeTime(…, { style: "short" })`, `DateCell({ relative: "short" })`,
 * `relativeDatetimeRenderer` and genesis-chat's inbox all use it.
 */
export function relativeTime(value: unknown, now: Date = new Date(), options: RelativeTimeOptions = {}): string {
  const at = instantOf(value);
  if (!at) return String(value);
  const zone = options.timeZone && isTimeZone(options.timeZone) ? options.timeZone : deviceTimeZone();
  const w = options.words ?? uiMessages.time;
  const locale = options.locale ?? w.locale;
  const ago = now.getTime() - at.getTime();
  const days = () => daysBetween(dayIn(zone, at), dayIn(zone, now)); // > 0: in the past
  const date = () =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: zone,
      ...(dayIn(zone, at).slice(0, 4) === dayIn(zone, now).slice(0, 4) ? {} : { year: "numeric" }),
    }).format(at);

  if (options.style === "compact") {
    if (ago < MINUTE) return w.now;
    if (ago < HOUR) return fillMessage(w.minutesShort, { n: String(Math.floor(ago / MINUTE)) });
    const d = days();
    if (d === 0) return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone }).format(at);
    if (d === 1) return w.yesterday;
    if (d > 1 && d < 7) return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: zone }).format(at);
    return date();
  }

  if (Math.abs(ago) < MINUTE) return w.justNow;
  if (Math.abs(ago) < HOUR) {
    const n = String(Math.floor(Math.abs(ago) / MINUTE));
    return fillMessage(ago > 0 ? w.minutesAgo : w.inMinutes, { n });
  }
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const d = days();
  if (d === 0) return rtf.format(-Math.trunc(ago / HOUR), "hour");
  if (Math.abs(d) < 7) return rtf.format(-d, "day");
  return date();
}
