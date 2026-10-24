/**
 * The genesis-push-send Edge Function's request handling, with its
 * dependencies passed in (index.ts wires the real ones), so it is tested
 * without Deno, a database or Expo.
 *
 * Every request carries `Authorization: Bearer <GENESIS_PUSH_SECRET>`: the
 * function is for your server, a database trigger (pg_net) or a schedule,
 * never for the app, which must not be able to push to anyone.
 *
 *   POST { "action": "send", "messages": [PushRequest, …] }        (at most 100)
 *     For each message, asks migration 0005's genesis_push_targets for the
 *     person's devices (none when they turned the category off or are in
 *     quiet hours), sends through Expo in batches of 100, records a receipt
 *     row per ticket (category and status, never content) and forgets the
 *     devices Expo calls DeviceNotRegistered. A person who hides previews
 *     gets neutral text instead of the title and body.
 *     Answers `{ ok, sent, failed, forgotten, results: [{ deliver, reason, quietUntil, devices, sent, failed }] }`,
 *     one result per message in order, so a caller can retry after `quietUntil`.
 *
 *   POST { "action": "receipts" }
 *     Polls Expo for the receipts of tickets that are due (about 15 minutes
 *     after sending), records delivered or failed, and forgets dead devices.
 *     Run it on a schedule (every 15 minutes).
 *
 * Logs and responses never carry a token, a title, a body or `data`: only
 * counts, statuses and Expo's error codes.
 */
import {
  EXPO_RECEIPTS_BATCH,
  EXPO_SEND_BATCH,
  describeExpoError,
  errorCode,
  getReceipts,
  refusedOutright,
  sendBatch,
  type ExpoMessage,
  type ExpoTicket,
} from "./expo.ts";

/** One push, as your server asks for it. */
export interface PushRequest {
  userId: string;
  /** A category id the app defines (`messages`); also the Android channel unless `channelId` is given. */
  category: string;
  title: string;
  body?: string;
  subtitle?: string;
  /** The app path to open on tap (`/messages/42`); the app normalizes it again, so an unknown path opens `/`. */
  url?: string;
  /** Extra values for the app: ids, never content (it rides in the payload, and is dropped when previews are hidden). */
  data?: Record<string, string | number | boolean | null>;
  badge?: number;
  /** `"default"` (the default) or `null` for silent. */
  sound?: "default" | null;
  /** Is this category on for someone who never chose? Default true. */
  defaultOn?: boolean;
  /** Goes through quiet hours (a security alert, say). Default false. */
  urgent?: boolean;
  channelId?: string;
  ttlSeconds?: number;
}

/** A device to push to, as genesis_push_targets returns it. */
export interface PushTarget {
  device_id: string;
  token: string;
  platform: string;
  hide_previews: boolean;
}

export interface PushStatus {
  deliver: boolean;
  reason: string;
  quiet_until: string | null;
}

export interface TicketRow {
  user_id: string;
  device_id: string | null;
  category: string;
  ticket_id?: string;
  status: "sent" | "failed";
  error?: string;
}

export interface ReceiptResult {
  id: number;
  status: "delivered" | "failed";
  error?: string;
}

/** The SQL functions from migration 0005, called with the service role. */
export interface PushStore {
  targets(userId: string, category: string, defaultOn: boolean, urgent: boolean): Promise<PushTarget[]>;
  status(userId: string, category: string, defaultOn: boolean, urgent: boolean): Promise<PushStatus>;
  recordTickets(rows: TicketRow[]): Promise<void>;
  forgetDevices(deviceIds: string[]): Promise<void>;
  claimReceipts(limit: number): Promise<{ id: number; ticket_id: string }[]>;
  settleReceipts(results: ReceiptResult[]): Promise<void>;
}

export interface HandlerDeps {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  store: PushStore;
  log: (message: string) => void;
  /** Milliseconds now. Default `Date.now`. */
  now?: () => number;
}

/** Stop starting new sends after this long, so the run ends (and records what it sent) inside an Edge Function's wall clock. */
export const SEND_BUDGET_MS = 100_000;
/** How many single sends run at once when a refused batch is resent one by one. */
const SINGLE_CONCURRENCY = 10;

export interface MessageResult {
  deliver: boolean;
  reason: string;
  quietUntil: string | null;
  devices: number;
  sent: number;
  failed: number;
}

export const MAX_MESSAGES = 100;
const MAX_BODY_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DEFAULT_HIDDEN_TITLE = "New notification";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
}

