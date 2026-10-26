// @feat:chat
/**
 * A plain `deliver` for apps without genesis-notifications yet: one Expo push
 * per device token, in requests of 100 (https://docs.expo.dev/push-notifications/sending-notifications/).
 * It returns every ticket, so the app can forget tokens Expo calls
 * `DeviceNotRegistered`. It throws only when nothing at all was sent, so a
 * retry never pushes twice to the devices that already got it.
 */
import type { ChatNotification } from "./types";

export const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_BATCH = 100;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default" | null;
  badge: number;
  threadId: string;
  collapseId?: string;
  channelId: string;
  categoryId: string;
  mutableContent?: boolean;
}

export type ExpoPushTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };

export interface ExpoDeliveryTicket {
  userId: string;
  token: string;
  ticket: ExpoPushTicket;
}

export interface ExpoDeliverOptions {
  /** The Expo push tokens of these people (any number per person). */
  tokensFor: (userIds: string[]) => Promise<{ userId: string; token: string }[]>;
  fetch?: typeof fetch | undefined;
  /** Required when the Expo project has enhanced push security on. */
  accessToken?: string | undefined;
  /** Default `default`; null for silent. */
  sound?: "default" | null | undefined;
  /** Android channel (default `messages`) and notification category (default `messages`, the category genesis-native's push block registers for chat). */
  channelId?: string | undefined;
  categoryId?: string | undefined;
  /**
   * Replace a conversation's earlier notification with the newest (one per conversation).
   * Off by default: like iMessage and WhatsApp, each message shows, grouped by thread.
   */
  collapse?: boolean | undefined;
}

export function createExpoDeliver(options: ExpoDeliverOptions): (n: ChatNotification) => Promise<ExpoDeliveryTicket[]> {
  const fetchFn = options.fetch ?? fetch;
  return async (notification) => {
    const badges = new Map(notification.recipients.map((r) => [r.userId, r.badge]));
    const devices = await options.tokensFor([...badges.keys()]);
    const messages = devices.map(
      (d): ExpoPushMessage & { userId: string } => ({
        userId: d.userId,
        to: d.token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: options.sound === undefined ? "default" : options.sound,
        badge: badges.get(d.userId) ?? 0,
        threadId: notification.threadKey,
        ...(notification.mutableContent ? { mutableContent: true } : {}),
        ...(options.collapse ? { collapseId: notification.collapseKey ?? `chat:${notification.conversationId}` } : {}),
        channelId: options.channelId ?? "messages",
        categoryId: options.categoryId ?? notification.categoryId ?? "messages",
      }),
    );
    const tickets: ExpoDeliveryTicket[] = [];
    let sent = 0;
    let lastError: unknown = null;
    for (let i = 0; i < messages.length; i += EXPO_BATCH) {
      const chunk = messages.slice(i, i + EXPO_BATCH);
      let answer: ExpoPushTicket[] | null = null;
      try {
        const response = await fetchFn(EXPO_SEND_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          },
          body: JSON.stringify(chunk.map(({ userId: _userId, ...m }) => m)),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new Error(`Expo push answered HTTP ${response.status}`);
        }
        const json = (await response.json()) as { data?: unknown };
        answer = Array.isArray(json.data) ? (json.data as ExpoPushTicket[]) : [];
        sent += chunk.length;
      } catch (e) {
        lastError = e;
      }
      chunk.forEach((m, j) => {
        const t = answer?.[j];
        tickets.push({
          userId: m.userId,
          token: m.to,
          ticket: t && (t.status === "ok" || t.status === "error") ? t : { status: "error", details: { error: answer ? "NoTicket" : "RequestFailed" } },
        });
      });
    }
    if (messages.length > 0 && sent === 0) throw lastError instanceof Error ? lastError : new Error("Expo push failed");
    return tickets;
  };
}

/** The tokens Expo says are gone (`DeviceNotRegistered`): forget them. */
export function deadTokens(tickets: readonly ExpoDeliveryTicket[]): string[] {
  return tickets.filter((t) => t.ticket.status === "error" && t.ticket.details?.error === "DeviceNotRegistered").map((t) => t.token);
}
