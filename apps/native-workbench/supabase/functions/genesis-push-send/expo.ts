/**
 * Expo's push service, as the genesis-push-send function uses it:
 * https://docs.expo.dev/push-notifications/sending-notifications/
 *
 *   POST /--/api/v2/push/send          up to 100 messages; one ticket each, in order
 *   POST /--/api/v2/push/getReceipts   up to 1000 ticket ids; a receipt for each one ready
 *
 * Nothing here logs: a caller that logs uses `describeExpoError`, which
 * names a status and Expo's error code, never a token or a message body.
 */

export const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo takes up to 100 messages per send request. */
export const EXPO_SEND_BATCH = 100;
/** And up to 1000 ticket ids per receipts request. */
export const EXPO_RECEIPTS_BATCH = 1000;
const CALL_TIMEOUT_MS = 15_000;

/** One message for Expo. `data` reaches the app (`notification.request.content.data`), not the screen. */
export interface ExpoMessage {
  to: string;
  title?: string;
  subtitle?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  /** Android: the notification channel (the app creates one per category). */
  channelId?: string;
  /** Seconds Apple and Google keep trying an offline phone. */
  ttl?: number;
  priority?: "default" | "normal" | "high";
}

/** Expo's answer for one message. */
export type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

/** Expo's later word on one ticket. */
export type ExpoReceipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

/** Expo answered a whole request with an error status. */
export class ExpoHttpError extends Error {
  constructor(readonly status: number) {
    super(`Expo push answered HTTP ${status}`);
    this.name = "ExpoHttpError";
  }
}

/**
 * Expo refused the request itself (a 4xx other than 429), as it does for a
 * batch that mixes projects. A timeout, a 429 or a 5xx may have been accepted
 * or may recur, so those are never resent one by one.
 */
export function refusedOutright(error: unknown): boolean {
  return error instanceof ExpoHttpError && error.status >= 400 && error.status < 500 && error.status !== 429;
}

/** An Expo error code (`DeviceNotRegistered`), safe to store and log; anything else becomes `Unknown`. */
export function errorCode(value: { details?: { error?: string } } | undefined): string {
  const code = value?.details?.error;
  return typeof code === "string" && /^[A-Za-z_]{1,64}$/.test(code) ? code : "Unknown";
}

function headers(accessToken: string | undefined): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function post(fetchFn: typeof fetch, url: string, body: unknown, accessToken: string | undefined): Promise<unknown> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  // The body of an error is never read: it can echo the request back.
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ExpoHttpError(response.status);
  }
  return response.json();
}

/** Sends one batch (at most 100) and returns a ticket per message, in order. */
export async function sendBatch(fetchFn: typeof fetch, messages: ExpoMessage[], accessToken?: string): Promise<ExpoTicket[]> {
  if (messages.length > EXPO_SEND_BATCH) throw new Error(`sendBatch: at most ${EXPO_SEND_BATCH} messages`);
  const json = (await post(fetchFn, EXPO_SEND_URL, messages, accessToken)) as { data?: unknown };
  const tickets = Array.isArray(json?.data) ? (json.data as ExpoTicket[]) : [];
  // A short or malformed answer: the messages without a ticket count as failed, never as sent.
  return messages.map((_, i) => {
    const ticket = tickets[i];
    if (ticket && ticket.status === "ok" && typeof ticket.id === "string" && ticket.id.length > 0 && ticket.id.length <= 128) return ticket;
    if (ticket && ticket.status === "error") return ticket;
    return { status: "error", details: { error: "NoTicket" } };
  });
}

/** Receipts for up to 1000 ticket ids; ids Expo has no receipt for yet are left out. */
export async function getReceipts(fetchFn: typeof fetch, ids: string[], accessToken?: string): Promise<Record<string, ExpoReceipt>> {
  if (ids.length > EXPO_RECEIPTS_BATCH) throw new Error(`getReceipts: at most ${EXPO_RECEIPTS_BATCH} ids`);
  const json = (await post(fetchFn, EXPO_RECEIPTS_URL, { ids }, accessToken)) as { data?: unknown };
  const data = json?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, ExpoReceipt>) : {};
}

/** A failed call, for a log line: the status or the error's name, never the request. */
export function describeExpoError(error: unknown): string {
  if (error instanceof ExpoHttpError) return `HTTP ${error.status}`;
  if (error instanceof Error) return error.name === "TimeoutError" || error.name === "AbortError" ? "timeout" : error.name;
  return "unknown error";
}
