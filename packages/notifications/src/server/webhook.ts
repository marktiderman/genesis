/**
 * Resend's webhooks are signed the Standard Webhooks way (Svix): headers
 * `svix-id`, `svix-timestamp` and `svix-signature` (`v1,<base64 HMAC-SHA256
 * of "id.timestamp.body">`, with the base64 secret after `whsec_`).
 */
import { fromBase64, hmacSha256, timingSafeEqual } from "./crypto";

/** How far a webhook's timestamp may be from now: five minutes, as Svix checks. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Whether `body` was signed with `secret`; false for anything stale, unsigned or malformed. */
export async function verifyResendWebhook(secret: string, headers: Headers, body: string, now = Date.now()): Promise<boolean> {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signatures = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!secret || !id || !timestamp || !signatures || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  let key: Uint8Array;
  try {
    key = fromBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return false;
  }
  const expected = await hmacSha256(key, `${id}.${timestamp}.${body}`);
  for (const part of signatures.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    let given: Uint8Array;
    try {
      given = fromBase64(sig);
    } catch {
      continue;
    }
    if (timingSafeEqual(given, expected)) return true;
  }
  return false;
}

/** What the notifier does with an email event; null for the events it doesn't use. */
export function emailEventOf(payload: unknown): { providerId: string; event: "delivered" | "bounced" | "complained"; permanent: boolean } | null {
  const p = payload as { type?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown } } } | null;
  const id = p?.data?.email_id;
  if (typeof id !== "string" || !id || id.length > 200) return null;
  switch (p?.type) {
    case "email.delivered":
      return { providerId: id, event: "delivered", permanent: false };
    case "email.bounced":
      // Only what Resend names "Permanent" is a hard bounce; anything else (Transient, Undetermined, none) doesn't suppress.
      return { providerId: id, event: "bounced", permanent: p.data?.bounce?.type === "Permanent" };
    case "email.complained":
      return { providerId: id, event: "complained", permanent: true };
    default:
      return null;
  }
}
