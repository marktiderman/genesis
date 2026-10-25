/**
 * A send failure with a message that is safe to store and log (a status and
 * a provider's error code, never content, an address or a secret). The
 * runner turns it into a retry or a failure.
 */
export class SendError extends Error {
  override name = "SendError";
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly status: number | undefined;
  constructor(message: string, options: { retryable?: boolean; retryAfterSeconds?: number; status?: number } = {}) {
    super(message.slice(0, 500));
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.status = options.status;
  }
}

/** Whether an HTTP status is worth retrying unchanged: 408, 425, 429 and 5xx. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Seconds from a Retry-After header (delta-seconds or an HTTP date), else `fallback`. 1 s to a day. */
export function retryAfterSeconds(header: string | null | undefined, fallback = 60, now = Date.now()): number {
  const clamp = (s: number) => Math.min(86_400, Math.max(1, s));
  const value = header?.trim();
  if (value && /^\d+$/.test(value)) return clamp(Number(value));
  if (value && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
    const at = Date.parse(value);
    if (Number.isFinite(at)) return clamp(Math.ceil((at - now) / 1000));
  }
  return fallback;
}

/** Every request gives up after this long. */
export const REQUEST_TIMEOUT_MS = 10_000;

export interface HttpDeps {
  /** Default the global `fetch`. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** `fetch` with a timeout, and the caller's abort signal too. */
export async function timedFetch(deps: HttpDeps, url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const f = deps.fetch ?? fetch;
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    return await f(url, { ...init, signal: combined });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    throw new SendError(name === "TimeoutError" || name === "AbortError" ? "Timed out" : "Network error", { retryable: true });
  }
}

/** Reads and drops a body we won't use (some runtimes leak a connection otherwise). */
export function discard(response: Response): void {
  response.body?.cancel().catch(() => {});
}
