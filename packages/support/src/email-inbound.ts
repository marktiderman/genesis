/**
 * Reply by email, wired end to end (server only):
 *
 * - **Out.** `supportEmailOptions` is what genesis-notifications' runner takes for email: support's
 *   templates (`supportEmailTemplates`) and, with replies set up, a `providerFor` that gives each
 *   support email (`support.message`, `support.reply`) its recipient's own signed Reply-To
 *   (`replyAddress`) and a References header naming the ticket, so mail apps keep one thread.
 * - **In.** `supportReplyRoute` is a route for genesis-notifications' `createInboundEmailHandler`
 *   (which checks the webhook's signature, fetches the email and flags automatic mail): it takes an
 *   email sent to a reply address, verifies the token, drops automatic mail and mail whose sender the
 *   receiving server didn't authenticate (DMARC), strips the quoted history and signature (`stripReply`), and
 *   posts the rest with `support_email_reply` (migration 0027), which posts it as that login.
 * - **Both.** `supportReplyConfig(env, settings)` reads the set-up, and `handleSupportInbound` is the
 *   whole inbound endpoint: 503 until it is set up, then the reply route (and any routes of yours).
 *
 * ```ts
 * // POST /api/support/email-inbound
 * export const POST = ({ request }) => handleSupportInbound(request, { env: process.env, client: admin, settings });
 * // The notifications job
 * createNotificationRunner({ …, email: { provider, appName, domains, ...supportEmailOptions({ env: process.env, provider, settings }) } });
 * ```
 *
 * Environment: `SUPPORT_REPLY_DOMAIN` (a domain that receives mail through Resend, only for these
 * replies), `SUPPORT_REPLY_SIGNING_SECRET` (16 characters or more), and for the inbound endpoint
 * `RESEND_INBOUND_WEBHOOK_SECRET` and `RESEND_API_KEY` (a key that can read received email). The
 * `support.replyByEmail` setting turns it off; it is on only with `support.email` (max preset).
 *
 * @stability Beta
 */
import { createInboundEmailHandler, type ClaimedJob, type EmailOptions, type EmailProvider, type InboundEmail, type InboundEmailRoute } from "@marktiderman/genesis-notifications/server";
import { claimsFromAddresses, replyAddress, replyKey, replyKeyring, stripReply, type ReplyClaims, type ReplyKeyring } from "./email-reply";
import { supportEmailTemplates } from "./email-templates";
import { supportSettingValues, type SupportSettingsInput } from "./settings";

/** The support types whose emails take replies (the verify prompt is answered in the app). */
export const SUPPORT_REPLY_TYPES = ["support.reply", "support.message"] as const;

type Env = Readonly<Record<string, string | undefined>>;

/** What reply by email needs, read from the environment and the settings. */
export interface SupportReplyConfig {
  domain: string;
  keyring: ReplyKeyring;
}

const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Reply by email's set-up, or the names of what is missing. Off (`{ missing: [] , off: true }`) with
 * the `support.replyByEmail` setting off. `legacyLabel`: an app that made reply addresses before
 * passes its old key label (and `legacySecret` when the secret was another), so they keep working.
 *
 * @stability Beta
 */
export function supportReplyConfig(
  env: Env,
  options: { settings?: SupportSettingsInput | null; legacyLabel?: string; legacySecret?: string; legacyLetter?: string } = {},
): SupportReplyConfig | { missing: string[]; off: boolean } {
  const s = supportSettingValues(options.settings ?? null);
  if (!s.support.replyByEmail || !s.support.email) return { missing: [], off: true };
  const domain = env["SUPPORT_REPLY_DOMAIN"]?.trim().toLowerCase() ?? "";
  const secret = env["SUPPORT_REPLY_SIGNING_SECRET"]?.trim() ?? "";
  const missing = [...(DOMAIN.test(domain) ? [] : ["SUPPORT_REPLY_DOMAIN"]), ...(secret.length >= 16 ? [] : ["SUPPORT_REPLY_SIGNING_SECRET"])];
  if (missing.length) return { missing, off: false };
  // New addresses take the next letter after an app's legacy one, so both verify.
  const legacyLetter = options.legacyLetter ?? "a";
  const keyring: ReplyKeyring = options.legacyLabel
    ? { ...replyKeyring(replyKey(secret), String.fromCharCode(legacyLetter.charCodeAt(0) + 1)), legacy: { [legacyLetter]: replyKey(options.legacySecret ?? secret, { label: options.legacyLabel }) } }
    : replyKeyring(replyKey(secret));
  return { domain, keyring };
}

/** The ticket and recipient a notification's email answers to, or null for any other email. */
export function supportJobClaims(job: Pick<ClaimedJob, "type" | "data" | "user_id">): ReplyClaims | null {
  const ticketId = job.data?.["ticket_id"];
  if (!(SUPPORT_REPLY_TYPES as readonly string[]).includes(job.type) || typeof ticketId !== "string" || !job.user_id) return null;
  return { ticketId, userId: job.user_id };
}

/** A provider that gives a support email its recipient's reply address and the ticket's thread header; other emails pass unchanged. */
export function supportReplyProvider(provider: EmailProvider, config: SupportReplyConfig, job: ClaimedJob): EmailProvider {
  const claims = supportJobClaims(job);
  if (!claims) return provider;
  let replyTo: string;
  try {
    replyTo = replyAddress(config.keyring, config.domain, claims);
  } catch {
    return provider;
  }
  return {
    name: provider.name,
    send: (message, options) =>
      provider.send(
        {
          ...message,
          replyTo,
          headers: { ...message.headers, References: `<support-ticket-${claims.ticketId}@${config.domain}>` },
          // The address names the week it was made: a retry in a later week sends another address,
          // so it is another request to the provider, never a clash with the first one's key.
          idempotencyKey: `${message.idempotencyKey}:${replyTo.slice(0, replyTo.indexOf("@")).slice(-4)}`,
        },
        options,
      ),
  };
}

