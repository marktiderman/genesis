/**
 * `@marktiderman/genesis-notifications/supabase`: the migration this package
 * ships (`migrations/0001_genesis_notifications.sql`, with its pgTAP test),
 * and `notificationsClient(supabase)`, the browser and phone side over it:
 * the person's feed, unread count, marks and preferences under row level
 * security, the realtime nudge on `user:<id>`, and the admin views.
 *
 * @packageDocumentation
 */
import type { Channel, ChannelChoices, NotificationRow } from "../core/index";

export const NOTIFICATIONS_PACKAGE = "@marktiderman/genesis-notifications";

/** The migrations to copy, in order, with their tests. */
export const NOTIFICATIONS_MIGRATIONS = [
  { package: NOTIFICATIONS_PACKAGE, file: "migrations/0001_genesis_notifications.sql", test: "migrations/tests/0001_genesis_notifications.test.sql" },
] as const;

type Result = { data: unknown; error: { message?: string; code?: string | null } | null; count?: number | null };

interface Query extends PromiseLike<Result> {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  not(column: string, op: string, value: unknown): Query;
  lt(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(n: number): Query;
  maybeSingle(): PromiseLike<Result>;
}

interface Channel_ {
  on(type: "broadcast", filter: { event: string }, callback: (payload: unknown) => void): Channel_;
  subscribe(callback?: (status: string) => void): Channel_;
}

/** The parts of a Supabase client used here; a `SupabaseClient` fits, typed by your Database or not. */
export interface NotificationsSupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, args?: any) => PromiseLike<Result>;
  from(table: string): unknown;
  channel(name: string, options?: { config?: { private?: boolean } }): unknown;
  removeChannel(channel: unknown): unknown;
  realtime?: { setAuth?: (token?: string | null) => unknown };
}

/** A database refusal, with its SQLSTATE. */
export class NotificationsClientError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | null,
  ) {
    super(`${operation} failed${code ? ` (${code})` : ""}`);
    this.name = "NotificationsClientError";
  }
}

export type FeedFilter = "all" | "unread" | "archived";

