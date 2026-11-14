import * as React from "react";
import { Bell } from "lucide-react";
import { groupNotificationsByDay, type NotificationDayBucket } from "@marktiderman/genesis-core/headless";
import { cn } from "../../utils";
import { useHydrated } from "../../hooks/use-mobile";
import { EmptyState } from "../patterns/empty-state";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

/** One notification, as genesis-ui-native's NotificationsPage takes it. */
export interface NotificationItem {
  id: string;
  title: string;
  body?: string | undefined;
  /** ISO date string or Date; it decides the day heading. */
  timestamp: string | Date;
  /** Unread rows are marked and say so. */
  unread?: boolean | undefined;
  /** Opens what the notification is about. */
  onPress?: (() => void) | undefined;
  /** Before the text: an avatar, an icon. */
  leading?: React.ReactNode;
  testID?: string | undefined;
}

export interface NotificationsPageProps {
  items: readonly NotificationItem[];
  /** Default "Notifications". */
  title?: React.ReactNode;
  /** Shows Mark all read in the header. */
  onMarkAllRead?: (() => void) | undefined;
  markAllReadLabel?: string | undefined;
  isLoading?: boolean | undefined;
  /** Replaces the empty state. */
  emptyState?: React.ReactNode;
  emptyTitle?: string | undefined;
  emptyBody?: string | undefined;
  /** The day headings' words, by bucket. */
  dayLabels?: Partial<Record<NotificationDayBucket, string>> | undefined;
  /** The moment the day headings count from. Default now, read in the browser. */
  now?: Date | undefined;
  /**
   * The zone whose days the headings count (an IANA name). Default the browser's. Pass it with
   * `now` to group on the server too; without both, the server renders the list without headings
   * and the browser adds them once it has hydrated, so the server's clock and zone never decide
   * which day a notification is on.
   */
  timeZone?: string | undefined;
  className?: string | undefined;
  testID?: string | undefined;
}

/**
 * NotificationsPage — a person's notifications under day headings (Upcoming, Today, Yesterday, Earlier),
 * unread ones marked, with Mark all read: the twin of genesis-ui-native's NotificationsPage, with
 * the same `items`, `onMarkAllRead` and empty words. The day groups are genesis-core's
 * (`groupNotificationsByDay`), so both platforms put a notification under the same heading.
 *
 * Presentational: it takes the items. genesis-notifications' NotificationFeed is the one that
 * loads them from the notifications tables.
 *
 * @stability Beta
 */
export function NotificationsPage({
  items,
  title = "Notifications",
  onMarkAllRead,
  markAllReadLabel = "Mark all read",
  isLoading = false,
  emptyState,
  emptyTitle = "No notifications yet",
  emptyBody = "When something needs your attention, it'll show up here.",
  dayLabels = {},
  now,
  timeZone,
  className,
  testID = "notifications-page",
}: NotificationsPageProps) {
  const hydrated = useHydrated();
  // The days are the viewer's: grouped once the browser's clock is known, or from the clock given.
  const grouped = hydrated || (now !== undefined && timeZone !== undefined);
  const groups: { title: NotificationDayBucket | null; data: NotificationItem[] }[] = grouped
    ? groupNotificationsByDay(items, { now, timeZone })
    : items.length > 0
      ? [{ title: null, data: [...items] }]
      : [];
  const hasUnread = items.some((i) => i.unread);
  return (
    <div data-slot="notifications-page" data-testid={testID} className={cn("flex flex-col gap-6", className)}>
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-[number:var(--page-title-font-weight)] tracking-[var(--page-title-letter-spacing)] sm:text-2xl">{title}</h1>
        {onMarkAllRead ? (
          <Button type="button" variant="ghost" size="sm" onClick={onMarkAllRead} disabled={!hasUnread} testID={`${testID}-mark-all-read`}>
            {markAllReadLabel}
          </Button>
        ) : null}
      </header>
      {isLoading ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        (emptyState ?? <EmptyState icon={Bell} title={emptyTitle} description={emptyBody} />)
      ) : (
        groups.map((group) => (
          <section key={group.title ?? "all"} aria-labelledby={group.title ? `${testID}-${group.title}` : undefined} className="flex flex-col gap-1">
            {group.title ? (
              <h2 id={`${testID}-${group.title}`} className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dayLabels[group.title] ?? group.title}
              </h2>
            ) : null}
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {group.data.map((item) => {
                const inner = (
                  <>
                    <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", item.unread ? "bg-primary" : "bg-transparent")} />
                    {item.leading ? <span className="shrink-0">{item.leading}</span> : null}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", item.unread ? "font-semibold" : "font-medium")}>{item.title}</span>
                      {item.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{item.body}</span> : null}
                    </span>
                    {item.unread ? <span className="sr-only">Unread</span> : null}
                  </>
                );
                const rowClass = "flex w-full items-start gap-3 px-4 py-3 text-left";
                return (
                  <li key={item.id} data-testid={item.testID ?? `notifications-row-${item.id}`}>
                    {item.onPress ? (
                      <button type="button" onClick={item.onPress} className={cn(rowClass, "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}>
                        {inner}
                      </button>
                    ) : (
                      <div className={rowClass}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
