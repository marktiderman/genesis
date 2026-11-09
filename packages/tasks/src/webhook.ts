// A Todoist webhook delivery, checked and read. Todoist signs each delivery's raw body with the
// app's client secret (X-Todoist-Hmac-SHA256, base64 HMAC-SHA256) and sends it again, with the
// same X-Todoist-Delivery-ID, after 15 minutes when the answer isn't a 200 (three times at most).
// Deliveries can come late, out of order or not at all: Todoist says to use them as a nudge to
// sync, never as the data. So `readTodoistWebhook` tells you whose account changed; read it with
// `syncTodoist` and its token.
import { fromTodoistItem, type TodoistItem } from "./todoist";
import type { ExternalTask } from "./types";

/** A checked delivery. @stability Beta */
export interface TodoistWebhookEvent {
  /** `item:added`, `item:updated`, `item:completed`, `project:deleted`, … */
  name: string;
  /** The Todoist account the event is for (the person who connected). */
  userId: string;
  /** The same on every redelivery of one event: skip one you already handled. */
  deliveryId: string | null;
  /** The Todoist account that made the change (a collaborator on a shared project, or the person). */
  initiatorId: string | null;
  triggeredAt: string | null;
  /** The task, for an `item:*` event. A hint only: read the account to act on it. */
  task: ExternalTask | null;
}

/** What `readTodoistWebhook` found. @stability Beta */
export type TodoistWebhookResult =
  | { ok: true; event: TodoistWebhookEvent }
  /** Answer with `status`: 401 for a missing or wrong signature, 400 for a body that isn't an event. */
  | { ok: false; status: 400 | 401 };

const encoder = new TextEncoder();

/**
 * Whether `signature` is the base64 HMAC-SHA256 of `body` under `secret`, compared in constant
 * time. The same check as genesis-connect's `verifyWebhookSignature`, kept here so this package
 * needs no OAuth package to read a delivery.
 */
async function signatureMatches(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  let binary = "";
  for (const b of mac) binary += String.fromCharCode(b);
  const expected = encoder.encode(btoa(binary));
  const given = encoder.encode(signature.trim());
  let diff = expected.length ^ given.length;
  for (let i = 0; i < Math.max(expected.length, given.length); i++) diff |= (expected[i] ?? 0) ^ (given[i] ?? 0);
  return diff === 0;
}

/** The largest body read (Todoist's events are a few kilobytes). */
const MAX_BYTES = 256 * 1024;

/**
 * Checks a Todoist webhook delivery's signature against the app's client secret and reads it.
 * Reads the request's body; answer 200 quickly (Todoist redelivers anything else).
 *
 * ```ts
 * const read = await readTodoistWebhook(request, { clientSecret: process.env.TODOIST_CLIENT_SECRET! });
 * if (!read.ok) return new Response(null, { status: read.status });
 * await queueSync(read.event.userId, read.event.deliveryId);
 * return new Response(null, { status: 200 });
 * ```
 *
 * @stability Beta
 */
export async function readTodoistWebhook(
  request: Request,
  options: { clientSecret: string },
): Promise<TodoistWebhookResult> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) return { ok: false, status: 400 };
  const body = await request.text().catch(() => null);
  if (body === null || body.length > MAX_BYTES) return { ok: false, status: 400 };
  const signed = await signatureMatches(options.clientSecret, body, request.headers.get("x-todoist-hmac-sha256"));
  if (!signed) return { ok: false, status: 401 };
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, status: 400 };
  }
  if (!value || typeof value !== "object") return { ok: false, status: 400 };
  const v = value as Record<string, unknown>;
  const name = typeof v["event_name"] === "string" ? v["event_name"] : null;
  const userId = typeof v["user_id"] === "string" || typeof v["user_id"] === "number" ? String(v["user_id"]) : null;
  if (!name || !userId) return { ok: false, status: 400 };
  const initiator = v["initiator"] as { id?: unknown } | undefined;
  const data = v["event_data"];
  return {
    ok: true,
    event: {
      name,
      userId,
      deliveryId: request.headers.get("x-todoist-delivery-id")?.slice(0, 200) || null,
      initiatorId: typeof initiator?.id === "string" || typeof initiator?.id === "number" ? String(initiator.id) : null,
      triggeredAt: typeof v["triggered_at"] === "string" ? v["triggered_at"] : null,
      task: name.startsWith("item:") && data && typeof data === "object" ? fromTodoistItem(data as TodoistItem) : null,
    },
  };
}
