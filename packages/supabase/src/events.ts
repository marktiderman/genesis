/**
 * `@marktiderman/genesis-supabase/events`: the client half of `migrations/0018_genesis_events.sql`,
 * the app's own product events (ADR 0010).
 *
 * - `createEventTracker`: queues events and sends them in batches through
 *   `genesis_track_events` (a signed-in person's client) or `genesis_track_server_events`
 *   (`server: true`, a service-role client). A send that fails for a while (offline, a 5xx) is
 *   retried with backoff; one that can't succeed (signed out, a bad batch, the migration not
 *   applied) drops what it sent. Call `reset()` on sign-out. Tracking never throws into the app.
 * - `eventsSink`: the tracker as a genesis-native observability sink, so `observability.event(…)`
 *   reaches the table beside Sentry and EAS Observe.
 *
 * ```ts
 * const events = createEventTracker({ client: supabase, platform: "web", appVersion });
 * events.track("task.completed", { feature: "tasks", tenantId, properties: { count: 3 } });
 * ```
 *
 * Properties are flat labels and counts: no content someone typed, no personal data. The timer is
 * unref'd, so a short script calls `close()` to send what is left.
 *
 * @packageDocumentation
 */

/** The part of a Supabase client the tracker uses. */
export interface EventsClient {
  // Loose on purpose: an app's generated Database types may not list these functions yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** A property or flag value: labels and counts only. */
export type EventValue = string | number | boolean | null;

/** What `track` takes besides the name. */
export interface TrackOptions {
  /** The FeatureId it belongs to, so usage joins the feature. */
  feature?: string;
  /** The tenant it happened in; the server keeps it only when the person has a record there. */
  tenantId?: string | null;
  properties?: Readonly<Record<string, EventValue>>;
  /** Server events only: who, as given. */
  userId?: string;
  personId?: string;
}

export interface EventTrackerOptions {
  client: EventsClient;
  /** `web` (default), `native`, or `server` with `server: true`. */
  platform?: "web" | "native" | "server";
  appVersion?: string;
  /** Groups a visit's events; default a random id per tracker. */
  sessionId?: string;
  /** The flags that are on now, added to every event (`{ "new-list": true }`). */
  flags?: () => Readonly<Record<string, EventValue>>;
  /** Send through the service-role function (server code only). */
  server?: boolean;
  /** Send when this many are queued. Default 20 (the server takes at most 100 at once). */
  batchSize?: number;
  /** Send at least this often, in ms, while events wait. Default 5000; 0 turns the timer off. */
  flushIntervalMs?: number;
  /** The most events kept while sending fails; older ones are dropped first. Default 500. */
  maxQueue?: number;
  /** Told when a send fails (the events stay queued). */
  onError?: (error: { message: string; code?: string }) => void;
  /** For tests. */
  now?: () => Date;
}

export interface EventTracker {
  /** Queue one event. Never throws. */
  track(name: string, options?: TrackOptions): void;
  /** Send what is queued; resolves with how many the server kept (0 when the send failed). */
  flush(): Promise<number>;
  /** How many events are waiting. */
  readonly pending: number;
  /** Drop what is queued, unsent: call it when the login changes, so one person's events never go out as another's. */
  reset(): void;
  /** Stop the timer and send what is left; later events are ignored. */
  close(): Promise<number>;
}

const NAME = /^[a-z][a-z0-9]*([._:-][a-z0-9]+)*$/;

interface Queued {
  name: string;
  feature?: string;
  tenantId?: string;
  properties?: Readonly<Record<string, EventValue>>;
  flags?: Readonly<Record<string, EventValue>>;
  occurredAt: string;
  platform: string;
  appVersion?: string;
  sessionId: string;
  userId?: string;
  personId?: string;
}

/**
 * A batching tracker for the app's own events.
 *
 * @stability Beta
 */
export function createEventTracker(options: EventTrackerOptions): EventTracker {
  const batchSize = Math.min(Math.max(options.batchSize ?? 20, 1), 100);
  const maxQueue = options.maxQueue ?? 500;
  const platform = options.platform ?? (options.server ? "server" : "web");
  const sessionId = options.sessionId ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
  const now = options.now ?? (() => new Date());
  const fn = options.server ? "genesis_track_server_events" : "genesis_track_events";
  let queue: Queued[] = [];
  let sending: Promise<number> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let failures = 0;
  let retryAt = 0;

  const startTimer = () => {
    const ms = options.flushIntervalMs ?? 5000;
    if (ms > 0 && !timer) {
      timer = setInterval(() => void flush(), ms);
      (timer as { unref?: () => void }).unref?.();
    }
  };

  // Errors a retry can't fix: not signed in (42501: drop everything, it would go out as whoever
  // signs in next), a refused batch (22023, 413), the functions not installed (PGRST202, 42883).
  const permanent = (code?: string) => code === "22023" || code === "413" || code === "PGRST202" || code === "42883";
  const drop = (sent: readonly Queued[]) => {
    const gone = new Set(sent);
    queue = queue.filter((e) => !gone.has(e));
  };

  /** One batch: true when it is settled (sent or dropped), false to retry later. */
  const sendOnce = async (): Promise<{ settled: boolean; kept: number }> => {
    const batch = queue.slice(0, 100);
    let error: { message: string; code?: string } | null = null;
    let data: unknown = null;
    try {
      ({ data, error } = await options.client.rpc(fn, { events: batch }));
    } catch (thrown) {
      error = { message: thrown instanceof Error ? thrown.message : String(thrown) };
    }
    if (!error) {
      drop(batch);
      failures = 0;
      return { settled: true, kept: typeof data === "number" ? data : 0 };
    }
    options.onError?.(error);
    if (error.code === "42501") {
      queue = [];
      return { settled: true, kept: 0 };
    }
    if (permanent(error.code)) {
      drop(batch);
      return { settled: true, kept: 0 };
    }
    failures++;
    retryAt = Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(failures, 9));
    return { settled: false, kept: 0 };
  };

