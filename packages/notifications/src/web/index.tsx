/**
 * `@marktiderman/genesis-notifications/web`: the notifier's web screens,
 * composed from genesis-ui only. Each reads the hooks from
 * `@marktiderman/genesis-notifications/react` (inside `NotificationsProvider`).
 *
 *   NotificationBell        a bell with the unread count; opens the latest few
 *   NotificationFeed        the whole feed, with mark read, archive and mark all read
 *   PreferencesMatrix       categories × channels, a switch each (critical rows locked on)
 *   DeliveryLog             admin: what was sent, to whom (masked), and what became of it
 *   SuppressionList         admin: addresses not to email, and lifting one
 *   SendTestNotification    admin: send yourself a test on every channel
 *
 * @packageDocumentation
 */
import { useEffect, useState, type ReactNode } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
} from "@marktiderman/genesis-ui";
import type { Channel } from "../core/index";
import { useNotifications, useNotificationsContext, usePreferences, useUnreadCount, type FeedItem } from "../react/index";

export const CHANNEL_LABELS: Record<Channel, string> = { in_app: "In the app", push: "Push", email: "Email" };

function relative(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString();
}

export interface FeedRowProps {
  item: FeedItem;
  onOpen?: (item: FeedItem) => void;
  testID?: string;
}

/** One feed row: unread dot, title, body, age. */
export function NotificationRowView({ item, onOpen, testID }: FeedRowProps) {
  return (
    <Button
      variant="ghost"
      data-testid={testID ?? `notification-${item.id}`}
      onClick={() => onOpen?.(item)}
      className={cn("h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-2 text-left font-normal", item.unread && "bg-muted/40")}
    >
      <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.unread ? "bg-primary" : "bg-transparent")} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", item.unread ? "font-semibold" : "font-medium")}>{item.title}</span>
        {item.body ? <span className="block truncate text-sm text-muted-foreground">{item.body}</span> : null}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{relative(item.created_at)}</span>
      {item.unread ? <span className="sr-only">Unread</span> : null}
    </Button>
  );
}

export interface NotificationBellProps {
  /** Opens a notification's link (your router's navigate). Marked read first. */
  onOpen?: (item: FeedItem) => void;
  /** Where "See all" goes. */
  onSeeAll?: () => void;
  /** How many to show. Default 8. */
  limit?: number;
  className?: string;
}

/**
 * The bell. Opening it marks what it shows as seen; opening a row marks it read.
 *
 * @stability Beta
 */
