/**
 * Receiving email: one webhook, many uses. Resend posts `email.received` (signed like its other
 * webhooks); `createInboundEmailHandler` verifies it, fetches the full message
 * (`GET /emails/receiving/{id}`) and hands it to the first route that takes it: support tickets
 * (genesis-support's `supportEmailRoute`), an agent's inbox, an onboarding address, a forward.
 * Sending stays the notifier's (`resendProvider`); this is the way in. SMS will route the same way.
 *
 * ```ts
 * const handle = createInboundEmailHandler({
 *   webhookSecret: process.env.RESEND_INBOUND_WEBHOOK_SECRET!,
 *   apiKey: process.env.RESEND_API_KEY!,
 *   routes: [supportEmailRoute(admin, { addresses: ["support@acme.test"] })],
 * });
 * export const POST = ({ request }) => handle(request);
 * ```
 */
import { timedFetch, type HttpDeps } from "./errors";
import { verifyResendWebhook } from "./webhook";

export const RESEND_RECEIVING_API = "https://api.resend.com/emails/receiving";

/** One received email, as routes see it. Addresses are lowercased; ids have no angle brackets. */
export interface InboundEmail {
  /** Resend's id for the received email. */
  providerId: string;
  /** The RFC 5322 Message-ID. */
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: { email: string; name: string | null };
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string | null;
  /** SPF, DKIM and DMARC results as Resend reported them (null for older emails). */
  authentication: Record<string, unknown> | null;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
  receivedAt: string;
  /**
   * Sent by a machine: Auto-Submitted other than "no", Precedence bulk/junk/list/auto_reply, or an
   * X-Autoreply/X-Autorespond header (out-of-office answers, bounces, lists). Routes should not
   * answer or open work for these.
   */
  autoSubmitted: boolean;
}

/**
 * Takes an email or passes. Return true when it handled it (filed, answered, forwarded): later
 * routes don't see it. Throw to make Resend retry the webhook.
 */
export type InboundEmailRoute = (email: InboundEmail) => Promise<boolean> | boolean;

export interface InboundEmailHandlerOptions extends HttpDeps {
  /** The receiving webhook's signing secret (`whsec_…`). */
  webhookSecret: string;
  /** A Resend key that can read received email. */
  apiKey: string;
  routes: readonly InboundEmailRoute[];
  /** An email no route took. Default: dropped (logged by the caller if it wants). */
  onUnrouted?: (email: InboundEmail) => void | Promise<void>;
  endpoint?: string;
  now?: () => number;
}

const unbracket = (id: unknown) => (typeof id === "string" && id.trim() ? id.trim().replace(/^<|>$/g, "") : null);

/** One bare address: something@something, no spaces, brackets, quotes or commas, one "@". */
function bareAddress(text: string): string | null {
  if (!text || text.length > 320) return null;
  let at = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // space, tab, newline, ", ,, <, >, ;, and control characters
    if (c <= 0x20 || c === 0x22 || c === 0x2c || c === 0x3c || c === 0x3e || c === 0x3b || c === 0x7f) return null;
    if (c === 0x40) {
      if (at !== -1) return null;
      at = i;
    }
  }
  return at > 0 && at < text.length - 1 ? text.toLowerCase() : null;
}

/**
 * "Pat <Pat@Example.test>" → { email: "pat@example.test", name: "Pat" }. One address only: a header
 * naming several (`a@x.test, b@y.test`, or a second address in the display name) is no sender, so a
 * route can't be handed the wrong one. Linear in the length of the header.
 */
export function parseAddress(value: string): { email: string; name: string | null } | null {
  const v = value.trim();
  if (!v || v.length > 998) return null;
  // Outside a quoted display name: at most one "<…>", and no list separator.
  let quoted = false;
  let open = -1;
  let close = -1;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === "\\" && quoted) {
      i++;
      continue;
    }
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === "<") {
      if (open !== -1) return null;
      open = i;
    } else if (c === ">") {
      if (open === -1 || close !== -1) return null;
      close = i;
    } else if (c === "," || c === ";") return null;
  }
  if (quoted) return null;
  if (open === -1 && close === -1) {
    const email = bareAddress(v);
    return email ? { email, name: null } : null;
  }
  if (open === -1 || close === -1 || close < open || v.slice(close + 1).trim()) return null;
  const email = bareAddress(v.slice(open + 1, close).trim());
  if (!email) return null;
  const display = v.slice(0, open).trim();
  // A second address hidden in an unquoted display name.
  if (!display.startsWith('"') && display.includes("@")) return null;
  const name = display.replace(/^"|"$/g, "").trim();
  return { email, name: name || null };
}