  async function flush(): Promise<number> {
    if (sending) return sending;
    if (Date.now() < retryAt) return 0;
    sending = (async () => {
      let kept = 0;
      while (queue.length) {
        const result = await sendOnce();
        kept += result.kept;
        if (!result.settled) break; // retry after the backoff
      }
      return kept;
    })().finally(() => {
      sending = null;
    });
    return sending;
  }

  return {
    track(name, opts = {}) {
      try {
        if (closed || !NAME.test(name)) return;
        const flags = options.flags?.();
        queue.push({
          name,
          ...(opts.feature ? { feature: opts.feature } : {}),
          ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
          ...(opts.properties ? { properties: opts.properties } : {}),
          ...(flags && Object.keys(flags).length ? { flags } : {}),
          occurredAt: now().toISOString(),
          platform,
          ...(options.appVersion ? { appVersion: options.appVersion } : {}),
          sessionId,
          ...(options.server && opts.userId ? { userId: opts.userId } : {}),
          ...(options.server && opts.personId ? { personId: opts.personId } : {}),
        });
        if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue); // oldest first

        startTimer();
        if (queue.length >= batchSize) void flush();
      } catch {
        // Tracking never breaks the app.
      }
    },
    flush,
    get pending() {
      return queue.length;
    },
    reset() {
      queue = [];
      failures = 0;
      retryAt = 0;
    },
    async close() {
      closed = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (sending) await sending;
      retryAt = 0;
      return flush();
    },
  };
}

/** What `eventsSink` needs to place an event: its feature and tenant. */
export interface EventsSinkOptions {
  /** The FeatureId an event name belongs to (`"task.completed"` → `"tasks"`). */
  feature?: (name: string) => string | undefined;
  /** The tenant the app is in now. */
  tenantId?: () => string | null | undefined;
}

/**
 * The tracker as a genesis-native observability sink (structurally: an object with `name`,
 * `event` and `flush`), so typed events reach the app's own table.
 *
 * @stability Beta
 */
export function eventsSink(tracker: EventTracker, options: EventsSinkOptions = {}) {
  return {
    name: "genesis-events",
    event(name: string, props: Readonly<Record<string, string | number | boolean>>) {
      const feature = options.feature?.(name);
      const tenantId = options.tenantId?.();
      tracker.track(name, { properties: props, ...(feature ? { feature } : {}), ...(tenantId ? { tenantId } : {}) });
    },
    flush(timeoutMs: number): Promise<boolean> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      });
      return Promise.race([tracker.flush().then(() => true), timeout]).finally(() => clearTimeout(timer));
    },
  };
}
