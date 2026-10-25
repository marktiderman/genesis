/**
 * @feat:chat
 * Push glue for genesis-native's push block, data only: the `messages`
 * category (a switch in Notification settings and an Android channel), its
 * notification actions (Reply with a text field, Mark read), what a tap opens
 * (`data.url` = `/messages/<conversationId>`), the reply and mark-read
 * handlers for the block's `onResponse`, and the match that keeps a thread's
 * own pushes out of the foreground while it is open (the block's `suppress`).
 *
 *   const push = createPush({ …, categories: [...yours, chatPushCategory()],
 *     onResponse: (r) => void handleChatPushResponse(r, { client: chatClient, notifications: Notifications }) });
 *   void registerChatNotificationActions(Notifications);       // once, at start
 *   useSuppressNotifications(chatThreadMatch(conversationId)); // in the thread screen
 *
 * The sender sets `categoryId: "messages"` (iOS) / the `messages` channel
 * (Android) and `data: { url: "/messages/<id>", conversationId, seq, messageId }`.
 *
 * A reply goes through the outbox, so a phone that is offline keeps it: pass
 * the live one (`useChat().outbox`) when the chat screens are mounted, and the
 * persisted store and user id (`ChatProvider outboxStore`) for when they
 * aren't. A reply that can't be sent then waits there, failed, with Retry in
 * its thread.
 */
import type { ChatClient } from "../core/client";
import type { Outbox, OutboxStore, QueuedMessage } from "../core/outbox";

export const CHAT_PUSH_CATEGORY = "messages";
export const CHAT_REPLY_ACTION = "reply";
export const CHAT_MARK_READ_ACTION = "mark-read";

export interface ChatPushCopy {
  title: string;
  description: string;
  reply: string;
  replySubmit: string;
  replyPlaceholder: string;
  markRead: string;
}

export const chatPushCopy: ChatPushCopy = {
  title: "Messages",
  description: "New messages in your conversations.",
  reply: "Reply",
  replySubmit: "Send",
  replyPlaceholder: "Message",
  markRead: "Mark read",
};

/** The path a message's push opens. */
export function chatPath(conversationId: string): string {
  return `/messages/${conversationId}`;
}

/** The category for createPush's `categories` (genesis-native's NotificationCategory). */
export function chatPushCategory(copy: Partial<ChatPushCopy> = {}) {
  const c = { ...chatPushCopy, ...copy };
  return { id: CHAT_PUSH_CATEGORY, title: c.title, description: c.description, importance: "high" as const };
}