/** One row of the admin's delivery log: no content, a masked address. */
export interface DeliveryLogRow {
  id: string;
  notification_id: string;
  tenant_id: string | null;
  type: string;
  channel: "push" | "email";
  status: string;
  attempts: number;
  error: string | null;
  skip_reason: string | null;
  recipient_masked: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface SuppressionRow {
  email_hash: string;
  category: string;
  reason: "bounce" | "complaint" | "unsubscribe" | "manual";
  email_masked: string | null;
  created_at: string;
}

export interface NotificationsClient {
  feed(options?: { filter?: FeedFilter; limit?: number; before?: string }): Promise<NotificationRow[]>;
  unreadCount(): Promise<number>;
  mark(ids: readonly string[], state: "seen" | "read" | "unread" | "archived" | "unarchived"): Promise<number>;
  markAll(state: "seen" | "read"): Promise<number>;
  /** The signed-in person's choices (category → channel → on); `{}` before they chose. */
  choices(userId: string): Promise<ChannelChoices>;
  /** One category and channel; `null` returns it to the default. Resolves the person's choices after. */
  setChoice(category: string, channel: Channel, on: boolean | null): Promise<ChannelChoices>;
  /** Calls `onChange` whenever the person's feed changes (a broadcast on `user:<id>`). Returns the stop. */
  subscribe(userId: string, onChange: () => void): () => void;
  /** Admin: the delivery log (row level security shows an admin their tenants'). */
  deliveryLog(options?: { tenantId?: string | null; status?: string; limit?: number }): Promise<DeliveryLogRow[]>;
  /** Admin: the suppression list (platform admins). */
  suppressions(options?: { limit?: number }): Promise<SuppressionRow[]>;
  removeSuppression(emailHash: string, category?: string): Promise<boolean>;
  /** Admin: a test notification to yourself, on every channel you have. */
  sendTest(tenantId?: string | null): Promise<string | null>;
}

export const FEED_COLUMNS = "id, type, category, tenant_id, data, thread_key, created_at, seen_at, read_at, archived_at";
const LOG_COLUMNS = "id, notification_id, tenant_id, type, channel, status, attempts, error, skip_reason, recipient_masked, created_at, sent_at";

/**
 * The browser and phone side of the notifier, under the signed-in person's
 * row level security.
 *
 * @stability Beta
 */
export function notificationsClient(client: NotificationsSupabaseLike): NotificationsClient {
  const must = (operation: string, result: Result) => {
    if (result.error) throw new NotificationsClientError(operation, result.error.code ?? null);
    return result;
  };
  const table = (name: string) => client.from(name) as Query;
  return {
    async feed({ filter = "all", limit = 50, before } = {}) {
      let q = table("notifications").select(FEED_COLUMNS).eq("in_feed", true);
      q = filter === "archived" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
      if (filter === "unread") q = q.is("read_at", null);
      if (before) q = q.lt("created_at", before);
      const { data } = must("notifications", await q.order("created_at", { ascending: false }).limit(Math.min(Math.max(1, limit), 200)));
      return (data as NotificationRow[] | null) ?? [];
    },
    async unreadCount() {
      const { count } = must(
        "notifications",
        await table("notifications").select("id", { count: "exact", head: true }).eq("in_feed", true).is("read_at", null).is("archived_at", null),
      );
      return count ?? 0;
    },
    async mark(ids, state) {
      if (!ids.length) return 0;
      const { data } = must("genesis_notifications_mark", await client.rpc("genesis_notifications_mark", { p_ids: ids, p_state: state }));
      return Number(data ?? 0);
    },
    async markAll(state) {
      const { data } = must("genesis_notifications_mark_all", await client.rpc("genesis_notifications_mark_all", { p_state: state }));
      return Number(data ?? 0);
    },
    async choices(userId) {
      const { data } = must("notification_preferences", await table("notification_preferences").select("channels").eq("user_id", userId).maybeSingle());
      const channels = (data as { channels?: unknown } | null)?.channels;
      return channels && typeof channels === "object" && !Array.isArray(channels) ? (channels as ChannelChoices) : {};
    },
    async setChoice(category, channel, on) {
      const { data } = must("genesis_notifications_set_preference", await client.rpc("genesis_notifications_set_preference", { p_category: category, p_channel: channel, p_on: on }));
      return (data as ChannelChoices | null) ?? {};
    },
    subscribe(userId, onChange) {
      if (typeof client.channel !== "function") {
        // Loud, not fatal: without realtime the feed still refetches on focus and pull to refresh.
        console.warn("[genesis-notifications] this Supabase client has no realtime (client.channel); the feed won't update live.");
        return () => {};
      }
      const channel = client.channel(`user:${userId}`, { config: { private: true } }) as Channel_;
      channel.on("broadcast", { event: "notification" }, () => onChange()).subscribe();
      return () => {
        client.removeChannel(channel);
      };
    },
    async deliveryLog({ tenantId, status, limit = 100 } = {}) {
      let q = table("notification_deliveries").select(LOG_COLUMNS);
      if (tenantId !== undefined) q = tenantId === null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
      if (status) q = q.eq("status", status);
      const { data } = must("notification_deliveries", await q.order("created_at", { ascending: false }).limit(Math.min(Math.max(1, limit), 500)));
      return (data as DeliveryLogRow[] | null) ?? [];
    },
    async suppressions({ limit = 200 } = {}) {
      const { data } = must(
        "notification_suppressions",
        await table("notification_suppressions").select("email_hash, category, reason, email_masked, created_at").order("created_at", { ascending: false }).limit(Math.min(Math.max(1, limit), 1000)),
      );
      return (data as SuppressionRow[] | null) ?? [];
    },
    async removeSuppression(emailHash, category = "*") {
      const { data } = must("genesis_notifications_remove_suppression", await client.rpc("genesis_notifications_remove_suppression", { p_email_hash: emailHash, p_category: category }));
      return Boolean(data);
    },
    async sendTest(tenantId = null) {
      const { data } = must("genesis_notifications_send_test", await client.rpc("genesis_notifications_send_test", { p_tenant: tenantId }));
      return (data as string | null) ?? null;
    },
  };
}
