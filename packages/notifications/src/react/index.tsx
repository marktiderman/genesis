/**
 * `@marktiderman/genesis-notifications/react`: the hooks every screen uses,
 * on web and native alike. `NotificationsProvider` holds the client, the
 * registry and the signed-in user, and listens on the person's private
 * realtime channel: any change refetches (the broadcast carries ids only).
 *
 *   useNotifications()   the feed, each row rendered by the registry, plus mark read / archive
 *   useUnreadCount()     the unread count, for a bell or a tab badge
 *   usePreferences()     the category × channel matrix and its switches
 *
 * Built on TanStack Query (a peer): the app's QueryClientProvider must be above.
 *
 * @packageDocumentation
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, ChannelChoices, MatrixRow, NotificationRegistry, NotificationRow } from "../core/index";
import { notificationsClient, type FeedFilter, type NotificationsClient, type NotificationsSupabaseLike } from "../supabase/index";

interface Context {
  client: NotificationsClient;
  registry: NotificationRegistry;
  userId: string | null;
}

const NotificationsContext = createContext<Context | null>(null);

export interface NotificationsProviderProps {
  /** A Supabase client signed in as the person (or a `notificationsClient`). */
  client: NotificationsSupabaseLike | NotificationsClient;
  registry: NotificationRegistry;
  /** The signed-in user; null while signed out (nothing is read). */
  userId: string | null;
  /** Listen on `user:<id>` and refetch on a change. Default true. */
  realtime?: boolean;
  children?: ReactNode;
}

const isClient = (c: NotificationsSupabaseLike | NotificationsClient): c is NotificationsClient => typeof (c as NotificationsClient).feed === "function";

/** The query keys, for an app that invalidates them itself. */
export const notificationKeys = {
  all: (userId: string | null) => ["genesis-notifications", userId] as const,
  feed: (userId: string | null, filter: FeedFilter, limit: number) => ["genesis-notifications", userId, "feed", filter, limit] as const,
  unread: (userId: string | null) => ["genesis-notifications", userId, "unread"] as const,
  choices: (userId: string | null) => ["genesis-notifications", userId, "choices"] as const,
};

/**
 * Provides the notifier to the hooks.
 *
 * @stability Beta
 */
export function NotificationsProvider({ client, registry, userId, realtime = true, children }: NotificationsProviderProps) {
  const resolved = useMemo(() => (isClient(client) ? client : notificationsClient(client)), [client]);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!realtime || !userId) return;
    try {
      return resolved.subscribe(userId, () => {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) });
      });
    } catch (error) {
      console.warn(`[genesis-notifications] couldn't listen for feed changes: ${error instanceof Error ? error.message : "unknown error"}`);
      return undefined;
    }
  }, [resolved, userId, realtime, queryClient]);
  const value = useMemo(() => ({ client: resolved, registry, userId }), [resolved, registry, userId]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** The provider's client, registry and user. Throws outside one. */
export function useNotificationsContext(): Context {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications: wrap the screen in <NotificationsProvider>.");
  return ctx;
}

/** A feed row with what the registry says about it. */
export interface FeedItem extends NotificationRow {
  title: string;
  body?: string;
  url?: string;
  unread: boolean;
}

export interface UseNotificationsResult {
  items: FeedItem[];
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  markRead: (ids: string | readonly string[]) => Promise<void>;
  markUnread: (ids: string | readonly string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  archive: (ids: string | readonly string[]) => Promise<void>;
  /** Mark everything shown as seen (opening the feed); the unread count is about read, not seen. */
  markAllSeen: () => Promise<void>;
}

/**
 * The person's feed.
 *
 * @stability Beta
 */
export function useNotifications(options: { filter?: FeedFilter; limit?: number } = {}): UseNotificationsResult {
  const { client, registry, userId } = useNotificationsContext();
  const filter = options.filter ?? "all";
  const limit = options.limit ?? 50;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationKeys.feed(userId, filter, limit),
    queryFn: () => client.feed({ filter, limit }),
    enabled: userId !== null,
  });
  const items = useMemo<FeedItem[]>(
    () =>
      (query.data ?? []).map((row) => {
        const text = registry.render(row.type, row.data ?? {});
        return { ...row, ...text, unread: row.read_at === null };
      }),
    [query.data, registry],
  );
  const changed = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) });
  const mark = useMutation({
    mutationFn: ({ ids, state }: { ids: readonly string[]; state: "seen" | "read" | "unread" | "archived" }) => client.mark(ids, state),
    onSettled: changed,
  });
  const all = useMutation({ mutationFn: (state: "seen" | "read") => client.markAll(state), onSettled: changed });
  const list = (ids: string | readonly string[]) => (typeof ids === "string" ? [ids] : ids);
  return {
    items,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: (query.error as Error | null) ?? null,
    refetch: () => query.refetch(),
    markRead: async (ids) => void (await mark.mutateAsync({ ids: list(ids), state: "read" })),
    markUnread: async (ids) => void (await mark.mutateAsync({ ids: list(ids), state: "unread" })),
    archive: async (ids) => void (await mark.mutateAsync({ ids: list(ids), state: "archived" })),
    markAllRead: async () => void (await all.mutateAsync("read")),
    markAllSeen: async () => void (await all.mutateAsync("seen")),
  };
}

