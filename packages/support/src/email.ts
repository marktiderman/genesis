/**
 * `@marktiderman/genesis-support/email`: email as a ticket channel (ADR 0011), server only. The
 * server half of `migrations/0002_genesis_support_email.sql`.
 *
 * - `supportEmailRoute`: a route for genesis-notifications' `createInboundEmailHandler`. It takes
 *   an email sent to one of your support addresses, or to a ticket's reply address
 *   (`support+<token>@your-reply-domain`), or answering a ticket's email, and files it with
 *   `support_receive_email`: a new ticket, or a reply on the one it answers.
 * - `runSupportEmail`: sends staff replies on email tickets, threaded, through the notifier's
 *   `EmailProvider` (Resend), with the ticket's reply address and an idempotency key per reply.
 *   Run it from your jobs (every minute), or right after a reply.
 *
 * ```ts
 * import { createInboundEmailHandler, resendProvider } from "@marktiderman/genesis-notifications/server";
 * import { runSupportEmail, supportEmailRoute } from "@marktiderman/genesis-support/email";
 *
 * const inbound = createInboundEmailHandler({
 *   webhookSecret: env.RESEND_INBOUND_WEBHOOK_SECRET,
 *   apiKey: env.RESEND_API_KEY,
 *   routes: [supportEmailRoute(admin, { addresses: ["support@acme.test"], replyDomain: "reply.acme.test" })],
 * });
 * await runSupportEmail(admin, { email: resendProvider({ apiKey: env.RESEND_API_KEY }), from: "Acme Support <support@acme.test>", replyDomain: "reply.acme.test" });
 * ```
 *
 * @packageDocumentation
 */

/** The part of a service-role Supabase client these use. */
export interface SupportEmailClient {
  // Loose on purpose: an app's generated Database types may not list these functions yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** What the route reads from a received email: genesis-notifications' `InboundEmail` fits. */
export interface ReceivedEmail {
  providerId: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: readonly string[];
  from: { email: string; name: string | null };
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  text: string;
  authentication: Record<string, unknown> | null;
  attachments: ReadonlyArray<{ id: string; filename: string; contentType: string; size: number }>;
}

export interface SupportEmailRouteOptions {
  /** Your support addresses (`support@acme.test`): mail to one opens or continues a ticket. */
  addresses: readonly string[];
  /** The domain of tickets' reply addresses (`reply.acme.test`). Mail to `support+<token>@` it is taken too. */
  replyDomain?: string;
  /** Also take an email answering a ticket's email (In-Reply-To or References), to any address. Default true. */
  threads?: boolean;
}

const TOKEN = /\+[0-9a-f]{32}@/;

/**
 * A route that files support email as tickets. It takes an email when one of its recipients is a
 * support address or a ticket's reply address, or (with `threads`) when it answers an email.
 *
 * @stability Beta
 */
export function supportEmailRoute(client: SupportEmailClient, options: SupportEmailRouteOptions) {
  const addresses = new Set(options.addresses.map((a) => a.toLowerCase()));
  const replyDomain = options.replyDomain?.toLowerCase();
  const threads = options.threads ?? true;
  return async (email: ReceivedEmail): Promise<boolean> => {
    const recipients = [...email.to, ...(email.cc ?? [])].map((a) => a.toLowerCase());
    const addressed = recipients.some((a) => addresses.has(a) || (replyDomain !== undefined && TOKEN.test(a) && a.endsWith(`@${replyDomain}`)));
    const answering = threads && (email.inReplyTo !== null || email.references.length > 0);
    if (!addressed && !answering) return false;
    const { data, error } = await client.rpc("support_receive_email", {
      email: {
        messageId: email.messageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        from: email.from,
        to: recipients,
        subject: email.subject,
        text: email.text,
        providerId: email.providerId,
        authentication: email.authentication,
        attachments: email.attachments,
        // Mail not sent to a support address is filed only as a reply on a ticket it answers.
        onlyExisting: !addressed,
      },
    });
    if (error) throw new Error(`support_receive_email: ${error.message}`);
    return typeof data === "string";
  };
}

/** One email to send, as the notifier's `EmailProvider.send` takes it. */
export interface SupportEmailMessage {
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
}

/** genesis-notifications' `EmailProvider` (`resendProvider`), structurally. */
export interface SupportEmailProvider {
  send(message: SupportEmailMessage): Promise<{ id: string | null }>;
}

export interface RunSupportEmailOptions {
  email: SupportEmailProvider;
  /** The From line: `Acme Support <support@acme.test>`. */
  from: string;
  /** Reply addresses are `support+<token>@` this domain; it must receive mail through Resend. */
  replyDomain: string;
  /** The local part of reply addresses. Default `support`. */
  replyLocalPart?: string;
  /** At most this many per run. Default 20. */
  max?: number;
  /** For tests: the Message-ID's random part. */
  messageIdFor?: (id: string) => string;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Sends the queued staff replies on email tickets. Returns how many were sent and failed; a failed
 * one is queued again (up to 5 attempts). Never throws for one email.
 *
 * @stability Beta
 */
export async function runSupportEmail(client: SupportEmailClient, options: RunSupportEmailOptions): Promise<{ sent: number; failed: number }> {
  const { data, error } = await client.rpc("support_claim_outbound_emails", { max_rows: options.max ?? 20 });
  if (error) throw new Error(`support_claim_outbound_emails: ${error.message}`);
  const claimed = (Array.isArray(data) ? data : []) as Array<{
    id: string;
    to: string[];
    subject: string;
    text: string | null;
    inReplyTo: string | null;
    references: string[];
    token: string;
  }>;
  let sent = 0;
  let failed = 0;
  const local = options.replyLocalPart ?? "support";
  for (const m of claimed) {
    const messageId = options.messageIdFor?.(m.id) ?? `${m.id}@${options.replyDomain}`;
    const text = m.text ?? "";
    const headers: Record<string, string> = { "Message-ID": `<${messageId}>` };
    if (m.inReplyTo) headers["In-Reply-To"] = `<${m.inReplyTo}>`;
    const refs = m.references.filter((r) => r !== messageId);
    if (refs.length) headers.References = refs.map((r) => `<${r}>`).join(" ");
    try {
      const result = await options.email.send({
        from: options.from,
        to: m.to,
        replyTo: `${local}+${m.token}@${options.replyDomain}`,
        subject: m.subject,
        text,
        html: `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`,
        headers,
        idempotencyKey: `genesis-support-email-${m.id}`,
      });
      await client.rpc("support_settle_outbound_email", { message: m.id, provider_id: result.id, error: null, sent_message_id: messageId });
      sent++;
    } catch (thrown) {
      await client.rpc("support_settle_outbound_email", { message: m.id, provider_id: null, error: thrown instanceof Error ? thrown.message : String(thrown), sent_message_id: null });
      failed++;
    }
  }
  return { sent, failed };
}