export function NotificationBell({ onOpen, onSeeAll, limit = 8, className }: NotificationBellProps) {
  const unread = useUnreadCount();
  const { items, markRead, markAllRead, markAllSeen } = useNotifications({ limit });
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Popover onOpenChange={(open) => (open && items.some((i) => !i.seen_at) ? void markAllSeen() : undefined)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} data-testid="notification-bell" className={cn("relative", className)}>
          <Bell aria-hidden className="h-5 w-5" />
          {unread > 0 ? (
            <Badge data-testid="notification-bell-count" className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-xs">
              {unread > 99 ? "99+" : unread}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 ? (
            <Button variant="link" size="sm" className="h-auto p-0" data-testid="notification-bell-mark-all" onClick={() => void markAllRead()}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <Separator />
        {items.length === 0 ? (
          <EmptyState title="No notifications" description="When you get one, it'll show up here." className="py-8" />
        ) : (
          <ScrollArea className="max-h-96">
            <div className="p-1">
              {items.map((item) => (
                <NotificationRowView
                  key={item.id}
                  item={item}
                  onOpen={(i) => {
                    if (i.unread) void markRead(i.id);
                    onOpen?.(i);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        )}
        {onSeeAll ? (
          <>
            <Separator />
            <Button variant="ghost" className="w-full rounded-t-none" data-testid="notification-bell-see-all" onClick={onSeeAll}>
              See all
            </Button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export interface NotificationFeedProps {
  onOpen?: (item: FeedItem) => void;
  limit?: number;
  title?: ReactNode;
}

/**
 * The whole feed, in a card: mark read on open, archive, mark all read.
 *
 * @stability Beta
 */
export function NotificationFeed({ onOpen, limit = 100, title = "Notifications" }: NotificationFeedProps) {
  const { items, isLoading, error, markRead, markAllRead, archive } = useNotifications({ limit });
  const anyUnread = items.some((i) => i.unread);
  return (
    <Card data-testid="notification-feed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        {anyUnread ? (
          <Button variant="outline" size="sm" data-testid="notification-feed-mark-all" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-2">
        {error ? (
          <EmptyState title="Couldn't load notifications" description="Check your connection and try again." />
        ) : isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No notifications" description="When you get one, it'll show up here." />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <NotificationRowView
                  item={item}
                  onOpen={(i) => {
                    if (i.unread) void markRead(i.id);
                    onOpen?.(i);
                  }}
                />
                <Button variant="ghost" size="sm" aria-label={`Archive ${item.title}`} data-testid={`notification-archive-${item.id}`} onClick={() => void archive(item.id)}>
                  Archive
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Categories × channels, a switch each. Critical categories are locked on.
 * Saves each change at once and puts it back if the save fails.
 *
 * @stability Beta
 */
export function PreferencesMatrix({ channelLabels = CHANNEL_LABELS }: { channelLabels?: Partial<Record<Channel, string>> }) {
  const { rows, status, set } = usePreferences();
  const columns = (["in_app", "push", "email"] as const).filter((ch) => rows.some((r) => r.channels.includes(ch)));
  if (status === "error") return <EmptyState title="Couldn't load your notification settings" description="Check your connection and try again." />;
  return (
    <Table data-testid="notification-preferences">
      <TableHeader>
        <TableRow>
          <TableHead>Notify me about</TableHead>
          {columns.map((ch) => (
            <TableHead key={ch} className="text-center">
              {channelLabels[ch] ?? CHANNEL_LABELS[ch]}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="font-medium">{row.label}</div>
              {row.description ? <div className="text-sm text-muted-foreground">{row.description}</div> : null}
              {row.critical ? <div className="text-xs text-muted-foreground">Always on</div> : null}
            </TableCell>
            {columns.map((ch) => (
              <TableCell key={ch} className="text-center">
                {row.channels.includes(ch) ? (
                  <Switch
                    aria-label={`${row.label}: ${channelLabels[ch] ?? CHANNEL_LABELS[ch]}`}
                    data-testid={`notification-preference-${row.id}-${ch}`}
                    checked={Boolean(row.values[ch])}
                    disabled={status !== "ready" || row.critical}
                    onCheckedChange={(on) =>
                      void set(row.id, ch, on).catch(() => toast.error("Couldn't save that change. Check your connection and try again."))
                    }
                  />
                ) : (
                  <span className="text-muted-foreground" aria-label="Not available">
                    –
                  </span>
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "info"> = {
  delivered: "success",
  sent: "success",
  pending: "info",
  sending: "info",
  failed: "destructive",
  skipped: "muted",
  cancelled: "muted",
};

/**
 * Admin: the delivery log, newest first. Row level security shows an admin
 * their tenants' rows only; content and full addresses are never here.
 *
 * @stability Beta
 */
export function DeliveryLog({ tenantId, limit = 100 }: { tenantId?: string | null; limit?: number }) {
  const { client, userId } = useNotificationsContext();
  const query = useQuery({ queryKey: ["genesis-notifications", userId, "log", tenantId ?? "all", limit], queryFn: () => client.deliveryLog({ tenantId, limit }), enabled: userId !== null });
  const rows = query.data ?? [];
  return (
    <Card data-testid="notification-delivery-log">
      <CardHeader>
        <CardTitle>Delivery log</CardTitle>
        <CardDescription>Every push and email the app sent, and what became of it.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <EmptyState title="Couldn't load the log" description="You may not be an admin of this workspace." />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing sent yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`notification-delivery-${r.id}`}>
                  <TableCell className="whitespace-nowrap text-sm">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.type}</TableCell>
                  <TableCell>{r.channel === "email" ? "Email" : "Push"}</TableCell>
                  <TableCell className="text-sm">{r.recipient_masked ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.skip_reason ?? r.error ?? (r.attempts > 1 ? `${r.attempts} attempts` : "")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const REASONS: Record<string, string> = { bounce: "Bounced", complaint: "Marked as spam", unsubscribe: "Unsubscribed", manual: "Added by an admin" };

/**
 * Admin: addresses the app won't email (by a masked address; the list keeps
 * only a hash), and lifting one.
 *
 * @stability Beta
 */
export function SuppressionList({ limit = 200 }: { limit?: number }) {
  const { client, userId } = useNotificationsContext();
  const queryClient = useQueryClient();
  const key = ["genesis-notifications", userId, "suppressions", limit];
  const query = useQuery({ queryKey: key, queryFn: () => client.suppressions({ limit }), enabled: userId !== null });
  const rows = query.data ?? [];
  return (
    <Card data-testid="notification-suppressions">
      <CardHeader>
        <CardTitle>Suppressed addresses</CardTitle>
        <CardDescription>Bounces and spam complaints stop email to an address; lift one once it's fixed.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <EmptyState title="Couldn't load the list" description="Only the app's admins can see it." />
        ) : rows.length === 0 ? (
          <EmptyState title="No suppressed addresses" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Why</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Since</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.email_hash}:${r.category}`}>
                  <TableCell>{r.email_masked ?? `${r.email_hash.slice(0, 8)}…`}</TableCell>
                  <TableCell>{REASONS[r.reason] ?? r.reason}</TableCell>
                  <TableCell>{r.category === "*" ? "All" : r.category}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`notification-suppression-lift-${r.email_hash.slice(0, 12)}`}
                      onClick={async () => {
                        try {
                          await client.removeSuppression(r.email_hash, r.category);
                          await queryClient.invalidateQueries({ queryKey: key });
                        } catch {
                          toast.error("Couldn't lift it. Try again.");
                        }
                      }}
                    >
                      Lift
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Admin: send yourself a test notification (in the app, push and email).
 *
 * @stability Beta
 */
export function SendTestNotification({ tenantId = null, label = "Send a test" }: { tenantId?: string | null; label?: string }) {
  const { client } = useNotificationsContext();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(true);
  useEffect(() => () => setMounted(false), []);
  return (
    <Button
      data-testid="notification-send-test"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await client.sendTest(tenantId);
          toast.success("Test sent. It reaches you on each channel you have on.");
        } catch {
          toast.error("Couldn't send the test. Only admins can.");
        } finally {
          if (mounted) setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
