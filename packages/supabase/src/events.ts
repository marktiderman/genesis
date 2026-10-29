/**
 * `@marktiderman/genesis-supabase/events`: the client half of `migrations/0018_genesis_events.sql`,
 * the app's own product events (ADR 0010).
 *
 * - `createEventTracker`: queues events and sends them in batches through
 *   `genesis_track_events` (a signed-in person's client) or `genesis_track_server_events`
 *   (`server: true`, a service-role client). A failed send keeps the batch for the next flush;
 *   tracking never throws into the app.
 * - `eventsSink`: the tracker as a genesis-native observability sink, so `observability.event(…)`
 *   reaches the table beside Sentry and EAS Observe.
 *
 * ```ts
 * const events = createEventTracker({ client: supabase, platform: "web", appVersion });
 * events.track("task.completed", { feature: "tasks", tenantId, properties: { count: 3 } });
 * ```
 *
 * Properties are labels and counts, never content someone typed or personal data.
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
  /** Stop the timer and send what is left. */
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

  const startTimer = () => {
    const ms = options.flushIntervalMs ?? 5000;
    if (ms > 0 && !timer) {
      timer = setInterval(() => void flush(), ms);
      (timer as { unref?: () => void }).unref?.();
    }
  };

  const sendOnce = async (): Promise<number> => {
    if (!queue.length) return 0;
    const batch = queue.slice(0, 100);
    try {
      const { data, error } = await options.client.rpc(fn, { events: batch });
      if (error) {
        options.onError?.(error);
        return 0;
      }
      queue = queue.slice(batch.length);
      return typeof data === "number" ? data : 0;
    } catch (thrown) {
      options.onError?.({ message: thrown instanceof Error ? thrown.message : String(thrown) });
      return 0;
    }
  };

  async function flush(): Promise<number> {
    if (sending) return sending;
    sending = (async () => {
      let kept = 0;
      while (queue.length) {
        const before = queue.length;
        kept += await sendOnce();
        if (queue.length === before) break; // the send failed: try again next flush
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
        if (!NAME.test(name)) return;
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
        if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
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
    async close() {
      if (timer) clearInterval(timer);
      timer = null;
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
      return Promise.race([tracker.flush().then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))]);
    },
  };
}
