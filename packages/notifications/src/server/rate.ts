/**
 * A request pacer: at most `perSecond` requests start in any second, spaced
 * evenly, however many callers wait at once. Each provider instance has its
 * own; two runners running at once each keep to it, so set it for that.
 */
export interface RateLimiter {
  /** Resolves when the caller may start its request; rejects if `signal` aborts first. */
  acquire(signal?: AbortSignal): Promise<void>;
}

export interface RateLimiterOptions {
  perSecond: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** @stability Beta */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  if (!(options.perSecond > 0) || !Number.isFinite(options.perSecond)) throw new Error("createRateLimiter: perSecond must be a positive number");
  const gap = 1000 / options.perSecond;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  let next = 0;
  return {
    async acquire(signal) {
      const at = Math.max(now(), next);
      next = at + gap;
      const wait = at - now();
      if (wait > 0) await sleep(wait, signal);
    },
  };
}
