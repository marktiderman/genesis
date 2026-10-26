/**
 * `@marktiderman/genesis-notifications/native`: the notifier on the phone.
 *
 *   NotificationsFeed            the feed on genesis-ui-native's NotificationsPage
 *   useNotificationsFeedHeader   the "Mark all read" header for the feed's Stack.Screen
 *   ChannelPreferences           category × channel switches, as NotificationSettings' `categories` part
 *   NotificationPreferences      genesis-native's NotificationSettings with that part in place
 *   notificationsPushBackend     the push block's `PushBackend` on this package's migration
 *   notificationsPushPreferences only its preferences half, beside an app's own register / forget
 *   pushOptionsFrom(registry)    the push block's categories, Android channels and device categories
 *   notificationAction           a tapped action button (Reply, Mark as read), with the notification id
 *
 * The device side stays in genesis-native's push block (registration,
 * permission, routing, badge, hiding a push for the screen already open);
 * this is what connects it to the notifier.
 *
 * @packageDocumentation
 */
import { useMemo } from "react";
import { NativeListItem, NativeSwitch } from "@marktiderman/genesis-ui-native/components";
import { NotificationsPage, getNotificationsPageStackOptions, type NotificationItem, type NotificationsPageProps } from "@marktiderman/genesis-ui-native/layouts";
import {
  NotificationSettings,
  notificationAction,
  type CategoriesPartProps,
  type NotificationAction,
  type NotificationCategory,
  type NotificationPreferences as PushPreferences,
  type NotificationSettingsProps,
  type PushBackend,
  type PushDeviceCategory,
  type PushOptions,
} from "@marktiderman/genesis-native/push";
import type { Channel, NotificationRegistry } from "../core/index";
import { useNotifications, usePreferences, type FeedItem } from "../react/index";
import { choicesOf } from "../supabase/index";

export { notificationAction, type NotificationAction };

export const CHANNEL_LABELS: Record<Channel, string> = { in_app: "In the app", push: "Push", email: "Email" };

/** How many notifications the feed (and its header) reads: one query, shared by both. */
export const NOTIFICATIONS_FEED_LIMIT = 100;

export interface NotificationsFeedProps extends Omit<NotificationsPageProps, "items" | "refreshing" | "onRefresh" | "onMarkAllRead"> {
  /** Opens a notification's link (`router.push(item.url)`); it is marked read first. */
  onOpen?: (item: FeedItem) => void;
  limit?: number;
}

/**
 * The feed on ui-native's `NotificationsPage`: pull to refresh, unread dots,
 * a tap marks read and opens. Realtime refetches it (NotificationsProvider).
 *
 * @stability Beta
 */
export function NotificationsFeed({ onOpen, limit = NOTIFICATIONS_FEED_LIMIT, ...page }: NotificationsFeedProps) {
  const { items, isRefetching, refetch, markRead } = useNotifications({ limit });
  const rows = useMemo<NotificationItem[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        title: item.title,
        ...(item.body ? { body: item.body } : {}),
        timestamp: item.created_at,
        unread: item.unread,
        onPress: () => {
          if (item.unread) void markRead(item.id);
          onOpen?.(item);
        },
      })),
    [items, markRead, onOpen],
  );
  return (
    <NotificationsPage
      testID="notifications"
      {...page}
      items={rows}
      refreshing={isRefetching}
      onRefresh={async () => {
        await refetch();
      }}
    />
  );
}

/**
 * The feed's `Stack.Screen` options, with "Mark all read" while anything is
 * unread. Pass the feed's `limit` if you changed it, so both read one query.
 */
export function useNotificationsFeedHeader(options: { headerTitle?: string; limit?: number } = {}): Record<string, unknown> {
  const { items, markAllRead } = useNotifications({ limit: options.limit ?? NOTIFICATIONS_FEED_LIMIT });
  const unread = items.some((i) => i.unread);
  // With nothing unread the header gets an explicit empty right side: leaving it out would keep the old button.
  return getNotificationsPageStackOptions({
    headerTitle: options.headerTitle,
    ...(unread ? { onMarkAllRead: () => void markAllRead() } : { headerRight: () => null }),
  });
}

