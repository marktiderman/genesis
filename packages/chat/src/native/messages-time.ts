/**
 * @feat:chat
 * Times as Messages writes them. In the thread, a centred separator where a day starts or an hour
 * has passed: "Today 9:49 AM", "Yesterday 4:12 PM", "Monday 8:03 AM" within a week, then
 * "Mon, Nov 3 at 8:03 AM", with the year when it isn't this one. The words are the copy's. The
 * inbox's times are InboxPage's (`formatInboxTime`).
 */
const DAY = 86_400_000;

/** A new separator once an hour or more has passed since the message before. */
export const TIME_SEPARATOR_GAP_MS = 60 * 60_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBefore(d: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(d)) / DAY);
}

/** "9:41 AM", in the phone's locale. */
export function chatClock(d: Date, locale?: string): string {
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** The words a separator uses, from the copy (`ChatNativeCopy`'s `today`, `yesterday` and `atTime`). */
export interface TimeSeparatorWords {
  today: string;
  yesterday: string;
  /** "at {time}", for a day further back than a week. */
  atTime: string;
}

const ENGLISH: TimeSeparatorWords = { today: "Today", yesterday: "Yesterday", atTime: "at {time}" };

/** The day (drawn bold) and the time beside it, for a separator in the thread. */
export function timeSeparatorLabel(iso: string, now: Date = new Date(), locale?: string, words: TimeSeparatorWords = ENGLISH): { day: string; time: string } {
  const d = new Date(iso);
  const days = daysBefore(d, now);
  const time = chatClock(d, locale);
  if (days <= 0) return { day: words.today, time };
  if (days === 1) return { day: words.yesterday, time };
  if (days < 7) return { day: d.toLocaleDateString(locale, { weekday: "long" }), time };
  const sameYear = d.getFullYear() === now.getFullYear();
  return { day: d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }), time: words.atTime.replace("{time}", time) };
}

/** Whether a separator goes before the message at `at`, after the one at `before` (null: the first). */
export function startsTimeSeparator(before: string | null, at: string): boolean {
  if (!before) return true;
  const a = new Date(before);
  const b = new Date(at);
  return startOfDay(a) !== startOfDay(b) || b.getTime() - a.getTime() >= TIME_SEPARATOR_GAP_MS;
}
