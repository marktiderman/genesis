// @feat:chat
/**
 * Chat pushes through genesis-notifications: `notificationsDeliver` hands a
 * message's `ChatNotification` to `notify()` (one call, every recipient with
 * their own badge), and `CHAT_NOTIFICATION_TYPES` / `CHAT_NOTIFICATION_CATEGORIES`
 * go into the app's `defineNotifications` registry. Typed structurally, so
 * genesis-chat doesn't depend on genesis-notifications; its tests check the
 * shapes against the real package.
 *
 * ```ts
 * import { notify } from "@marktiderman/genesis-notifications/server";
 * const deliver = notificationsDeliver({ notify, client: supabase, registry: notifications });
 * ```
 *
 * The preferences, quiet hours, channels and devices are genesis-notifications'.
 */
import type { ChatDeliver, ChatNotification } from "./types";

/** The notification type id chat pushes go out as. */
export const CHAT_NOTIFICATION_TYPE_ID = "chat.message";

/** What `notify()` receives for a chat message (a `NotifyInput<"chat.message">`). */
export interface ChatNotifyInput {
  type: string;
  recipients: { userId: string; badge?: number }[];
  data: {
    url: string;
    conversationId: string;
    messageId: string;
    seq: number | null;
    title: string;
    body: string;
    senderId: string | null;
  };
  idempotencyKey: string;
  threadKey: string;
  collapseKey?: string;
  tenantId?: string;
}

export interface NotificationsDeliverOptions<Client, Registry> {
  /** genesis-notifications' `notify` from `@marktiderman/genesis-notifications/server`. */
  notify: (client: Client, input: ChatNotifyInput, options?: { registry?: Registry }) => Promise<unknown>;
  /** The service-role client `notify` calls `genesis_notify` through. */
  client: Client;
  /** Passed to `notify` as `{ registry }`, so an unknown type fails before the database. */
  registry?: Registry | undefined;
  /** Default `chat.message`. `collapseKey` is passed on only when the runner set it (its `collapse` option). */
  type?: string | undefined;
  /** The practice or workspace the conversation belongs to, when the app has one. */
  tenantFor?: ((notification: ChatNotification) => string | null | undefined | Promise<string | null | undefined>) | undefined;
}

/** Maps a chat push onto genesis-notifications' `notify()` (exported for tests and apps that call notify themselves). */
export function chatNotifyInput(notification: ChatNotification, options: { type?: string | undefined } = {}): ChatNotifyInput {
  return {
    type: options.type ?? CHAT_NOTIFICATION_TYPE_ID,
    recipients: notification.recipients.map((r) => ({ userId: r.userId, badge: Math.max(0, Math.floor(r.badge)) })),
    data: {
      url: notification.data.url,
      conversationId: notification.conversationId,
      messageId: notification.messageId,
      seq: notification.data.seq,
      title: notification.title,
      body: notification.body,
      senderId: notification.senderId,
    },
    idempotencyKey: notification.idempotencyKey,
    threadKey: notification.threadKey,
    ...(notification.collapseKey ? { collapseKey: notification.collapseKey } : {}),
  };
}

export function notificationsDeliver<Client, Registry>(options: NotificationsDeliverOptions<Client, Registry>): ChatDeliver {
  return async (notification) => {
    const input = chatNotifyInput(notification, options);
    const tenant = options.tenantFor ? await options.tenantFor(notification) : null;
    if (tenant) input.tenantId = tenant;
    return options.registry === undefined
      ? options.notify(options.client, input)
      : options.notify(options.client, input, { registry: options.registry });
  };
}

/** The `messages` category, for `defineNotifications({ categories })`. */
export const CHAT_NOTIFICATION_CATEGORIES = {
  messages: { label: "Messages", description: "New messages in your conversations.", android: { importance: "high" } },
} as const;

/**
 * The `chat.message` type, for `defineNotifications({ types })`: in the feed and
 * pushed, no email unless the app adds it. Spread it and override what you need
 * (`actions: "message"` with genesis-notifications' `MESSAGE_ACTIONS` for reply
 * and mark-as-read buttons).
 */
export const CHAT_NOTIFICATION_TYPES = {
  [CHAT_NOTIFICATION_TYPE_ID]: {
    category: "messages",
    channels: { in_app: true, push: true },
    render: (data: Record<string, unknown>) => ({
      title: typeof data.title === "string" && data.title ? data.title : "New message",
      ...(typeof data.body === "string" && data.body ? { body: data.body } : {}),
      ...(typeof data.url === "string" ? { url: data.url } : {}),
    }),
  },
} as const;