const describe = (error: unknown) => (error instanceof Error ? error.name : "unknown error");

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return null;
  const text = await req.text().catch(() => null);
  if (text === null || text.length > MAX_BODY_BYTES) return null;
  try {
    const body: unknown = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Compares the bearer with the secret in constant time (over their digests, so the length doesn't leak either). */
export async function authorized(req: Request, secret: string): Promise<boolean> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return false;
  const [a, b] = await Promise.all([digest(match[1]!), digest(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

const isText = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
const optionalText = (v: unknown, max: number) => v === undefined || v === null || isText(v, max);

const bytes = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value ?? null)).length;
/** Title, subtitle, body, url and data together, in UTF-8 bytes: leaves room in Expo's 4096 for the rest. */
export const MAX_CONTENT_BYTES = 3500;

/** A valid request, or null. The content limit is in bytes, so a message stays under Expo's 4 KB payload. */
export function readPushRequest(value: unknown): PushRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  if (typeof m.userId !== "string" || !UUID.test(m.userId)) return null;
  if (typeof m.category !== "string" || !ID.test(m.category)) return null;
  if (!isText(m.title, 200) || !optionalText(m.body, 1000) || !optionalText(m.subtitle, 200)) return null;
  if (m.url !== undefined && m.url !== null && !(isText(m.url, 512) && (m.url as string).startsWith("/") && !(m.url as string).startsWith("//"))) return null;
  if (m.data !== undefined && m.data !== null) {
    if (typeof m.data !== "object" || Array.isArray(m.data)) return null;
    const entries = Object.entries(m.data as Record<string, unknown>);
    if (entries.length > 20 || JSON.stringify(m.data).length > 1024) return null;
    if (!entries.every(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))) return null;
  }
  if (m.badge !== undefined && m.badge !== null && !(Number.isInteger(m.badge) && (m.badge as number) >= 0 && (m.badge as number) <= 99_999)) return null;
  if (m.sound !== undefined && m.sound !== null && m.sound !== "default") return null;
  if (m.defaultOn !== undefined && typeof m.defaultOn !== "boolean") return null;
  if (m.urgent !== undefined && typeof m.urgent !== "boolean") return null;
  if (m.channelId !== undefined && m.channelId !== null && !(typeof m.channelId === "string" && ID.test(m.channelId))) return null;
  if (m.ttlSeconds !== undefined && m.ttlSeconds !== null && !(Number.isInteger(m.ttlSeconds) && (m.ttlSeconds as number) >= 0 && (m.ttlSeconds as number) <= 2_419_200)) return null;
  if (bytes(m.title) + bytes(m.subtitle ?? "") + bytes(m.body ?? "") + bytes(m.url ?? "") + (m.data ? bytes(m.data) : 0) > MAX_CONTENT_BYTES) return null;
  return m as unknown as PushRequest;
}

/**
 * What goes to Expo for one device. With previews hidden, the title becomes
 * neutral text and the body, subtitle and extra data are dropped: the words
 * never leave the server, so no lock screen, watch or notification log can
 * show them. The tap still opens `url`, and `category` still travels: keep
 * both opaque (ids, not words; no search text in a query string).
 */
export function toExpoMessage(request: PushRequest, target: PushTarget, hidden: { title: string; body?: string }): ExpoMessage {
  const hide = target.hide_previews;
  const data: Record<string, unknown> = hide ? {} : { ...(request.data ?? {}) };
  data.category = request.category;
  if (request.url) data.url = request.url;
  return {
    to: target.token,
    ...(hide ? { title: hidden.title, ...(hidden.body ? { body: hidden.body } : {}) } : { title: request.title, ...(request.body ? { body: request.body } : {}), ...(request.subtitle ? { subtitle: request.subtitle } : {}) }),
    data,
    sound: request.sound === null ? null : "default",
    ...(request.badge !== undefined && request.badge !== null ? { badge: request.badge } : {}),
    channelId: request.channelId ?? request.category,
    ...(request.ttlSeconds !== undefined && request.ttlSeconds !== null ? { ttl: request.ttlSeconds } : {}),
    priority: "high",
  };
}

export async function handle(req: Request, deps: HandlerDeps): Promise<Response> {
  try {
    return await route(req, deps);
  } catch (error) {
    deps.log(`genesis-push-send: failed: ${describe(error)}`);
    return json(500, { error: "internal" });
  }
}

async function route(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = deps.env("GENESIS_PUSH_SECRET") ?? "";
  if (secret.length < 32) {
    // Loud, by name only: without it nothing can call the function.
    deps.log("genesis-push-send: not configured; set GENESIS_PUSH_SECRET (at least 32 characters)");
    return json(500, { error: "not_configured" });
  }
  if (!(await authorized(req, secret))) return json(401, { error: "unauthorized" });
  const body = await readBody(req);
  if (!body) return json(400, { error: "bad_request" });

  if (body.action === "send") {
    const raw = body.messages;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return json(400, { error: "bad_request" });
    const requests = raw.map(readPushRequest);
    const bad = requests.findIndex((r) => r === null);
    if (bad >= 0) return json(400, { error: "bad_message", index: bad });
    const report = await send(requests as PushRequest[], deps);
    return json(200, { ok: true, ...report });
  }
  if (body.action === "receipts") {
    const report = await pollReceipts(deps);
    return json(200, { ok: true, ...report });
  }
  return json(400, { error: "bad_request" });
}

interface Outgoing {
  message: ExpoMessage;
  index: number;
  userId: string;
  deviceId: string;
  category: string;
}

/** Sends the requests; returns the totals and one result per request. */
export async function send(requests: PushRequest[], deps: HandlerDeps) {
  const hidden = { title: deps.env("PUSH_HIDDEN_TITLE") || DEFAULT_HIDDEN_TITLE, body: deps.env("PUSH_HIDDEN_BODY") || undefined };
  const accessToken = deps.env("EXPO_ACCESS_TOKEN") || undefined;
  const results: MessageResult[] = requests.map(() => ({ deliver: false, reason: "ok", quietUntil: null, devices: 0, sent: 0, failed: 0 }));
  const outgoing: Outgoing[] = [];

  for (const [index, request] of requests.entries()) {
    const defaultOn = request.defaultOn ?? true;
    const urgent = request.urgent ?? false;
    const result = results[index]!;
    try {
      const targets = await deps.store.targets(request.userId, request.category, defaultOn, urgent);
      result.devices = targets.length;
      if (targets.length === 0) {
        const status = await deps.store.status(request.userId, request.category, defaultOn, urgent);
        result.reason = status.deliver ? "no_devices" : status.reason;
        result.quietUntil = status.quiet_until;
        continue;
      }
      result.deliver = true;
      for (const target of targets) {
        outgoing.push({ message: toExpoMessage(request, target, hidden), index, userId: request.userId, deviceId: target.device_id, category: request.category });
      }
    } catch (error) {
      deps.log(`genesis-push-send: couldn't read targets: ${describe(error)}`);
      result.reason = "error";
    }
  }

  const now = deps.now ?? Date.now;
  const started = now();
  const overBudget = () => now() - started > SEND_BUDGET_MS;
  let tickets: TicketRow[] = [];
  let dead: string[] = [];
  let forgotten = 0;
  // Recorded after every batch, so a run cut short still has receipts for what it sent.
  const record = async () => {
    const [t, d] = [tickets, dead];
    tickets = [];
    dead = [];
    if (t.length) await deps.store.recordTickets(t).catch((error) => deps.log(`genesis-push-send: couldn't record tickets: ${describe(error)}`));
    if (d.length) {
      forgotten += d.length;
      await deps.store.forgetDevices(d).catch((error) => deps.log(`genesis-push-send: couldn't forget dead devices: ${describe(error)}`));
    }
  };
  const settle = (batch: Outgoing[], answers: ExpoTicket[]) => {
    batch.forEach((item, i) => {
      const ticket = answers[i]!;
      const result = results[item.index]!;
      if (ticket.status === "ok") {
        result.sent++;
        tickets.push({ user_id: item.userId, device_id: item.deviceId, category: item.category, ticket_id: ticket.id, status: "sent" });
      } else {
        result.failed++;
        const code = errorCode(ticket);
        tickets.push({ user_id: item.userId, device_id: item.deviceId, category: item.category, status: "failed", error: code });
        if (code === "DeviceNotRegistered") dead.push(item.deviceId);
      }
    });
  };
  const fail = (batch: Outgoing[], code: string) => settle(batch, batch.map(() => ({ status: "error", details: { error: code } }) as ExpoTicket));

  let unsent = 0;
  for (let i = 0; i < outgoing.length; i += EXPO_SEND_BATCH) {
    const batch = outgoing.slice(i, i + EXPO_SEND_BATCH);
    if (overBudget()) {
      // Out of time: these were never sent, so they're failed (and may be sent again by the caller).
      unsent += batch.length;
      fail(batch, "NotSent");
      continue;
    }
    try {
      settle(batch, await sendBatch(deps.fetch, batch.map((o) => o.message), accessToken));
    } catch (error) {
      if (!refusedOutright(error) || batch.length === 1) {
        // Down, slow or rate limited: this batch fails and the next still goes. Not resent: it may have been accepted.
        deps.log(`genesis-push-send: a batch of ${batch.length} failed: ${describeExpoError(error)}`);
        fail(batch, "SendFailed");
        continue;
      }
      // Expo refuses a whole request for one bad message (a token from another project, say):
      // send that batch one by one, so one device can't silence everyone else's.
      deps.log(`genesis-push-send: a batch of ${batch.length} was refused (${describeExpoError(error)}); sending it one by one`);
      for (let j = 0; j < batch.length; j += SINGLE_CONCURRENCY) {
        const group = batch.slice(j, j + SINGLE_CONCURRENCY);
        if (overBudget()) {
          unsent += group.length;
          fail(group, "NotSent");
          continue;
        }
        await Promise.all(
          group.map(async (item) => {
            try {
              settle([item], await sendBatch(deps.fetch, [item.message], accessToken));
            } catch (single) {
              fail([item], refusedOutright(single) ? "Refused" : "SendFailed");
            }
          }),
        );
      }
    }
    await record();
  }
  await record();

  const sent = results.reduce((n, r) => n + r.sent, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  deps.log(`genesis-push-send: ${requests.length} messages, ${outgoing.length} devices, ${sent} sent, ${failed} failed, ${forgotten} forgotten${unsent ? `, ${unsent} not sent (out of time)` : ""}`);
  return { sent, failed, forgotten, unsent, results };
}

/** Polls Expo for due receipts; returns the counts, with Expo's error codes. */
export async function pollReceipts(deps: HandlerDeps) {
  const now = deps.now ?? Date.now;
  const started = now();
  const counts = { checked: 0, delivered: 0, failed: 0, pending: 0, errors: {} as Record<string, number> };
  // A full claim means more may be due: keep going, within the time budget.
  for (let round = 0; round < 20; round++) {
    const claimed = await pollReceiptsOnce(deps, counts);
    if (claimed < EXPO_RECEIPTS_BATCH || now() - started > SEND_BUDGET_MS) break;
  }
  const codes = Object.entries(counts.errors).map(([code, n]) => `${code} ${n}`).join(", ");
  if (counts.checked || counts.pending) deps.log(`genesis-push-send: receipts ${counts.delivered} delivered, ${counts.failed} failed${codes ? ` (${codes})` : ""}, ${counts.pending} pending`);
  // Credentials are a setup problem, not a phone's: say so loudly.
  if (counts.errors.InvalidCredentials) deps.log("genesis-push-send: Expo reports InvalidCredentials: upload the APNs key / FCM credentials to your Expo project (eas credentials)");
  return counts;
}

type ReceiptCounts = { checked: number; delivered: number; failed: number; pending: number; errors: Record<string, number> };

/** One claim's worth; returns how many were claimed. */
async function pollReceiptsOnce(deps: HandlerDeps, counts: ReceiptCounts): Promise<number> {
  const accessToken = deps.env("EXPO_ACCESS_TOKEN") || undefined;
  let due: { id: number; ticket_id: string }[];
  try {
    due = await deps.store.claimReceipts(EXPO_RECEIPTS_BATCH);
  } catch (error) {
    deps.log(`genesis-push-send: couldn't claim receipts: ${describe(error)}`);
    return 0;
  }
  if (due.length === 0) return 0;
  let receipts: Awaited<ReturnType<typeof getReceipts>>;
  try {
    receipts = await getReceipts(deps.fetch, due.map((d) => d.ticket_id), accessToken);
  } catch (error) {
    // The lease runs out and they come round again.
    deps.log(`genesis-push-send: couldn't fetch receipts: ${describeExpoError(error)}`);
    counts.pending += due.length;
    return 0;
  }
  const results: ReceiptResult[] = [];
  for (const row of due) {
    const receipt = Object.prototype.hasOwnProperty.call(receipts, row.ticket_id) ? receipts[row.ticket_id] : undefined;
    if (!receipt || (receipt.status !== "ok" && receipt.status !== "error")) {
      counts.pending++;
      continue;
    }
    counts.checked++;
    if (receipt.status === "ok") {
      counts.delivered++;
      results.push({ id: row.id, status: "delivered" });
    } else {
      counts.failed++;
      const code = errorCode(receipt);
      counts.errors[code] = (counts.errors[code] ?? 0) + 1;
      results.push({ id: row.id, status: "failed", error: code });
    }
  }
  if (results.length) await deps.store.settleReceipts(results);
  return due.length;
}
