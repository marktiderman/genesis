/**
 * The contract every destination keeps. A destination sends one checked
 * submission somewhere (an inbox, a spreadsheet, a URL) and says whether a
 * failure is worth retrying. It never throws, never logs, and never puts a
 * secret, an answer or contact details in an error message.
 *
 * Storage is the app's: it keeps the outbox, claims due deliveries, counts
 * attempts and schedules retries. A destination only reports what happened.
 */
import type { FormDefinition, Json } from "../types";

/** One cell of a flat response row. */
export type Cell = string | number | boolean;

/**
 * What a destination delivers: a submission `validateSubmission` checked,
 * plus the id the app stored it under. `{ id, ...result.submission }` fits.
 */
export interface DeliverySubmission {
  /** The stored response's id. Every destination records it, so a resend is recognised. */
  id: string;
  /** Answers keyed by field id. */
  answers: Record<string, Json>;
  /** Untrusted URL and host inputs. */
  hidden?: Record<string, Json> | undefined;
  /** Trusted server inputs (account id, location…). */
  context?: Record<string, Json> | undefined;
  ending?: string | null | undefined;
  /** When it was submitted, as the app wants it shown: an ISO time, or a day such as `2026-10-22`. */
  submittedAt?: string | undefined;
  /**
   * Extra leading columns the app adds, in order, after `id` and `submitted_at`:
   * the form's slug and version, an account id, a location. Rows and emails show them;
   * the webhook sends them.
   */
  meta?: Record<string, Cell> | undefined;
  /** Labels the app attached, such as `low_rating`. The webhook sends them; a custom email can read them. */
  tags?: readonly string[] | undefined;
}

export interface DeliveryOptions {
  /**
   * This delivery's id, stable across its retries. The email destination's
   * idempotency key and the webhook's `webhook-id`. Defaults to the submission id.
   */
  deliveryId?: string | undefined;
  /** What this destination cached last time (`DeliveryResult.state`). */
  state?: Record<string, Json> | undefined;
  /**
   * An earlier attempt of this delivery may have gone through (it timed out,
   * or its lease ran out). Destinations that can look first do: the sheet
   * skips rows whose id is already there.
   */
  redelivery?: boolean | undefined;
  /** Aborts the delivery. Each request also has its own timeout. */
  signal?: AbortSignal | undefined;
  /**
   * The submission was delivered before and this is its update (an edit).
   * The sheet overwrites the response's row where it is (appending only when
   * it is gone), and the webhook's event type becomes `form.updated`.
   */
  update?: boolean | undefined;
  /**
   * The app's id for the destination. Passed on to option functions (a
   * secret, an account, an access token, a URL), so they can look up what
   * is stored for it.
   */
  destinationId?: string | undefined;
}

/** One submission in a batch: each carries its own definition and delivery id. */
export interface DeliveryItem {
  submission: DeliverySubmission;
  definition: FormDefinition;
  deliveryId?: string | undefined;
  /** This item is an update of a submission delivered before (see `DeliveryOptions.update`). */
  update?: boolean | undefined;
}

export type DeliveryResult =
  | {
      ok: true;
      /** New state to keep for this destination, when it changed. */
      state?: Record<string, Json>;
      /** Submission ids already there (a redelivery), so nothing was sent for them. */
      skipped?: string[];
      /**
       * Set when the destination deliberately sent nothing (no address to
       * send to, a daily cap reached): the reason, safe to store. Not a
       * failure and never retried; `createDeliveryRunner` records it as skipped.
       */
      notSent?: string;
    }
  | DeliveryFailure;

export interface DeliveryFailure {
  ok: false;
  /**
   * `true`: the same request may succeed later (rate limited, the service
   * down, a timeout). `false`: it will not until someone changes the config
   * or credentials (a bad key, an unshared sheet, a 404 URL).
   */
  retryable: boolean;
  /**
   * Set when the service said when to come back (429, 503) or is plainly
   * down: retry after this many seconds. An app may choose not to count the
   * attempt, since it says nothing about the delivery itself.
   */
  retryAfterSeconds?: number;
  /** The HTTP status that refused it, if one did. */
  status?: number;
  /** Safe to store and log: a status and a short reason, never secrets, answers or contact details. */
  error: string;
}

/** Config is plain JSON the app stores per destination. Secrets never go in it. */
export type DestinationConfig = Readonly<Record<string, unknown>>;

export interface Destination {
  /** `"email"`, `"sheet"`, `"webhook"`, or an app's own. */
  readonly kind: string;
  /** Deliver one submission. Never throws. */
  deliver(
    submission: DeliverySubmission,
    definition: FormDefinition,
    config: DestinationConfig,
    options?: DeliveryOptions,
  ): Promise<DeliveryResult>;
  /**
   * Deliver several submissions to the same destination in one request where
   * the service allows it. All succeed or all fail together. Never throws.
   */
  deliverBatch?(
    items: readonly DeliveryItem[],
    config: DestinationConfig,
    options?: Omit<DeliveryOptions, "deliveryId">,
  ): Promise<DeliveryResult>;
}

/**
 * A failure with a message that is safe to store. Destinations throw it
 * internally and `deliveryFailure` turns it into a result; app-written
 * destinations may do the same.
 */
export class DeliveryError extends Error {
  override name = "DeliveryError";
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly status: number | undefined;
  constructor(
    message: string,
    options: { retryable?: boolean | undefined; retryAfterSeconds?: number | undefined; status?: number | undefined } = {},
  ) {
    super(message);
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.status = options.status;
  }
}

/** Every outbound request gives up after this long, unless the destination is given another `timeoutMs`. */
export const REQUEST_TIMEOUT_MS = 10_000;

