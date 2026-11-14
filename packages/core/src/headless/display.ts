// Small display rules several twins share: a stat's trend line, a status badge's tone, a
// stepper's step states, the notification list's day groups and a custom view's state.

import { addDays, dayIn, type Day } from "../dates";
import { dayOfDate } from "./calendar";

/** A stat's change: "+12% vs last week", and whether it went up. */
export function formatTrend(trend: { value: number; label: string }): { text: string; positive: boolean } {
  const positive = trend.value >= 0;
  return { text: `${positive ? "+" : ""}${trend.value}% ${trend.label}`, positive };
}

/** The goal and task statuses StatusBadge draws. */
export type StatusBadgeStatus = "onTrack" | "atRisk" | "offTrack" | "done" | "blocked" | "inProgress";

/** Each status's tone: the tint both platforms draw it in. */
export const STATUS_BADGE_TONES: Readonly<Record<StatusBadgeStatus, "success" | "warning" | "info" | "danger">> = {
  onTrack: "success",
  done: "success",
  atRisk: "warning",
  inProgress: "info",
  offTrack: "danger",
  blocked: "danger",
};

/** A status in words, for a badge with no children: "On track", "In progress". */
export function statusBadgeLabel(status: StatusBadgeStatus): string {
  const spaced = status.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Where a step is in a stepper, from the current one. */
export type StepState = "complete" | "current" | "upcoming";

/** The state of step `index` when `current` is the step the person is on. */
export function stepState(index: number, current: number): StepState {
  return index < current ? "complete" : index === current ? "current" : "upcoming";
}

/**
 * The day group a notification goes under: "Upcoming" for a later day (scheduled, or a clock
 * that runs ahead), then "Today", "Yesterday" and "Earlier".
 */
export type NotificationDayBucket = "Upcoming" | "Today" | "Yesterday" | "Earlier";

/** The day groups in the order a list shows them. */
export const NOTIFICATION_DAY_BUCKETS: readonly NotificationDayBucket[] = ["Upcoming", "Today", "Yesterday", "Earlier"];

export interface NotificationClock {
  /** The moment the groups count from. Default now. */
  now?: Date | undefined;
  /**
   * The zone whose days are counted (an IANA name, "Europe/Paris"). Default the device's. A
   * server rendering the list passes the person's zone, or its days won't be theirs.
   */
  timeZone?: string | undefined;
}

function dayAt(at: Date, timeZone: string | undefined): Day {
  return timeZone ? dayIn(timeZone, at) : dayOfDate(at);
}

/** Which day group `timestamp` belongs to, counted in calendar days on `timeZone`'s clock. */
export function notificationDayBucket(timestamp: string | Date, clock: NotificationClock = {}): NotificationDayBucket {
  const at = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  // A timestamp that isn't one has no day: it goes last rather than under a wrong heading.
  if (Number.isNaN(at.getTime())) return "Earlier";
  const today = dayAt(clock.now ?? new Date(), clock.timeZone);
  const day = dayAt(at, clock.timeZone);
  if (day > today) return "Upcoming";
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return "Earlier";
}

/**
 * Notifications under day headings (Upcoming, Today, Yesterday, Earlier), in that order, each
 * keeping the order given. Empty groups are left out.
 */
export function groupNotificationsByDay<N extends { timestamp: string | Date }>(
  items: readonly N[],
  clock: NotificationClock = {},
): { title: NotificationDayBucket; data: N[] }[] {
  const now = clock.now ?? new Date();
  const map = new Map<NotificationDayBucket, N[]>();
  for (const item of items) {
    const bucket = notificationDayBucket(item.timestamp, { now, timeZone: clock.timeZone });
    const group = map.get(bucket);
    if (group) group.push(item);
    else map.set(bucket, [item]);
  }
  return NOTIFICATION_DAY_BUCKETS.flatMap((title) => {
    const data = map.get(title);
    return data ? [{ title, data }] : [];
  });
}

/** Where a custom view is: the states Genesis draws, then `ready` for the app's own. */
export type CustomViewStatus = "loading" | "error" | "empty" | "ready";

/** A custom view's state from its query: an error first, then the first load, then no rows. */
export function customViewStatus(query: { error: unknown; loading: boolean; empty: boolean }): CustomViewStatus {
  return query.error ? "error" : query.loading ? "loading" : query.empty ? "empty" : "ready";
}