/**
 * Category × channel switches (push and email, and the feed when a type
 * offers it as optional), for NotificationSettings' `categories` slot. It
 * ignores the push block's own category switches and reads the notifier's
 * preferences instead.
 *
 * @stability Beta
 */
export function ChannelPreferences(_props: Partial<CategoriesPartProps> & { channelLabels?: Partial<Record<Channel, string>> }) {
  const { rows, status, set } = usePreferences();
  const labels = { ...CHANNEL_LABELS, ..._props.channelLabels };
  return (
    <>
      {rows.flatMap((row) =>
        row.channels.map((ch) => (
          <NativeListItem
            key={`${row.id}:${ch}`}
            testID={`notification-preference-${row.id}-${ch}`}
            title={row.label}
            subtitle={row.critical ? `${labels[ch]} · Always on` : labels[ch]}
            trailing={
              <NativeSwitch
                testID={`notification-preference-${row.id}-${ch}-switch`}
                accessibilityLabel={`${row.label}: ${labels[ch]}`}
                checked={Boolean(row.values[ch])}
                disabled={status !== "ready" || row.critical}
                onCheckedChange={(on) => void set(row.id, ch, on).catch(() => undefined)}
              />
            }
          />
        )),
      )}
    </>
  );
}

/**
 * Settings → Notifications with the notifier's channel switches: the push
 * block's permission, quiet hours and previews, and `ChannelPreferences` for
 * the categories. Needs the push block and NotificationsProvider.
 *
 * @stability Beta
 */
export function NotificationPreferences(props: NotificationSettingsProps) {
  return <NotificationSettings {...props} slots={{ categories: ChannelPreferences, ...props.slots }} />;
}

/**
 * What the push block needs from the registry: a category per notification
 * category (its Android channel; NotificationSettings shows the categories
 * section only when there are some), and the device categories with their
 * action buttons.
 *
 * @stability Beta
 */
export function pushOptionsFrom(registry: NotificationRegistry): Pick<PushOptions, "categories" | "deviceCategories"> {
  const categories: NotificationCategory[] = registry.androidChannels().map((c) => ({
    id: c.id,
    title: c.name,
    ...(c.description ? { description: c.description } : {}),
    importance: c.importance,
  }));
  const deviceCategories: PushDeviceCategory[] = registry.deviceCategories();
  return { categories, deviceCategories };
}

type Result = { data: unknown; error: { code?: string | null } | null };

/** The parts of a Supabase client the backend uses. */
export interface PushBackendClientLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, args?: any) => PromiseLike<Result>;
  from(table: string): unknown;
}

interface PreferencesQuery {
  select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<Result> } };
  upsert(row: Record<string, unknown>, options: { onConflict: string }): { select(columns: string): PromiseLike<Result> };
}

/** A database refusal, with its SQLSTATE; never a token. */
export class NotificationsPushBackendError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | null,
  ) {
    super(`${operation} failed${code ? ` (${code})` : ""}`);
    this.name = "NotificationsPushBackendError";
  }
}

function clock(value: unknown, fallback: string): string {
  const match = typeof value === "string" ? /^(\d{2}):(\d{2})/.exec(value) : null;
  return match ? `${match[1]}:${match[2]}` : fallback;
}

/** The preferences half of the push block's `PushBackend`: what Settings → Notifications reads and saves. */
export type PushPreferencesBackend = Pick<PushBackend, "loadPreferences" | "savePreferences">;

/**
 * The push block's `loadPreferences` / `savePreferences` on
 * genesis-notifications' migration, for an app that registers devices its
 * own way: spread it into the backend and NotificationSettings (quiet hours,
 * previews, the category switches) works.
 *
 *   createPush({ backend: { register, forget, ...notificationsPushPreferences(supabase) }, … })
 *
 * Each category switch is that category's push channel
 * (`genesis_notifications_set_preference`, one cell at a time, and only the
 * ones that changed, so nothing else in the row is overwritten). A category
 * no notifier type sends push in (chat's `messages` while chat still sends
 * through 0005's sender) keeps its switch in 0005's `categories`, which that
 * sender reads, instead of failing the whole save. Quiet hours and previews
 * are the row's own columns. `loadPreferences` answers `null` before the
 * person saved anything, and a save row level security refuses throws.
 *
 * @stability Beta
 */