const IMF_FIXDATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * Seconds to wait from a Retry-After header, else the fallback. Only the
 * two forms RFC 9110 defines are read: delta-seconds (digits only) and an
 * IMF-fixdate (`Wed, 21 Oct 2026 07:28:00 GMT`); anything else (`-5`,
 * `1.5`, a loose date) gets the fallback. At least 1 second, at most a day.
 */
export function retryAfterSeconds(header: string | null | undefined, fallback = 60, now = Date.now()): number {
  const clamp = (s: number) => Math.min(86_400, Math.max(1, s));
  if (header) {
    const trimmed = header.trim();
    if (/^\d+$/.test(trimmed)) return clamp(Number(trimmed));
    if (IMF_FIXDATE.test(trimmed)) {
      const at = Date.parse(trimmed);
      if (Number.isFinite(at)) return clamp(Math.ceil((at - now) / 1000));
    }
  }
  return fallback;
}

/** Whether an HTTP status is worth retrying unchanged: 408, 425, 429 and 5xx. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * The error for a refused request. Retryable statuses (see
 * `isRetryableStatus`) wait for the Retry-After header, else 60 seconds;
 * every other status is permanent.
 */
export function httpError(what: string, response: Response, detail?: string): DeliveryError {
  const status = response.status;
  const message = `${what} answered ${status}${detail ? ` (${detail})` : ""}`;
  if (isRetryableStatus(status)) {
    return new DeliveryError(message, {
      retryable: true,
      retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")),
      status,
    });
  }
  return new DeliveryError(message, { retryable: false, status });
}

/**
 * Any error as a failed result with a safe message. A `DeliveryError` keeps
 * its message; anything else is reduced to its kind ("Timed out", "Network
 * error"), because a raw message may hold a URL with a token in it.
 * Timeouts and aborts are retryable. A `TypeError` is permanent: it is
 * almost always a bug that a retry would only repeat. `timedFetch` turns
 * fetch's own network `TypeError` into a retryable `DeliveryError` first, so
 * an app destination that calls `fetch` directly should do the same.
 */
export function deliveryFailure(error: unknown): DeliveryFailure {
  if (error instanceof DeliveryError) {
    return {
      ok: false,
      retryable: error.retryable,
      error: error.message.slice(0, 500),
      ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      ...(error.status !== undefined ? { status: error.status } : {}),
    };
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") return { ok: false, retryable: true, error: "Timed out" };
  if (name === "AbortError") return { ok: false, retryable: true, error: "Aborted" };
  if (name === "TypeError") return { ok: false, retryable: false, error: "Unexpected error" };
  return { ok: false, retryable: true, error: "Unexpected error" };
}

/** Shared by the built-in destinations. */
export interface HttpDeps {
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch | undefined;
  /** Per request. Default `REQUEST_TIMEOUT_MS`. */
  timeoutMs?: number | undefined;
}

/**
 * A request with a timeout, also aborted by the caller's signal. A network
 * failure (fetch rejects with a `TypeError`) becomes a retryable
 * `DeliveryError("Network error")`; timeouts and aborts pass through.
 */
export async function timedFetch(
  deps: HttpDeps,
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const any = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  const combined = signal ? (any ? any([timeout, signal]) : signal.aborted ? signal : timeout) : timeout;
  // fetch rejects with a TypeError both for a network failure and for a
  // request that can never be sent (a newline in a header value, a bad URL).
  // Building the Request first separates the two: that one fails for good,
  // without echoing the value that broke it.
  try {
    // Without the body, so a stream body is never locked by the check.
    new Request(url, { method: init.method ?? "GET", headers: init.headers ?? {} });
  } catch {
    throw new DeliveryError("Invalid request (a header value or the URL is malformed)", { retryable: false });
  }
  try {
    return await (deps.fetch ?? fetch)(url, { ...init, signal: combined });
  } catch (error) {
    if (error instanceof Error && error.name === "TypeError") throw new DeliveryError("Network error", { retryable: true });
    throw error;
  }
}

/** What an option function is told besides the config. */
export interface ResolveContext {
  /** `DeliveryOptions.destinationId`, when the app gave one. */
  destinationId?: string | undefined;
}

/** A factory option worked out per delivery from the destination's config. */
export type OptionResolver<T> = (config: DestinationConfig, context: ResolveContext) => T | Promise<T>;

/**
 * A factory option that may be a value or a function of the config (an
 * account, a secret). A function that throws fails the delivery
 * permanently with "<what> could not be resolved", never retried and never
 * echoing its message; to ask for a retry it can throw a retryable
 * `DeliveryError` itself.
 */
export async function resolveOption<T>(
  what: string,
  option: T | OptionResolver<T>,
  config: DestinationConfig,
  context: ResolveContext = {},
): Promise<T> {
  if (typeof option !== "function") return option;
  try {
    return await (option as OptionResolver<T>)(config, context);
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError(`${what} could not be resolved`);
  }
}

/** Lets go of a body we will not read, so the connection is freed. */
export function discard(response: Response): void {
  try {
    void response.body?.cancel().catch(() => {});
  } catch {
    // A mocked or already-read body.
  }
}

/** The string config value at `key`, trimmed, or "" (a snake_case `alias` is accepted too). */
export function configString(config: DestinationConfig, key: string, alias?: string): string {
  const raw = config[key] ?? (alias ? config[alias] : undefined);
  return typeof raw === "string" ? raw.trim() : "";
}

/** Bytes as base64url, no padding. */
export function base64url(bytes: Uint8Array | string): string {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Bytes (or UTF-8 text) as standard base64. */
export function base64(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = "";
  for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]!);
  return btoa(s);
}

/** Standard base64 (or base64url) as bytes. Throws on anything else. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** SHA-256 of a text, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** WebCrypto's key type, named without depending on the DOM lib. */
export type WebCryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
