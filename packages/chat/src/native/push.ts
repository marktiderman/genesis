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
 * (Android) and `data: { url: "/messages/<id>", conversationId, seq, messageId }`;
 * `chatPushPayload` builds those and the fields iOS rich push reads (the
 * sender's name and photo, the group, a photo), and it is server safe: import
 * it from `@marktiderman/genesis-chat/push`.
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
 * The client id for one reply: from the notification's id, the message it is
 * about (`data.messageId`) and the reply's text. The same reply delivered
 * twice posts once; two replies to one conversation never share an id, even
 * when iOS reuses the notification's id for a collapsed push.
 */
export function replyClientIdFor(notificationId: string, data: Record<string, unknown> | null | undefined, body: string): string {
  const messageId = typeof data?.messageId === "string" ? data.messageId : typeof data?.message_id === "string" ? data.message_id : "";
  return replyClientId(`${notificationId}|m:${messageId.toLowerCase()}|t:${body}`);
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

type LiveOutbox = Pick<Outbox, "send" | "pending"> & Partial<Pick<Outbox, "load">>;

/** How long a reply queued in the live outbox is waited for before it counts as queued, not sent. */
export const PUSH_REPLY_WAIT_MS = 15_000;

/** Where a reply waits when it can't go now. */
export interface ChatPushOutboxDeps {
  /** The live outbox (`useChat().outbox`), or a getter for it (read again after a slow failure): the reply is queued there and sent in order. */
  outbox?: LiveOutbox | null | (() => LiveOutbox | null | undefined);
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
    /** How long to wait for a reply queued in the live outbox to go. Default PUSH_REPLY_WAIT_MS. */
    waitMs?: number;
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
  deps: { client: Pick<ChatClient, "send">; onError?: (error: unknown) => void; waitMs?: number } & ChatPushOutboxDeps,
): Promise<ChatPushOutcome> {
  const liveOutbox = () => (typeof deps.outbox === "function" ? deps.outbox() : deps.outbox) ?? null;
  const live = liveOutbox();
  if (live) return queueLive(live, input, deps.waitMs);
  try {
    await deps.client.send(input);
    return "replied";
  } catch (error) {
    // The chat screens may have opened while the send failed: their outbox owns the saved copy now.
    const opened = liveOutbox();
    if (opened) return queueLive(opened, input, 0);
    if (!deps.store || !deps.userId) throw error;
    deps.onError?.(error);
    const queue = await deps.store.load();
    if (!queue.some((q) => q.clientId === input.clientId)) await deps.store.save([...queue, failedReply(input, deps.userId)]);
    return "queued";
  }
}

/**
 * Queues the reply in the live outbox (once) and waits, briefly, for it to go: "replied" once it
 * has left the queue, "queued" while it is still there or failed (it waits there for Retry).
 */
async function queueLive(live: LiveOutbox, input: { conversationId: string; clientId: string; body: string }, waitMs = PUSH_REPLY_WAIT_MS): Promise<ChatPushOutcome> {
  await live.load?.();
  const mine = () => live.pending(input.conversationId).find((p) => p.clientId === input.clientId);
  if (!mine()) await live.send(input);
  const until = Date.now() + waitMs;
  for (;;) {
    const p = mine();
    if (!p) return "replied";
    if (p.status === "failed" || Date.now() >= until) return "queued";
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** For the push block's `suppress` / `useSuppressNotifications`: this conversation's pushes, while its thread is open. */
export function chatThreadMatch(conversationId: string | null | undefined): ((data: Record<string, unknown>) => boolean) | null {
  if (!conversationId) return null;
  const id = conversationId.toLowerCase();
  return (data) => conversationIdFromData(data) === id;
}

/** What a message's push says about itself, for `chatPushPayload`. */
export interface ChatPushPayloadInput {
  conversationId: string;
  messageId: string;
  seq?: number | null | undefined;
  /** Who sent it: an opaque id (never an email or phone), the name to show and an https photo. */
  sender?: { id: string; name: string; avatarUrl?: string | null | undefined } | null | undefined;
  /** The conversation's name when it is a group; leave it out for a direct conversation. */
  groupName?: string | null | undefined;
  /** An https photo in the message, attached to the notification. */
  imageUrl?: string | null | undefined;
  /**
   * The recipient hides previews: the push carries the link and ids only (no
   * sender, group or photo) and the service extension doesn't run. Send neutral
   * title and body text with it.
   */
  hidePreviews?: boolean | undefined;
}

/** The `data` of a message's push. Flat strings and numbers, as genesis-notifications' `PushMessage.data` takes. */
export interface ChatPushData {
  [key: string]: string | number;
  url: string;
  conversationId: string;
  messageId: string;
}

/** The fields to spread into an Expo push message (with `to`, `title`, `body`, `badge`, `channelId`). */
export interface ChatPushPayload {
  categoryId: typeof CHAT_PUSH_CATEGORY;
  /** Groups the conversation's notifications, and is the conversation iOS files a Communication Notification under. */
  threadId: string;
  /** iOS runs genesis-native's Notification Service Extension only when this is true (`mutable-content: 1`). */
  mutableContent: boolean;
  data: ChatPushData;
}

/** The extension fetches only https URLs (no credentials, at most 1024 characters): genesis-native's `isRichPushUrl`. */
function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

function shortText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, 200) : null;
}

/**
 * The category, thread, `mutableContent` and `data` of a message's push, for
 * the server that sends it:
 *
 *   const message = { to, title, body, badge, channelId: "messages", ...chatPushPayload({ conversationId, messageId, seq, sender, groupName, imageUrl, hidePreviews }) };
 *
 * On iOS, with the rich push plugin, a push with a sender is a Communication
 * Notification (the sender's photo; Focus treats it as a message) and `imageUrl`
 * is attached. Fields that aren't usable (a URL that isn't https, an empty
 * name) are left out rather than sent.
 */
export function chatPushPayload(input: ChatPushPayloadInput): ChatPushPayload {
  const conversationId = input.conversationId.toLowerCase();
  if (!UUID.test(conversationId)) throw new Error("chatPushPayload: conversationId must be a uuid");
  const data: ChatPushData = { url: chatPath(conversationId), conversationId, messageId: input.messageId };
  if (typeof input.seq === "number" && Number.isFinite(input.seq)) data.seq = input.seq;
  if (input.hidePreviews) {
    return { categoryId: CHAT_PUSH_CATEGORY, threadId: conversationId, mutableContent: false, data };
  }
  const senderName = shortText(input.sender?.name);
  const senderId = shortText(input.sender?.id);
  if (senderName && senderId) {
    data.senderId = senderId;
    data.senderName = senderName;
    const avatar = httpsUrl(input.sender?.avatarUrl);
    if (avatar) data.senderAvatar = avatar;
  }
  const groupName = shortText(input.groupName);
  if (groupName) data.groupName = groupName;
  const image = httpsUrl(input.imageUrl);
  if (image) data.image = image;
  return { categoryId: CHAT_PUSH_CATEGORY, threadId: conversationId, mutableContent: true, data };
}
