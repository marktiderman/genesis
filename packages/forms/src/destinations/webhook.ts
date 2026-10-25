/**
 * The webhook destination: a signed JSON POST to a URL, following the
 * Standard Webhooks spec (standardwebhooks.com), so receivers can verify it
 * with any Standard Webhooks library, or with `verifyWebhook` here.
 *
 * Headers: `webhook-id` (the delivery id, stable across retries: receivers
 * dedupe on it), `webhook-timestamp` (Unix seconds) and `webhook-signature`
 * (`v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">`). Receivers reject
 * a timestamp more than five minutes off, which stops replays.
 *
 * The URL comes from config, which an admin may type, so by default it must
 * be https, carry no credentials, and not name localhost or a private,
 * loopback or link-local address literally. Redirects are not followed. A
 * hostname that resolves to a private address is not caught here: if
 * untrusted users choose URLs, send from a network that cannot reach
 * internal services.
 */
import { own, withheld } from "../logic";
import { isSensitive } from "../fields";
import type { FieldBlock, FormDefinition, Json } from "../types";
import { checkHookHost, type ResolveHost } from "./hook-url";
import { responseRow, visibleInputs, type RowOptions } from "./row";
import {
  base64,
  configString,
  deliveryFailure,
  DeliveryError,
  discard,
  fromBase64,
  httpError,
  resolveOption,
  timedFetch,
  type DeliveryOptions,
  type DeliveryResult,
  type DeliverySubmission,
  type Destination,
  type DestinationConfig,
  type HttpDeps,
  type OptionResolver,
  type WebCryptoKey,
} from "./types";

/** What the webhook destination reads from a destination's config. */
export interface WebhookConfig {
  url: string;
}

export interface WebhookDestinationOptions extends HttpDeps {
  /**
   * The signing secret: base64 of at least 16 random bytes, usually with
   * the `whsec_` prefix Standard Webhooks tools issue (`whsec_` plus base64
   * of 24 to 64 bytes is what the spec recommends). The prefix is optional;
   * the rest is always base64-decoded, as every Standard Webhooks library
   * does, so a receiver verifies with the same string. A secret that is not
   * base64 fails permanently. Or a function that finds the one for a
   * destination's config. Never put it in config.
   */
  secret: string | OptionResolver<string>;
  /** Allow `http:` URLs. Default false. */
  allowInsecureUrls?: boolean | undefined;
  /** Allow localhost and private, loopback and link-local address literals. Default false. */
  allowPrivateHosts?: boolean | undefined;
  /** Sensitive fields: `"include"` (default), `"mask"` or `"omit"`. */
  sensitive?: RowOptions["sensitive"];
  /** The event type in the payload. Default `"form.submitted"`, or `"form.updated"` for an update. */
  type?: string | undefined;
  /**
   * Where to post, when it is not `config.url`: the address kept apart from
   * config (encrypted, say, since a webhook URL can carry a token). Gets the
   * config and `{ destinationId }`. It passes the same checks.
   */
  url?: OptionResolver<string> | undefined;
  /**
   * Resolves the URL's host before every request, and the delivery is refused
   * unless every address is public (see `checkHookHost`). This catches a
   * hostname that points at a private address, which the URL checks alone
   * cannot. Recommended wherever untrusted people choose URLs.
   */
  resolveHost?: ResolveHost | undefined;
  now?: (() => number) | undefined;
}

/** The JSON body a webhook receives. */
export interface WebhookPayload {
  type: string;
  /** ISO time the delivery was sent. */
  timestamp: string;
  data: {
    form: { id: string; title: string };
    submission: {
      id: string;
      /** Answers keyed by field id. */
      answers: Record<string, Json>;
      hidden: Record<string, Json>;
      context: Record<string, Json>;
      ending: string | null;
      submittedAt: string | null;
      meta: Record<string, Json>;
      tags: string[];
    };
    /** The same submission as a flat row by column key: labels for choices, as the sheet shows it. */
    row: Record<string, Json>;
  };
}

const MIN_SECRET_BYTES = 16;
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * The HMAC key bytes for a secret, decoded as the Standard Webhooks
 * reference libraries do: an optional `whsec_` prefix is dropped and the
 * rest is base64-decoded. Only padded standard base64 is accepted, the form
 * every reference library decodes the same way. Throws a `DeliveryError` for
 * a secret that is not base64 or is shorter than 16 bytes once decoded.
 */