export function notificationsPushPreferences(client: PushBackendClientLike): PushPreferencesBackend {
  const must = (operation: string, result: Result) => {
    if (result.error) throw new NotificationsPushBackendError(operation, result.error.code ?? null);
    return result.data;
  };
  // The push channel per category as last loaded or saved, so a save writes only what changed.
  let known: Record<string, boolean> = {};
  // 0005's `categories` as last loaded or saved: the switches of categories the notifier has no push type in.
  let legacy: Record<string, boolean> = {};
  return {
    async loadPreferences(userId) {
      const data = must(
        "notification_preferences",
        await (client.from("notification_preferences") as PreferencesQuery)
          .select("channels, categories, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, time_zone, hide_previews")
          .eq("user_id", userId)
          .maybeSingle(),
      ) as Record<string, unknown> | null;
      known = {};
      legacy = {};
      if (!data) return null;
      if (data.categories && typeof data.categories === "object") {
        for (const [category, on] of Object.entries(data.categories as Record<string, unknown>)) if (typeof on === "boolean") legacy[category] = on;
      }
      // As the server reads it: the push channel chosen, or 0005's switch for the whole category.
      for (const [category, row] of Object.entries(choicesOf(data))) if (typeof row.push === "boolean") known[category] = row.push;
      return {
        categories: { ...known },
        quietHours: {
          enabled: data.quiet_hours_enabled === true,
          start: clock(data.quiet_hours_start, "22:00"),
          end: clock(data.quiet_hours_end, "07:00"),
          timeZone: typeof data.time_zone === "string" ? data.time_zone : null,
        },
        hidePreviews: data.hide_previews === true,
      } satisfies PushPreferences;
    },
    async savePreferences(userId, p) {
      let legacyChanged = false;
      for (const [category, on] of Object.entries(p.categories)) {
        if (known[category] === on) continue;
        const result = await client.rpc("genesis_notifications_set_preference", { p_category: category, p_channel: "push", p_on: on });
        // 42704 is only "no type in that category uses push"; any other refusal (a critical category, 22023) is thrown.
        if (result.error?.code === "42704") {
          // No notifier type sends push in this category: keep the switch where 0005's sender reads it.
          legacy[category] = on;
          legacyChanged = true;
        } else {
          must("genesis_notifications_set_preference", result);
          // The server moved this category's 0005 switch into channel choices.
          if (category in legacy) delete legacy[category];
        }
        known[category] = on;
      }
      const row = {
        ...(legacyChanged ? { categories: { ...legacy } } : {}),
        user_id: userId,
        quiet_hours_enabled: p.quietHours.enabled,
        quiet_hours_start: p.quietHours.start,
        quiet_hours_end: p.quietHours.end,
        time_zone: p.quietHours.timeZone,
        hide_previews: p.hidePreviews,
      };
      const data = must("notification_preferences", await (client.from("notification_preferences") as PreferencesQuery).upsert(row, { onConflict: "user_id" }).select("user_id"));
      // Row level security turns a write it refuses into zero rows, not an error.
      if (!Array.isArray(data) || data.length !== 1) throw new NotificationsPushBackendError("notification_preferences", "no_rows");
    },
  };
}

/**
 * The push block's `PushBackend` on genesis-notifications' migration:
 * registers with this install's id (so a token moves between logins only on
 * its own phone), and keeps preferences with `notificationsPushPreferences`.
 *
 * @stability Beta
 */
export function notificationsPushBackend(client: PushBackendClientLike): PushBackend {
  const must = (operation: string, result: Result) => {
    if (result.error) throw new NotificationsPushBackendError(operation, result.error.code ?? null);
    return result.data;
  };
  return {
    usesInstallationId: true,
    async register(token, platform, appVersion, installationId) {
      must("genesis_push_register", await client.rpc("genesis_push_register", { p_token: token, p_platform: platform, p_app_version: appVersion, p_installation_id: installationId ?? null }));
    },
    async forget(token) {
      must("genesis_push_forget", await client.rpc("genesis_push_forget", { p_token: token }));
    },
    ...notificationsPushPreferences(client),
  };
}