const header = (headers: unknown, name: string): string | null => {
  if (!headers || typeof headers !== "object") return null;
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) if (k.toLowerCase() === name && typeof v === "string") return v;
  return null;
};

/** Resend's received-email object as an `InboundEmail`; null when it has no usable sender. */
export function inboundEmailOf(raw: Record<string, unknown>): InboundEmail | null {
  const from = parseAddress(String(raw.from ?? ""));
  if (!from) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((a) => parseAddress(String(a))?.email).filter((a): a is string => !!a);
  const refs = header(raw.headers, "references");
  return {
    providerId: String(raw.id ?? ""),
    messageId: unbracket(raw.message_id),
    inReplyTo: unbracket(raw.in_reply_to ?? header(raw.headers, "in-reply-to")),
    references: refs ? refs.split(/\s+/).map(unbracket).filter((r): r is string => !!r) : [],
    from,
    to: list(raw.to),
    cc: list(raw.cc),
    subject: typeof raw.subject === "string" ? raw.subject : "",
    text: typeof raw.text === "string" ? raw.text : "",
    html: typeof raw.html === "string" ? raw.html : null,
    authentication: raw.authentication && typeof raw.authentication === "object" ? (raw.authentication as Record<string, unknown>) : null,
    attachments: (Array.isArray(raw.attachments) ? raw.attachments : []).map((a: Record<string, unknown>) => ({
      id: String(a.id ?? ""),
      filename: String(a.filename ?? ""),
      contentType: String(a.content_type ?? ""),
      size: Number(a.size ?? 0),
    })),
    receivedAt: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    autoSubmitted:
      (header(raw.headers, "auto-submitted") ?? "no").toLowerCase() !== "no" ||
      /^(bulk|junk|list|auto_reply)$/i.test(header(raw.headers, "precedence") ?? "") ||
      header(raw.headers, "x-autoreply") !== null ||
      header(raw.headers, "x-autorespond") !== null,
  };
}

/** The webhook body is a small event; anything bigger is refused before its signature is checked. */
const MAX_WEBHOOK_BYTES = 256_000;

/**
 * The receiving webhook as a web-standard handler: 401 for an unsigned or stale request, 200 for
 * anything handled or ignored, 502 when the message couldn't be fetched or a route threw (Resend
 * retries).
 *
 * @stability Beta
 */
export function createInboundEmailHandler(options: InboundEmailHandlerOptions): (request: Request) => Promise<Response> {
  const endpoint = options.endpoint ?? RESEND_RECEIVING_API;
  return async (request) => {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BYTES) return new Response("too large", { status: 413 });
    const body = await request.text();
    if (body.length > MAX_WEBHOOK_BYTES) return new Response("too large", { status: 413 });
    if (!(await verifyResendWebhook(options.webhookSecret, request.headers, body, options.now?.() ?? Date.now()))) {
      return new Response("unsigned", { status: 401 });
    }
    let event: { type?: string; data?: { email_id?: string } };
    try {
      event = JSON.parse(body);
    } catch {
      return new Response("bad json", { status: 400 });
    }
    if (event.type !== "email.received" || !event.data?.email_id) return new Response("ignored", { status: 200 });
    let email: InboundEmail | null;
    try {
      const res = await timedFetch(options, `${endpoint}/${encodeURIComponent(event.data.email_id)}`, {
        headers: { authorization: `Bearer ${options.apiKey}` },
      });
      if (!res.ok) return new Response(`fetch ${res.status}`, { status: 502 });
      email = inboundEmailOf((await res.json()) as Record<string, unknown>);
    } catch {
      return new Response("fetch failed", { status: 502 });
    }
    if (!email) return new Response("no sender", { status: 200 });
    try {
      for (const route of options.routes) if (await route(email)) return new Response("routed", { status: 200 });
      await options.onUnrouted?.(email);
      return new Response("unrouted", { status: 200 });
    } catch {
      return new Response("route failed", { status: 502 });
    }
  };
}