function secretKey(secret: string): Uint8Array<ArrayBuffer> {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (!encoded || !STRICT_BASE64.test(encoded)) {
    throw new DeliveryError(
      "The webhook secret must be base64, optionally prefixed with whsec_ (Standard Webhooks libraries base64-decode it)",
    );
  }
  const bytes = fromBase64(encoded);
  if (bytes.length < MIN_SECRET_BYTES) throw new DeliveryError(`The webhook secret is shorter than ${MIN_SECRET_BYTES} bytes`);
  return bytes;
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<WebCryptoKey> {
  return crypto.subtle.importKey("raw", secretKey(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/**
 * A new signing secret: `whsec_` and standard base64 of 32 random bytes, the
 * form Standard Webhooks libraries read. Show it to the receiver once; keep it
 * out of config.
 */
export function newWebhookSecret(): string {
  return `whsec_${base64(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/** The `webhook-signature` value for a message: `v1,<base64>`. */
export async function signWebhook(secret: string, id: string, timestamp: number, body: string): Promise<string> {
  const key = await hmacKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${base64(new Uint8Array(mac))}`;
}

export interface VerifyWebhookInput {
  /** The same secret the sender signs with (base64, optionally `whsec_`-prefixed). */
  secret: string;
  /** The request's headers: a `Headers` or a plain object. */
  headers: Headers | Record<string, string | string[] | undefined>;
  /** The raw body, exactly as received. */
  body: string;
  /** Default 300: a timestamp further off than this is refused. */
  toleranceSeconds?: number | undefined;
  now?: (() => number) | undefined;
}

/**
 * Checks a Standard Webhooks request: the timestamp is recent and one of the
 * space-separated `v1` signatures matches. Compares in constant time (by
 * WebCrypto `verify`). Never throws on a malformed request: returns false.
 */
export async function verifyWebhook(input: VerifyWebhookInput): Promise<boolean> {
  const header = (name: string): string => {
    if (typeof (input.headers as Headers).get === "function") return (input.headers as Headers).get(name) ?? "";
    const raw = (input.headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  };
  const id = header("webhook-id");
  const timestamp = header("webhook-timestamp");
  const signatures = header("webhook-signature");
  if (!id || !/^\d{1,12}$/.test(timestamp) || !signatures) return false;
  const now = Math.floor((input.now?.() ?? Date.now()) / 1000);
  if (Math.abs(now - Number(timestamp)) > (input.toleranceSeconds ?? 300)) return false;
  let key: WebCryptoKey;
  try {
    key = await hmacKey(input.secret, "verify");
  } catch {
    return false;
  }
  const data = new TextEncoder().encode(`${id}.${timestamp}.${input.body}`);
  for (const part of signatures.split(" ")) {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) continue;
    let mac: Uint8Array<ArrayBuffer>;
    try {
      mac = fromBase64(value);
    } catch {
      continue;
    }
    if (await crypto.subtle.verify("HMAC", key, mac, data)) return true;
  }
  return false;
}

const PRIVATE_HOSTNAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

/** Whether a URL hostname is localhost or a private, loopback, link-local or unspecified address literal. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (PRIVATE_HOSTNAME.test(host)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) return isPrivateV4(v4.slice(1).map(Number) as [number, number, number, number]);
  if (host.startsWith("[") && host.endsWith("]")) {
    const v6 = host.slice(1, -1);
    if (v6 === "::" || v6 === "::1") return true;
    // IPv4-mapped (::ffff:a.b.c.d, which URL writes as ::ffff:xxxx:xxxx).
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
    if (mapped) {
      const hi = parseInt(mapped[1]!, 16);
      const lo = parseInt(mapped[2]!, 16);
      return isPrivateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
    }
    const first = parseInt(v6.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80; // fc00::/7, fe80::/10
  }
  return false;
}

function isPrivateV4([a, b]: [number, number, number, number]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** The URL from config, checked. Throws a `DeliveryError` naming the rule it broke (never the URL, which may hold a token). */
export function checkWebhookUrl(
  raw: string,
  options: Pick<WebhookDestinationOptions, "allowInsecureUrls" | "allowPrivateHosts"> = {},
): URL {
  if (!raw) throw new DeliveryError("The webhook destination has no url");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DeliveryError("The webhook url is not a valid URL");
  }
  if (url.protocol !== "https:" && !(options.allowInsecureUrls && url.protocol === "http:")) {
    throw new DeliveryError("The webhook url must use https");
  }
  if (url.username || url.password) throw new DeliveryError("The webhook url must not contain credentials");
  if (!options.allowPrivateHosts && isPrivateHost(url.hostname)) {
    throw new DeliveryError("The webhook url points at a private or local address");
  }
  return url;
}

/** The payload for one submission. Identifying answers stay out on anonymous forms. */
export function webhookPayload(
  submission: DeliverySubmission,
  definition: FormDefinition,
  options: { sensitive?: RowOptions["sensitive"]; type?: string | undefined; now?: number | undefined } = {},
): WebhookPayload {
  const sensitive = options.sensitive ?? "include";
  const { row } = responseRow(submission, definition, { sensitive });
  const answers: Record<string, Json> = {};
  for (const block of definition.blocks) {
    if (block.kind !== "field") continue;
    const field = block as FieldBlock;
    const value = own(submission.answers, field.id);
    if (value === undefined || withheld(definition, field)) continue;
    if (isSensitive(field) && sensitive !== "include") {
      if (sensitive === "mask") answers[field.id] = "[sensitive]";
      continue;
    }
    answers[field.id] = value;
  }
  const inputs = visibleInputs(submission, definition, sensitive);
  const pick = (source: Record<string, Json> | undefined, allowed: Record<string, Json>) => {
    const out: Record<string, Json> = {};
    for (const [name, value] of Object.entries(source ?? {})) if (own(allowed, name) !== undefined) out[name] = value;
    return out;
  };
  return {
    type: options.type ?? "form.submitted",
    timestamp: new Date(options.now ?? Date.now()).toISOString(),
    data: {
      form: { id: definition.id, title: definition.title },
      submission: {
        id: submission.id,
        answers,
        hidden: pick(submission.hidden, inputs),
        context: pick(submission.context, inputs),
        ending: submission.ending ?? null,
        submittedAt: submission.submittedAt ?? null,
        meta: { ...submission.meta },
        tags: [...(submission.tags ?? [])],
      },
      row,
    },
  };
}

export function webhookDestination(options: WebhookDestinationOptions): Destination {
  return {
    kind: "webhook",
    async deliver(submission, definition, config, deliveryOptions: DeliveryOptions = {}): Promise<DeliveryResult> {
      try {
        const context = { destinationId: deliveryOptions.destinationId };
        const raw = options.url
          ? await resolveOption("The webhook url", options.url, config, context)
          : configString(config, "url");
        const url = checkWebhookUrl(typeof raw === "string" ? raw.trim() : "", options);
        // allowPrivateHosts opts out of the address check, the resolved one included.
        if (options.resolveHost && !options.allowPrivateHosts) await checkHookHost(url, options.resolveHost);
        const secret = await resolveOption("The webhook secret", options.secret, config, context);
        if (!secret) throw new DeliveryError("The webhook secret is not set");
        const now = options.now?.() ?? Date.now();
        const id = deliveryOptions.deliveryId ?? submission.id;
        const timestamp = Math.floor(now / 1000);
        const type = options.type ?? (deliveryOptions.update ? "form.updated" : undefined);
        const body = JSON.stringify(webhookPayload(submission, definition, { sensitive: options.sensitive, type, now }));
        const response = await timedFetch(
          options,
          url.toString(),
          {
            method: "POST",
            redirect: "manual",
            headers: {
              "content-type": "application/json",
              "user-agent": "genesis-forms-webhook/1",
              "webhook-id": id,
              "webhook-timestamp": String(timestamp),
              "webhook-signature": await signWebhook(secret, id, timestamp, body),
            },
            body,
          },
          deliveryOptions.signal,
        );
        discard(response);
        if (response.status >= 200 && response.status < 300) return { ok: true };
        // `redirect: "manual"` gives a 3xx (or, in browsers, an opaque status 0).
        if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
          throw new DeliveryError(`Webhook answered ${response.status || "a redirect"}: redirects are not followed`, {
            ...(response.status ? { status: response.status } : {}),
          });
        }
        throw httpError("Webhook", response);
      } catch (error) {
        return deliveryFailure(error);
      }
    },
  };
}