/**
 * The unread count (0 while signed out).
 *
 * @stability Beta
 */
export function useUnreadCount(): number {
  const { client, userId } = useNotificationsContext();
  const query = useQuery({ queryKey: notificationKeys.unread(userId), queryFn: () => client.unreadCount(), enabled: userId !== null });
  return query.data ?? 0;
}

/** One category's row in the matrix. */
export interface PreferenceRow extends MatrixRow {
  /** What each offered channel is now: the person's choice, else the default. */
  values: Partial<Record<Channel, boolean>>;
  /** Which values the person chose (the rest are defaults). */
  chosen: Partial<Record<Channel, boolean>>;
}

export interface UsePreferencesResult {
  rows: PreferenceRow[];
  status: "loading" | "ready" | "error";
  error: Error | null;
  saving: boolean;
  /** Turn one category's channel on or off; `null` goes back to the default. Critical rows can't be turned off. */
  set: (category: string, channel: Channel, on: boolean | null) => Promise<void>;
}

/** The matrix with the person's choices applied. Exported for tests and custom screens. */
export function preferenceRows(registry: NotificationRegistry, choices: ChannelChoices): PreferenceRow[] {
  return registry.matrix().map((row) => {
    const chosen = choices[row.id] ?? {};
    const values: Partial<Record<Channel, boolean>> = {};
    for (const ch of row.channels) values[ch] = row.critical ? Boolean(row.defaults[ch]) : (chosen[ch] ?? Boolean(row.defaults[ch]));
    return { ...row, values, chosen: row.critical ? {} : chosen };
  });
}

/**
 * The person's preferences by category and channel. A tenant's default
 * isn't shown here (the server applies it); what shows for a channel the
 * person never chose is the type's default.
 *
 * @stability Beta
 */
export function usePreferences(): UsePreferencesResult {
  const { client, registry, userId } = useNotificationsContext();
  const queryClient = useQueryClient();
  const key = notificationKeys.choices(userId);
  const query = useQuery({ queryKey: key, queryFn: () => client.choices(userId!), enabled: userId !== null });
  const save = useMutation({
    mutationFn: ({ category, channel, on }: { category: string; channel: Channel; on: boolean | null }) => client.setChoice(category, channel, on),
    onMutate: async ({ category, channel, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<ChannelChoices>(key);
      const next: ChannelChoices = { ...(before ?? {}) };
      const row = { ...(next[category] ?? {}) };
      if (on === null) delete row[channel];
      else row[channel] = on;
      next[category] = row;
      queryClient.setQueryData(key, next);
      return { before };
    },
    onError: (_e, _v, context) => queryClient.setQueryData(key, context?.before),
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });
  const rows = useMemo(() => preferenceRows(registry, query.data ?? {}), [registry, query.data]);
  return {
    rows,
    status: query.isError ? "error" : query.isSuccess ? "ready" : "loading",
    error: ((query.error ?? save.error) as Error | null) ?? null,
    saving: save.isPending,
    set: async (category, channel, on) => {
      const row = rows.find((r) => r.id === category);
      if (!row || !row.channels.includes(channel) || (row.critical && on === false)) return;
      await save.mutateAsync({ category, channel, on });
    },
  };
}

export { notificationsClient, type NotificationsClient } from "../supabase/index";