/**
 * What the notifications runner's `email` options take for support: the templates, and with replies
 * set up, the reply addresses. Spread it into the app's `EmailOptions` (its own `templates` win).
 *
 * @stability Beta
 */
export function supportEmailOptions(options: {
  env: Env;
  provider: EmailProvider;
  settings?: SupportSettingsInput | null;
  legacyLabel?: string;
}): Pick<EmailOptions, "templates" | "providerFor"> {
  const config = supportReplyConfig(options.env, { ...(options.settings !== undefined ? { settings: options.settings } : {}), ...(options.legacyLabel ? { legacyLabel: options.legacyLabel } : {}) });
  const replies = !("missing" in config);
  const templates = supportEmailTemplates({ replies });
  if (!replies) return { templates };
  return { templates, providerFor: (job) => supportReplyProvider(options.provider, config, job) };
}

/**
 * Whether the receiving server vouched for the From address (Resend's `authentication`, worked out
 * on receipt, never read from the message's headers): DMARC "pass", which means SPF or DKIM passed
 * for a domain aligned with the From domain. A DKIM or SPF pass alone proves only that some domain
 * signed or sent it (`d=evil.test`), so it isn't trusted; nor is no result at all.
 *
 * @stability Beta
 */
export function senderAuthenticated(authentication: Record<string, unknown> | null | undefined): boolean {
  if (!authentication) return false;
  const dmarc = authentication["dmarc"];
  return typeof dmarc === "string" && dmarc.trim().toLowerCase() === "pass";
}

/** The part of a service-role Supabase client the route uses. */
export interface SupportReplyRpc {
  // Loose on purpose: an app's generated Database types may not list the function yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, args: any) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/**
 * SQLSTATEs that are a refusal, dropped and never retried: bad input (22…), an integrity check
 * (23…), not allowed (42501), a raised refusal (P0001) and too many on a ticket (GS429). Anything else
 * (a function missing while a deploy is half done, a lost connection) is retried.
 */
const REFUSED = /^(22...|23...|42501|P0001|GS429)$/;

/** What became of an email the route took. */
export type SupportReplyOutcome = "posted" | "automatic" | "unauthenticated" | "empty" | "refused";

/**
 * The inbound route for reply addresses. True for every email it recognises as one (posted, or
 * dropped: automatic, unauthenticated, empty, refused); false for anything else, so another route
 * may take it. Throws on a failure worth retrying, so Resend sends the webhook again.
 *
 * @stability Beta
 */
export function supportReplyRoute(
  client: SupportReplyRpc,
  options: SupportReplyConfig & { log?: (line: string) => void; onOutcome?: (outcome: SupportReplyOutcome, claims: ReplyClaims) => void; maxAgeWeeks?: number },
): InboundEmailRoute {
  const log = options.log ?? (() => {});
  return async (email: InboundEmail) => {
    const claims = claimsFromAddresses(options.keyring, options.domain, [...email.to, ...email.cc], options.maxAgeWeeks !== undefined ? { maxAgeWeeks: options.maxAgeWeeks } : {});
    if (!claims) return false;
    const done = (outcome: SupportReplyOutcome, line?: string) => {
      if (line) log(`[support-email] ${line} for ticket ${claims.ticketId}`);
      options.onOutcome?.(outcome, claims);
      return true;
    };
    if (email.autoSubmitted) return done("automatic", "dropped an automatic email");
    if (!senderAuthenticated(email.authentication)) return done("unauthenticated", "dropped a reply whose sender isn't authenticated (DMARC)");
    const body = stripReply(email.text, email.html);
    if (!body) return done("empty", "dropped an empty reply");
    const { error } = await client.rpc("support_email_reply", {
      p_ticket: claims.ticketId,
      p_user: claims.userId,
      p_from: email.from.email,
      // The same email delivered twice is posted once (its Message-ID, else Resend's id).
      p_message_id: email.messageId ?? `resend:${email.providerId}`,
      p_body: body,
    });
    if (error) {
      if (error.code && REFUSED.test(error.code)) return done("refused", `refused a reply (${error.code})`);
      throw new Error(`support_email_reply failed${error.code ? ` (${error.code})` : ""}`);
    }
    return done("posted");
  };
}

/**
 * The inbound endpoint: 405 for anything but POST, 503 until it is set up (or with replies off),
 * else genesis-notifications' inbound handler with the reply route first and `routes` after (the
 * support-email block's `supportEmailRoute`, say).
 *
 * @stability Beta
 */
export async function handleSupportInbound(
  request: Request,
  deps: {
    env: Env;
    client: SupportReplyRpc;
    settings?: SupportSettingsInput | null;
    routes?: readonly InboundEmailRoute[];
    legacyLabel?: string;
    log?: (line: string) => void;
    fetch?: typeof fetch;
  },
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const config = supportReplyConfig(deps.env, { ...(deps.settings !== undefined ? { settings: deps.settings } : {}), ...(deps.legacyLabel ? { legacyLabel: deps.legacyLabel } : {}) });
  const webhookSecret = deps.env["RESEND_INBOUND_WEBHOOK_SECRET"]?.trim() ?? "";
  const apiKey = deps.env["RESEND_API_KEY"]?.trim() ?? "";
  if ("missing" in config || !webhookSecret || !apiKey) return new Response("Not configured", { status: 503 });
  const handle = createInboundEmailHandler({
    webhookSecret,
    apiKey,
    routes: [supportReplyRoute(deps.client, { ...config, ...(deps.log ? { log: deps.log } : {}) }), ...(deps.routes ?? [])],
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  return handle(request);
}
