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

const ADDRESS = /<?([^<>\s]+@[^<>\s]+)>?\s*$/;
const unbracket = (id: unknown) => (typeof id === "string" && id.trim() ? id.trim().replace(/^<|>$/g, "") : null);

/** "Pat <Pat@Example.test>" → { email: "pat@example.test", name: "Pat" }. */
export function parseAddress(value: string): { email: string; name: string | null } | null {
  const m = ADDRESS.exec(value.trim());
  if (!m) return null;
  const name = value.slice(0, value.lastIndexOf(m[0])).trim().replace(/^"|"$/g, "");
  return { email: m[1]!.toLowerCase(), name: name || null };
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
  };
}

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
    const body = await request.text();
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
