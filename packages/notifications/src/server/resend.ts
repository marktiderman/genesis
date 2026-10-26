/**
 * Resend's REST API as an `EmailProvider`. One key per app (`RESEND_API_KEY`);
 * each tenant gets its own sender identity (`senderFor`), not its own key.
 *
 * Retries are byte-identical (the runner stores the first render), and every
 * send carries an idempotency key, so Resend sends once:
 * - 409 `invalid_idempotent_request`: the key was used with another body. The
 *   stored render never changes, so the body differed in what is built at send
 *   time: a secret link builder that isn't deterministic (it must give the same
 *   link for the same notification every time). The job fails loudly
 *   (`idempotency_body_changed`); it is never counted as sent.
 * - 409 `concurrent_idempotent_requests`: another attempt is in flight: retry soon.
 *
 * Requests are paced (`perSecond`, default 5) under Resend's default limit of
 * 10 requests a second per team, which every key of the team shares.
 */
import { SendError, discard, isRetryableStatus, retryAfterSeconds, timedFetch, type HttpDeps } from "./errors";
import { createRateLimiter } from "./rate";

/** One email, ready to send. Addresses and headers are already checked. */
export interface EmailMessage {
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers (`List-Unsubscribe`, `List-Unsubscribe-Post`). */
  headers?: Record<string, string>;
  /** Provider tags: name and value are letters, digits, "_" or "-". */
  tags?: { name: string; value: string }[];
  /** Stable across retries of one send job. */
  idempotencyKey: string;
}

export interface EmailSendResult {
  /** The provider's id for the email (what its webhooks name). */
  id: string | null;
  /** The provider says it was sent before (the same idempotency key). */
  alreadySent?: boolean;
}

/** Sends one email. Throws a `SendError` on failure. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage, options?: { signal?: AbortSignal }): Promise<EmailSendResult>;
}

export const RESEND_API = "https://api.resend.com/emails";

/** Requests a second the provider starts by default: half Resend's default team limit (10). */
export const RESEND_DEFAULT_PER_SECOND = 5;

export interface ResendOptions extends HttpDeps {
  apiKey: string;
  endpoint?: string;
  /** Requests started per second, at most. Default `RESEND_DEFAULT_PER_SECOND` (5). Raise it only if Resend raised your team's limit. */
  perSecond?: number;
  /** For tests: the clock and the wait the pacer uses. */
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Resend as an `EmailProvider`.
 *
 * @stability Beta
 */
export function resendProvider(options: ResendOptions): EmailProvider {
  const pace = createRateLimiter({
    perSecond: options.perSecond ?? RESEND_DEFAULT_PER_SECOND,
    ...(options.now ? { now: options.now } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });
  return {
    name: "resend",
    async send(message, { signal } = {}) {
      if (!options.apiKey) throw new SendError("The Resend API key is not set");
      try {
        await pace.acquire(signal);
      } catch {
        throw new SendError("Timed out", { retryable: true });
      }
      const response = await timedFetch(
        options,
        options.endpoint ?? RESEND_API,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: message.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
            ...(message.headers && Object.keys(message.headers).length ? { headers: message.headers } : {}),
            ...(message.tags?.length ? { tags: message.tags } : {}),
          }),
        },
        signal,
      );
      if (response.ok) {
        let id: string | null = null;
        try {
          const body = (await response.json()) as { id?: unknown };
          if (typeof body.id === "string" && body.id.length <= 200) id = body.id;
        } catch {
          // Sent; the id is only for the webhooks.
        }
        return { id };
      }
      // Resend's error `name` is safe to keep; its message may echo input.
      let name: string | undefined;
      try {
        const body = (await response.json()) as { name?: unknown };
        if (typeof body.name === "string" && /^[a-z_]{1,64}$/.test(body.name)) name = body.name;
      } catch {
        discard(response);
      }
      if (response.status === 409 && name === "invalid_idempotent_request") {
        // Never "sent": the body changed under the same key, so something built at send time isn't deterministic.
        throw new SendError("idempotency_body_changed: Resend answered 409 (invalid_idempotent_request); a secret link builder must give the same link every time", {
          retryable: false,
          status: 409,
        });
      }
      if (response.status === 409 && name === "concurrent_idempotent_requests") {
        throw new SendError("Resend answered 409 (concurrent_idempotent_requests)", { retryable: true, retryAfterSeconds: 5, status: 409 });
      }
      const retryable = isRetryableStatus(response.status);
      throw new SendError(`Resend answered HTTP ${response.status}${name ? ` (${name})` : ""}`, {
        retryable,
        status: response.status,
        ...(response.status === 429 || response.status === 503 ? { retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after"), 30) } : {}),
      });
    },
  };
}
