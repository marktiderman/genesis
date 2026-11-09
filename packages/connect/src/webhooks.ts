/**
 * Checking a webhook delivery: the provider signs the raw request body with a shared secret
 * (HMAC), and the app recomputes it before believing anything in the body. WebCrypto only.
 *
 * Read the body once, as text or bytes, before parsing it: a re-serialized JSON body is not the
 * body that was signed.
 */
import { base64url } from "./encoding";

/** How a provider signs its deliveries. */
export interface WebhookSignatureOptions {
  /** The shared secret (Todoist: the app's client secret). */
  secret: string;
  /** The raw request body, exactly as received. */
  payload: string | Uint8Array;
  /** The signature the delivery carries (the header's value), or null when it has none. */
  signature: string | null | undefined;
  /** The HMAC hash. Default `SHA-256`. */
  algorithm?: "SHA-256" | "SHA-512" | "SHA-1" | undefined;
  /** How the signature is written. Default `base64` (Todoist); `hex` for GitHub-style headers. */
  encoding?: "base64" | "hex" | undefined;
  /** A prefix the header puts before the signature (`"sha256="` for GitHub). Default none. */
  prefix?: string | undefined;
}

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function toBase64(bytes: Uint8Array): string {
  // Standard base64 with padding, from the URL-safe encoder this package already has.
  const url = base64url(bytes).replace(/-/g, "+").replace(/_/g, "/");
  return url + "=".repeat((4 - (url.length % 4)) % 4);
}

/** Compares two strings in time that depends only on their lengths. */
function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Whether `signature` is the HMAC of `payload` under `secret`. False for a missing, malformed or
 * wrong signature, and for an empty secret; never throws for those. Compared in constant time.
 *
 * ```ts
 * const body = await request.text();
 * const ok = await verifyWebhookSignature({
 *   secret: process.env.TODOIST_CLIENT_SECRET!,
 *   payload: body,
 *   signature: request.headers.get("x-todoist-hmac-sha256"),
 * });
 * if (!ok) return new Response("Forbidden", { status: 403 });
 * const event = JSON.parse(body);
 * ```
 */
export async function verifyWebhookSignature(options: WebhookSignatureOptions): Promise<boolean> {
  const { secret, payload, signature } = options;
  if (!secret || typeof signature !== "string" || !signature) return false;
  const prefix = options.prefix ?? "";
  if (prefix && !signature.startsWith(prefix)) return false;
  const given = signature.slice(prefix.length).trim();
  if (!given) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: options.algorithm ?? "SHA-256" },
    false,
    ["sign"],
  );
  const data = typeof payload === "string" ? encoder.encode(payload) : payload;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, data as Uint8Array<ArrayBuffer>));
  const expected = (options.encoding ?? "base64") === "hex" ? toHex(mac) : toBase64(mac);
  return (options.encoding ?? "base64") === "hex"
    ? constantTimeEqual(expected, given.toLowerCase())
    : constantTimeEqual(expected, given);
}
