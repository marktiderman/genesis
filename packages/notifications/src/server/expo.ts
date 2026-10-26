/**
 * Expo's push service: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 *   POST /--/api/v2/push/send          up to 100 messages; one ticket each, in order
 *   POST /--/api/v2/push/getReceipts   up to 1000 ticket ids; a receipt for each one ready
 *
 * Nothing here logs; an error names a status or Expo's error code, never a
 * token or a message.
 */
import { SendError, discard, isRetryableStatus, retryAfterSeconds, timedFetch, type HttpDeps } from "./errors";

export const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo takes up to 100 messages per send. */
export const EXPO_SEND_BATCH = 100;
/** And up to 1000 ticket ids per receipts request. */
export const EXPO_RECEIPTS_BATCH = 1000;

/** One message for Expo. */
export interface PushMessage {
  to: string;
  title?: string;
  subtitle?: string;
  body?: string;
  /** Reaches the app (`notification.request.content.data`): ids and the link, never content. */
  data?: Record<string, string | number | boolean | null>;
  sound?: "default" | null;
  badge?: number;
  /** Android: the notification channel (one per category). */
  channelId?: string;
  /** The device category whose actions it shows (Reply, Mark as read). */
  categoryId?: string;
  /** iOS: groups notifications on the lock screen (a conversation). */
  threadId?: string;
  /** Replaces an earlier one with the same id, in transit (and on screen on iOS). */
  collapseId?: string;
  /** Android: replaces one already on screen with the same tag. */
  tag?: string;
  ttl?: number;
  priority?: "default" | "normal" | "high";
}

export type PushTicket = { status: "ok"; id: string } | { status: "error"; code: string };
export type PushReceipt = { status: "ok" } | { status: "error"; code: string };

/** Sends pushes and reads receipts; `expoPushProvider` is the built-in one. */
export interface PushProvider {
  readonly name: string;
  /** At most `EXPO_SEND_BATCH` messages; one ticket per message, in order. Throws a `SendError` when the request failed. */
  send(messages: readonly PushMessage[], options?: { signal?: AbortSignal }): Promise<PushTicket[]>;
  /** Receipts for at most `EXPO_RECEIPTS_BATCH` tickets; ids with none yet are left out. */
  receipts(ids: readonly string[], options?: { signal?: AbortSignal }): Promise<Record<string, PushReceipt>>;
}

export interface ExpoOptions extends HttpDeps {
  /** Expo's access token, for "Enhanced Security for Push Notifications" (turn it on). */
  accessToken?: string;
  sendUrl?: string;
  receiptsUrl?: string;
}

/** An Expo error code (`DeviceNotRegistered`), safe to store; anything else is `Unknown`. */
export function expoErrorCode(value: { details?: { error?: unknown } } | undefined): string {
  const code = value?.details?.error;
  return typeof code === "string" && /^[A-Za-z_]{1,64}$/.test(code) ? code : "Unknown";
}

/** Expo refused the request itself (a 4xx other than 429): resend its messages one by one. */
export function refusedOutright(error: unknown): boolean {
  return error instanceof SendError && error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== 429;
}

/**
 * Expo's push service as a `PushProvider`.
 *
 * @stability Beta
 */
export function expoPushProvider(options: ExpoOptions = {}): PushProvider {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
  };
  async function post(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await timedFetch(options, url, { method: "POST", headers, body: JSON.stringify(body) }, signal);
    if (!response.ok) {
      // The body of an error is never read: it can echo the request back.
      const retryAfter = response.status === 429 ? retryAfterSeconds(response.headers.get("retry-after"), 30) : undefined;
      discard(response);
      throw new SendError(`Expo push answered HTTP ${response.status}`, {
        retryable: isRetryableStatus(response.status),
        status: response.status,
        ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
      });
    }
    try {
      return await response.json();
    } catch {
      throw new SendError("Expo push answered with something that isn't JSON", { retryable: true });
    }
  }
  return {
    name: "expo",
    async send(messages, { signal } = {}) {
      if (messages.length > EXPO_SEND_BATCH) throw new Error(`expoPushProvider: at most ${EXPO_SEND_BATCH} messages`);
      if (messages.length === 0) return [];
      const json = (await post(options.sendUrl ?? EXPO_SEND_URL, messages, signal)) as { data?: unknown };
      const tickets = Array.isArray(json?.data) ? (json.data as { status?: string; id?: unknown; details?: { error?: unknown } }[]) : [];
      // A short or malformed answer: the messages without a ticket failed, never "sent".
      return messages.map((_, i): PushTicket => {
        const t = tickets[i];
        if (t?.status === "ok" && typeof t.id === "string" && t.id.length > 0 && t.id.length <= 128) return { status: "ok", id: t.id };
        if (t?.status === "error") return { status: "error", code: expoErrorCode(t) };
        return { status: "error", code: "NoTicket" };
      });
    },
    async receipts(ids, { signal } = {}) {
      if (ids.length > EXPO_RECEIPTS_BATCH) throw new Error(`expoPushProvider: at most ${EXPO_RECEIPTS_BATCH} ids`);
      if (ids.length === 0) return {};
      const json = (await post(options.receiptsUrl ?? EXPO_RECEIPTS_URL, { ids }, signal)) as { data?: unknown };
      const data = json?.data && typeof json.data === "object" && !Array.isArray(json.data) ? (json.data as Record<string, { status?: string; details?: { error?: unknown } }>) : {};
      const out: Record<string, PushReceipt> = {};
      for (const id of ids) {
        const r = data[id];
        if (r?.status === "ok") out[id] = { status: "ok" };
        else if (r?.status === "error") out[id] = { status: "error", code: expoErrorCode(r) };
      }
      return out;
    },
  };
}
