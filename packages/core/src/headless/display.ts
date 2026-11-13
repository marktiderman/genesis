// Small display rules several twins share: a stat's trend line, a status badge's tone, a
// stepper's step states, the notification list's day groups and a custom view's state.

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

/** The day a notification falls on, from the person's clock: today, yesterday or earlier. */
export type NotificationDayBucket = "Today" | "Yesterday" | "Earlier";

/** Which day group `timestamp` belongs to, counted on the device's clock. */
export function notificationDayBucket(timestamp: string | Date, now: Date = new Date()): NotificationDayBucket {
  const d = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const startOfDay = (date: Date) => {
    const x = new Date(date);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const today = startOfDay(now);
  const day = startOfDay(d);
  if (day === today) return "Today";
  if (day === startOfDay(new Date(today - 12 * 60 * 60 * 1000))) return "Yesterday";
  return "Earlier";
}

/**
 * Notifications under day headings (Today, Yesterday, Earlier), in that order, each keeping the
 * order given. Empty groups are left out.
 */
export function groupNotificationsByDay<N extends { timestamp: string | Date }>(
  items: readonly N[],
  now: Date = new Date(),
): { title: NotificationDayBucket; data: N[] }[] {
  const map = new Map<NotificationDayBucket, N[]>();
  for (const item of items) {
    const bucket = notificationDayBucket(item.timestamp, now);
    map.set(bucket, [...(map.get(bucket) ?? []), item]);
  }
  return (["Today", "Yesterday", "Earlier"] as const).filter((t) => map.has(t)).map((title) => ({ title, data: map.get(title)! }));
}

/** Where a custom view is: the states Genesis draws, then `ready` for the app's own. */
export type CustomViewStatus = "loading" | "error" | "empty" | "ready";

/** A custom view's state from its query: an error first, then the first load, then no rows. */
export function customViewStatus(query: { error: unknown; loading: boolean; empty: boolean }): CustomViewStatus {
  return query.error ? "error" : query.loading ? "loading" : query.empty ? "empty" : "ready";
}
