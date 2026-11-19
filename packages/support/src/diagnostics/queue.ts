/**
 * The offline queue: sends that failed for a reason that may pass (no
 * network, a server error, a rate limit) are kept in storage the app passes in
 * and tried again with backoff, so a dump made on a train still arrives.
 *
 * The storage is injected, so the queue runs anywhere:
 *   - web: `window.localStorage` (it has this shape already);
 *   - native: `@react-native-async-storage/async-storage` (this shape too), or
 *     MMKV through a three-line adapter (`getString` / `set` / `delete`);
 *   - tests: `memoryQueueStorage()`.
 *
 * Only what was going to be sent is stored: a dump has been scrubbed and
 * capped before it reaches the queue.
 */
import { DIAGNOSTICS_DEFAULTS } from "./report";

/** `localStorage` / AsyncStorage's shape. Sync or async. */
export interface QueueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** A storage in memory: tests, or a platform with nothing persistent. */
export function memoryQueueStorage(): QueueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** A send that failed. `retryable` decides whether the queue keeps it. */
export class DiagnosticsSendError extends Error {
  constructor(
    message: string,
    /** The HTTP status, or 0 when nothing arrived. */
    readonly status: number,
    readonly retryable: boolean,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DiagnosticsSendError";
  }
}

/** True when trying again later may work: no answer, a timeout, a rate limit or a server error. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DiagnosticsSendError) return error.retryable;
  // fetch's own failure (offline, DNS, CORS): a TypeError in every runtime.
  return error instanceof TypeError;
}

interface Entry<T> {
  item: T;
  attempts: number;
  nextAt: number;
  addedAt: number;
}

export interface OfflineQueueOptions<T> {
  storage: QueueStorage;
  /** Sends one item; throws to keep it (when retryable) or drop it. */
  send: (item: T) => Promise<unknown>;
  /** The storage key. Default `genesis-support.diagnostics.queue`. */
  key?: string;
  isRetryable?: (error: unknown) => boolean;
  maxItems?: number;
  /** The stored queue's size cap, in bytes of JSON (default 1 MB); the oldest go first. */
  maxBytes?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  /** Try again by itself at the next due time (a timer). Default true; tests pass false and call `flush`. */
  autoRetry?: boolean;
  now?: () => number;
  /** A storage read or write failed, or an item was given up. */
  onProblem?: (problem: string, error?: unknown) => void;
}

export interface QueueFlushResult {
  sent: number;
  /** Kept to try again later. */
  kept: number;
  /** Given up: not retryable, or out of tries. */
  dropped: number;
}

export interface OfflineQueue<T> {
  /** Keep an item to send later. The oldest goes when the queue is full. */
  add(item: T): Promise<void>;
  /** Send every item that is due, oldest first. One flush runs at a time. */
  flush(options?: { force?: boolean }): Promise<QueueFlushResult>;
  size(): Promise<number>;
  clear(): Promise<void>;
  /** Stop the retry timer. */
  stop(): void;
}

export const DEFAULT_QUEUE_KEY = "genesis-support.diagnostics.queue";

export function createOfflineQueue<T>(options: OfflineQueueOptions<T>): OfflineQueue<T> {
  const key = options.key ?? DEFAULT_QUEUE_KEY;
  const now = options.now ?? Date.now;
  const maxItems = options.maxItems ?? DIAGNOSTICS_DEFAULTS.queueMaxItems;
  const maxBytes = options.maxBytes ?? DIAGNOSTICS_DEFAULTS.queueMaxBytes;
  const base = options.baseDelayMs ?? DIAGNOSTICS_DEFAULTS.queueBaseDelayMs;
  const maxDelay = options.maxDelayMs ?? DIAGNOSTICS_DEFAULTS.queueMaxDelayMs;
  const maxAttempts = options.maxAttempts ?? DIAGNOSTICS_DEFAULTS.queueMaxAttempts;
  const retryable = options.isRetryable ?? isRetryableError;
  const problem = (message: string, error?: unknown) => {
    try {
      options.onProblem?.(message, error);
    } catch {
      // a failing reporter never stops the queue
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing: Promise<QueueFlushResult> | null = null;
  // Writes are chained, so two adds never overwrite each other.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <R,>(work: () => Promise<R>): Promise<R> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };

  async function read(): Promise<Entry<T>[]> {
    try {
      const raw = await options.storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Entry<T>[]) : [];
    } catch (error) {
      problem("the queue could not be read; starting empty", error);
      return [];
    }
  }

  async function write(entries: Entry<T>[]): Promise<void> {
    try {
      let text = JSON.stringify(entries);
      while (entries.length && new TextEncoder().encode(text).length > maxBytes) {
        entries.shift();
        problem("the queue was over its size: the oldest item was dropped");
        text = JSON.stringify(entries);
      }
      if (entries.length) await options.storage.setItem(key, text);
      else await options.storage.removeItem(key);
    } catch (error) {
      problem("the queue could not be saved", error);
    }
  }

  const delay = (attempts: number) => Math.min(maxDelay, base * 2 ** Math.max(0, attempts - 1));

  function schedule(entries: Entry<T>[]) {
    if (options.autoRetry === false) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!entries.length) return;
    const due = Math.min(...entries.map((e) => e.nextAt));
    timer = setTimeout(() => {
      timer = undefined;
      void queue.flush();
    }, Math.max(0, due - now()));
    (timer as { unref?: () => void }).unref?.();
  }

  const queue: OfflineQueue<T> = {
    add: (item) =>
      serial(async () => {
        const entries = await read();
        const t = now();
        entries.push({ item, attempts: 1, nextAt: t + delay(1), addedAt: t });
        while (entries.length > maxItems) {
          entries.shift();
          problem("the queue was full: the oldest item was dropped");
        }
        await write(entries);
        schedule(entries);
      }),
    flush({ force = false } = {}) {
      if (flushing) return flushing;
      flushing = serial(async () => {
        const result: QueueFlushResult = { sent: 0, kept: 0, dropped: 0 };
        const entries = await read();
        const left: Entry<T>[] = [];
        for (const entry of entries) {
          if (!force && entry.nextAt > now()) {
            left.push(entry);
            result.kept += 1;
            continue;
          }
          try {
            await options.send(entry.item);
            result.sent += 1;
          } catch (error) {
            const attempts = entry.attempts + 1;
            if (retryable(error) && attempts <= maxAttempts) {
              left.push({ ...entry, attempts, nextAt: now() + delay(attempts) });
              result.kept += 1;
            } else {
              result.dropped += 1;
              problem("a queued send was given up", error);
            }
          }
        }
        // Adds wait for the flush (one chain), so nothing was written since the read.
        const next = left.slice(-maxItems);
        await write(next);
        schedule(next);
        return result;
      }).finally(() => {
        flushing = null;
      });
      return flushing;
    },
    size: async () => (await read()).length,
    clear: () =>
      serial(async () => {
        await write([]);
        schedule([]);
      }),
    stop() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
  return queue;
}