/** expo-notifications' `setNotificationCategoryAsync`, the one call this needs. */
export interface NotificationCategoriesLike {
  setNotificationCategoryAsync(
    identifier: string,
    actions: {
      identifier: string;
      buttonTitle: string;
      textInput?: { submitButtonTitle: string; placeholder: string };
      options?: { opensAppToForeground?: boolean; isDestructive?: boolean; isAuthenticationRequired?: boolean };
    }[],
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  dismissNotificationAsync?(identifier: string): Promise<void>;
}

/** The actions on a message's notification: Reply (a text field) and Mark read, neither opening the app. */
export function chatNotificationActions(copy: Partial<ChatPushCopy> = {}) {
  const c = { ...chatPushCopy, ...copy };
  return [
    {
      identifier: CHAT_REPLY_ACTION,
      buttonTitle: c.reply,
      textInput: { submitButtonTitle: c.replySubmit, placeholder: c.replyPlaceholder },
      options: { opensAppToForeground: false },
    },
    { identifier: CHAT_MARK_READ_ACTION, buttonTitle: c.markRead, options: { opensAppToForeground: false } },
  ];
}

/** Registers the actions with the OS (once, at start; it is idempotent). */
export function registerChatNotificationActions(
  notifications: NotificationCategoriesLike,
  copy?: Partial<ChatPushCopy>,
  onError?: (error: unknown) => void,
): Promise<unknown> {
  // Never throws, at module load least of all: a module without categories (web, a test's mock) is reported.
  try {
    if (typeof notifications?.setNotificationCategoryAsync !== "function") {
      onError?.(new Error("chat push: setNotificationCategoryAsync is missing, so Reply and Mark read aren't on message notifications"));
      return Promise.resolve(undefined);
    }
    return Promise.resolve(notifications.setNotificationCategoryAsync(CHAT_PUSH_CATEGORY, chatNotificationActions(copy))).catch((error: unknown) => {
      onError?.(error);
    });
  } catch (error) {
    onError?.(error);
    return Promise.resolve(undefined);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The conversation a push is about: `data.conversationId`, else the id in `data.url`. */
export function conversationIdFromData(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const direct = typeof data.conversationId === "string" ? data.conversationId : typeof data.conversation_id === "string" ? data.conversation_id : null;
  if (direct && UUID.test(direct)) return direct.toLowerCase();
  const url = typeof data.url === "string" ? data.url : null;
  const m = url ? /^\/messages\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(url) : null;
  return m && UUID.test(m[1]!) ? m[1]!.toLowerCase() : null;
}

/**
 * The client id a reply from this notification sends with: the notification's
 * own id, as a uuid (it already is one on iOS; anything else is hashed into
 * one), so the same reply delivered twice posts once.
 */
export function replyClientId(notificationId: string): string {
  if (UUID.test(notificationId)) return notificationId.toLowerCase();
  // Four 32-bit FNV-1a hashes with different seeds: 128 stable bits.
  const words = [0x811c9dc5, 0x01000193, 0x050c5d1f, 0x6f4f2a3b].map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < notificationId.length; i++) {
      h ^= notificationId.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  });
  const hex = words.join("");
  // Version 8 (custom) and the RFC 4122 variant, so it is a valid uuid.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The client id for one reply: from the notification's id and the message it
 * is about (`data.messageId`), else the reply's text. The same reply delivered
 * twice posts once; two replies to one conversation never share an id, even
 * when iOS reuses the notification's id for a collapsed push.
 */
export function replyClientIdFor(notificationId: string, data: Record<string, unknown> | null | undefined, body: string): string {
  const messageId = typeof data?.messageId === "string" ? data.messageId : typeof data?.message_id === "string" ? data.message_id : null;
  return replyClientId(`${notificationId}|${messageId ? `m:${messageId.toLowerCase()}` : `t:${body}`}`);
}

/** The part of a notification response this reads (expo-notifications' `NotificationResponse`). */
export interface ChatPushResponseLike {
  actionIdentifier: string;
  /** The text typed into Reply. */
  userText?: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}

/** "queued": the reply couldn't go now and waits in the outbox, failed, for Retry. */
export type ChatPushOutcome = "replied" | "queued" | "marked-read" | "ignored" | "failed";

/** Where a reply waits when it can't go now. */
export interface ChatPushOutboxDeps {
  /** The live outbox (`useChat().outbox`), or a getter for it: the reply is queued there and sent in order. */
  outbox?: Pick<Outbox, "send" | "pending"> | null | (() => Pick<Outbox, "send" | "pending"> | null | undefined);
  /** Without a live outbox: the persisted store (`ChatProvider outboxStore`) a reply that failed is added to. */
  store?: OutboxStore | null;
  /** Whose store it is (the signed-in user's id). */
  userId?: string | null;
}

/** A reply that couldn't be sent, as the outbox keeps it: shown failed in its thread, with Retry. */
export function failedReply(input: { conversationId: string; clientId: string; body: string }, userId: string, error = "Not sent. Check your connection."): QueuedMessage {
  return {
    clientId: input.clientId,
    input: { conversationId: input.conversationId, clientId: input.clientId, body: input.body },
    senderId: userId,
    createdAt: new Date().toISOString(),
    status: "failed",
    error,
    previews: {},
    files: [],
    pendingFiles: [],
    attempts: 1,
  };
}

/**
 * Handles Reply and Mark read from a message's notification (pass it as the
 * push block's `onResponse`). Taps on the notification itself are the block's
 * routing, not this. Never throws: a failure is the outcome "failed" (and
 * `onError`).
 */
export async function handleChatPushResponse(
  response: ChatPushResponseLike,
  deps: {
    client: Pick<ChatClient, "send" | "markRead">;
    notifications?: Pick<NotificationCategoriesLike, "dismissNotificationAsync">;
    onError?: (error: unknown) => void;
  } & ChatPushOutboxDeps,
): Promise<ChatPushOutcome> {
  const action = response.actionIdentifier;
  if (action !== CHAT_REPLY_ACTION && action !== CHAT_MARK_READ_ACTION) return "ignored";
  const data = response.notification.request.content.data ?? {};
  const conversationId = conversationIdFromData(data);
  if (!conversationId) return "ignored";
  const notificationId = response.notification.request.identifier;
  try {
    let outcome: ChatPushOutcome;
    if (action === CHAT_REPLY_ACTION) {
      const body = (response.userText ?? "").trim();
      if (!body) return "ignored";
      const input = { conversationId, clientId: replyClientIdFor(notificationId, data, body), body };
      outcome = await sendReply(input, deps);
      // A reply reads the conversation too, as answering in the app would.
      if (outcome === "replied") await deps.client.markRead(conversationId).catch(() => undefined);
    } else {
      const seq = typeof data.seq === "number" ? data.seq : typeof data.seq === "string" ? Number(data.seq) : undefined;
      await deps.client.markRead(conversationId, Number.isFinite(seq) ? seq : undefined);
      outcome = "marked-read";
    }
    await deps.notifications?.dismissNotificationAsync?.(notificationId).catch(() => undefined);
    return outcome;
  } catch (error) {
    deps.onError?.(error);
    return "failed";
  }
}

async function sendReply(
  input: { conversationId: string; clientId: string; body: string },
  deps: { client: Pick<ChatClient, "send">; onError?: (error: unknown) => void } & ChatPushOutboxDeps,
): Promise<ChatPushOutcome> {
  const live = typeof deps.outbox === "function" ? deps.outbox() : deps.outbox;
  if (live) {
    // The same reply delivered twice is queued once.
    if (!live.pending(input.conversationId).some((p) => p.clientId === input.clientId)) await live.send(input);
    return "replied";
  }
  try {
    await deps.client.send(input);
    return "replied";
  } catch (error) {
    if (!deps.store || !deps.userId) throw error;
    deps.onError?.(error);
    const queue = await deps.store.load();
    if (!queue.some((q) => q.clientId === input.clientId)) await deps.store.save([...queue, failedReply(input, deps.userId)]);
    return "queued";
  }
}

/** For the push block's `suppress` / `useSuppressNotifications`: this conversation's pushes, while its thread is open. */
export function chatThreadMatch(conversationId: string | null | undefined): ((data: Record<string, unknown>) => boolean) | null {
  if (!conversationId) return null;
  const id = conversationId.toLowerCase();
  return (data) => conversationIdFromData(data) === id;
}
