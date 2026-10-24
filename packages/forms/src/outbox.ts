/**
 * The submit outbox: submissions wait on the device until the server has them. Each is
 * queued with an idempotency key (so a retry is stored once), kept in storage across
 * restarts, sent when online with backoff between tries, and never dropped silently: one the
 * server refuses, or that runs out of tries, stays as `failed` until the respondent retries
 * or discards it.
 *
 * Transport-agnostic: `send` is the app's, typically a `fetch` to its endpoint that runs
 * `submitResponse` and answers its `SubmitResult` as JSON.
 */
import type { SubmissionInput } from "./server";
import type { KeyValueStorage } from "./storage";
import { isSubmitResult, submitOutcome, type SubmitFailureReason, type SubmitRequest, type SubmitResult } from "./submit-protocol";
import type { Json } from "./types";

/** One queued submission, as stored. Plain JSON. */
export interface OutboxEntry {
  /** The submission's idempotency key. */
  id: string;
  /** Which form it is for: `send` picks the endpoint by it. */
  formId: string;
  /** The body sent, every time the same. */
  request: SubmitRequest;
  /** The app's own details to show in a list (a form's title), never sent. */
  meta: Record<string, Json> | null;
  createdAt: number;
  /** Tries so far (since the last `retry`). */
  attempts: number;
  /** When it may be tried next. */
  nextAttemptAt: number;
  /** `pending`: will be sent. `failed`: refused, or out of tries; waits for `retry` or `discard`. */
  state: "pending" | "failed";
  /** Why the last try didn't deliver it, for the respondent or a log. Never holds an answer. */
  lastError: string | null;
  /** When the server refused it (`invalid` or `closed`), what it said. */
  rejection: { reason: SubmitFailureReason; errors?: Record<string, string> } | null;
}

/** A queued submission as the outbox shows it. */
export interface OutboxItem extends OutboxEntry {
  /** Being sent now. */
  sending: boolean;
}

export interface OutboxSnapshot {
  /** Whether what was stored has been read. Until then `items` may be missing some. */
  loaded: boolean;
  online: boolean;
  /** Oldest first. */
  items: readonly OutboxItem[];
  pending: number;
  failed: number;
  /** Reading or writing the storage failed; null once it works again. */
  storageError: string | null;
}

export interface EnqueueInput {
  formId: string;
  submission: SubmissionInput;
  /** Default: a new UUID. Pass the same key again and the queued submission is returned, not queued twice. */
  idempotencyKey?: string | undefined;
  /** Default: now. */
  clientSubmittedAt?: number | undefined;
  meta?: Record<string, Json> | undefined;
}

export interface SubmitOutboxOptions {
  storage: KeyValueStorage;
  /**
   * Send one submission and answer what the server said: its `SubmitResult` (an endpoint's
   * JSON body, whatever its status code). Throw, or answer anything else, and it is tried
   * again later. Abort on `signal` (sent after `timeoutMs`).
   */
  send(item: OutboxItem, context: { signal: AbortSignal }): Promise<unknown>;
  /** Milliseconds since 1970. Default `Date.now`. */
  now?: (() => number) | undefined;
  /** Storage keys start with this. Default `genesis-forms:outbox`. One outbox per prefix. */
  prefix?: string | undefined;
  /** Tries before a submission is marked `failed` (it is kept). Default 10. */
  maxAttempts?: number | undefined;
  /** Wait before try n+1: about `baseMs * 2^(n-1)`, at most `maxMs`, with jitter. Default 2 seconds and 15 minutes. */
  backoff?: { baseMs?: number | undefined; maxMs?: number | undefined } | undefined;
  /** How long one send may take before it is aborted and tried again. Default 30 seconds. */
  timeoutMs?: number | undefined;
  /** Whether the device is online to begin with. Default true. Keep it current with `setOnline`. */
  online?: boolean | undefined;
  /** Makes idempotency keys. Default `crypto.randomUUID`; React Native without it needs one (expo-crypto's `randomUUID`). */
  createKey?: (() => string) | undefined;
  /** 0 to 1, for jitter. Default `Math.random`. */
  random?: (() => number) | undefined;
  /** A submission the server now has (stored now, or before: a duplicate). */
  onDelivered?: ((item: OutboxItem, result: SubmitResult) => void) | undefined;
  /** Something went wrong that the app may want to log. Default `console.warn`. */
  log?: ((message: string) => void) | undefined;
}

export interface SubmitOutbox {
  /** Resolves once stored submissions are read (or reading failed: see `storageError`). Never rejects. */
  readonly ready: Promise<void>;
  /**
   * Queue a submission. Resolves once it is in storage: only then is it safe to clear the
   * draft. Rejects when storage can't take it (keep the draft, and tell the respondent).
   * Sends it at once when the outbox is started and online.
   */
  enqueue(input: EnqueueInput): Promise<OutboxItem>;
  /** Send every pending submission that is due, oldest first, one at a time. */
  flush(): Promise<void>;
  /** Try a failed submission again from its first try, now. */
  retry(id: string): Promise<void>;
  /** Remove a queued submission for good. False while it is being sent, or when it isn't there. */
  discard(id: string): Promise<boolean>;
  /** Tell the outbox whether the device is online. Coming online sends what's pending at once. */
  setOnline(online: boolean): void;
  /** Send as submissions come due (timers). `stop` ends it. */
  start(): void;
  stop(): void;
  getSnapshot(): OutboxSnapshot;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_PREFIX = "genesis-forms:outbox";

function defaultKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  throw new Error("createSubmitOutbox: crypto.randomUUID isn't available here; pass createKey (expo-crypto's randomUUID, say).");
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function readEntry(raw: string | null | undefined, id: string): OutboxEntry | null {
  if (typeof raw !== "string") return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Partial<OutboxEntry>;
  if (e.id !== id || typeof e.formId !== "string" || !e.request || typeof e.request !== "object") return null;
  if (e.request.idempotencyKey !== id) return null;
  return {
    id,
    formId: e.formId,
    request: e.request,
    meta: e.meta ?? null,
    createdAt: typeof e.createdAt === "number" ? e.createdAt : 0,
    attempts: typeof e.attempts === "number" ? e.attempts : 0,
    nextAttemptAt: typeof e.nextAttemptAt === "number" ? e.nextAttemptAt : 0,
    state: e.state === "failed" ? "failed" : "pending",
    lastError: typeof e.lastError === "string" ? e.lastError : null,
    rejection: e.rejection ?? null,
  };
}

function readIndex(raw: string | null | undefined): string[] {
  if (typeof raw !== "string") return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Each submission is stored under its own key, with an index of keys beside it. The index is
 * read again and merged on every change, so two outboxes on one storage (two tabs) don't
 * write each other's submissions out; both may send one, and its idempotency key makes the
 * server store it once.
 */
export function createSubmitOutbox(options: SubmitOutboxOptions): SubmitOutbox {
  const { storage, send } = options;
  const now = options.now ?? Date.now;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 10);
  const baseMs = options.backoff?.baseMs ?? 2_000;
  const maxMs = options.backoff?.maxMs ?? 15 * 60_000;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const createKey = options.createKey ?? defaultKey;
  const random = options.random ?? Math.random;
  const log = options.log ?? ((m: string) => console.warn(`[forms outbox] ${m}`));
  const indexKey = `${prefix}:index`;
  const itemKey = (id: string) => `${prefix}:item:${id}`;

  const entries = new Map<string, OutboxEntry>();
  let sendingId: string | null = null;
  let online = options.online ?? true;
  let loaded = false;
  let storageError: string | null = null;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;
  let again = false;
  const listeners = new Set<() => void>();
  let snapshot: OutboxSnapshot = build();

  function build(): OutboxSnapshot {
    const items = [...entries.values()]
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
      .map((e) => ({ ...e, sending: e.id === sendingId }));
    return {
      loaded,
      online,
      items,
      pending: items.filter((i) => i.state === "pending").length,
      failed: items.filter((i) => i.state === "failed").length,
      storageError,
    };
  }
  function changed() {
    snapshot = build();
    for (const l of [...listeners]) l();
  }

  // One storage change at a time, in order.
  let writes: Promise<unknown> = Promise.resolve();
  function serial<T>(step: () => Promise<T>): Promise<T> {
    const run = writes.then(step, step);
    writes = run.catch(() => undefined);
    return run;
  }
  async function updateIndex(change: (ids: Set<string>) => void) {
    const ids = new Set(readIndex(await storage.getItem(indexKey)));
    change(ids);
    await storage.setItem(indexKey, JSON.stringify([...ids]));
  }
  function storageOk() {
    if (storageError !== null) {
      storageError = null;
      changed();
    }
  }
  function storageFailed(what: string, e: unknown) {
    storageError = `${what}: ${message(e)}`;
    log(storageError);
    changed();
  }
  /** Writes an entry's new state; a failure is reported and the entry kept in memory (it is tried again). */
  async function persist(entry: OutboxEntry) {
    try {
      await serial(() => Promise.resolve(storage.setItem(itemKey(entry.id), JSON.stringify(entry))));
      storageOk();
    } catch (e) {
      storageFailed("Couldn't save the outbox", e);
    }
  }
  async function forget(id: string) {
    await serial(async () => {
      await updateIndex((ids) => void ids.delete(id));
      await storage.removeItem(itemKey(id));
    });
  }

  async function load() {
    try {
      const ids = readIndex(await storage.getItem(indexKey));
      for (const id of ids) {
        if (entries.has(id)) continue;
        const entry = readEntry(await storage.getItem(itemKey(id)), id);
        // Unreadable entries are left where they are, never removed: reported, not lost.
        if (entry) entries.set(id, entry);
        else log(`A stored submission (${id}) couldn't be read; it was left in storage.`);
      }
      loaded = true;
      storageError = null;
    } catch (e) {
      storageError = `Couldn't read the outbox: ${message(e)}`;
      log(storageError);
    }
    changed();
  }
  let ready = load();

  function delayFor(attempts: number): number {
    const full = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
    return Math.round(full / 2 + (random() * full) / 2);
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!running || !online) return;
    let next = Infinity;
    for (const e of entries.values()) if (e.state === "pending") next = Math.min(next, e.nextAttemptAt);
    if (next === Infinity) return;
    timer = setTimeout(() => void outbox.flush(), Math.max(0, next - now()));
  }

  async function attempt(entry: OutboxEntry): Promise<void> {
    sendingId = entry.id;
    changed();
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let result: unknown;
    let error: string | null = null;
    try {
      result = await Promise.race([
        send({ ...entry, sending: true }, { signal: controller.signal }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error(`No answer after ${timeoutMs} ms.`));
          }, timeoutMs);
        }),
      ]);
    } catch (e) {
      error = message(e);
    } finally {
      if (timeout) clearTimeout(timeout);
      sendingId = null;
    }
    // Discarded while it was being sent: nothing to update.
    if (!entries.has(entry.id)) return changed();
    const outcome = error === null ? submitOutcome(result) : "retry";
    if (outcome === "delivered") {
      entries.delete(entry.id);
      changed();
      try {
        await forget(entry.id);
        storageOk();
      } catch (e) {
        // Still in storage: after a restart it is sent again and answered `duplicate`.
        storageFailed("Couldn't remove a delivered submission from the outbox", e);
      }
      options.onDelivered?.({ ...entry, sending: false }, result as SubmitResult);
      return;
    }
    const next: OutboxEntry = { ...entry, attempts: entry.attempts + 1 };
    if (outcome === "rejected") {
      const r = result as Extract<SubmitResult, { reason: "invalid" | "closed" }>;
      next.state = "failed";
      next.rejection = r.reason === "invalid" ? { reason: r.reason, errors: r.errors } : { reason: r.reason };
      next.lastError = r.reason === "closed" ? "The form isn't taking responses." : "The server refused the answers.";
    } else {
      next.lastError =
        error ??
        (isSubmitResult(result) && !result.ok ? `The server answered ${result.reason}.` : "The server's answer wasn't understood.");
      if (next.attempts >= maxAttempts) {
        next.state = "failed";
        next.lastError = `Gave up after ${next.attempts} tries. Last: ${next.lastError}`;
      } else next.nextAttemptAt = now() + delayFor(next.attempts);
    }
    entries.set(entry.id, next);
    changed();
    await persist(next);
  }

  async function drain() {
    do {
      again = false;
      await ready;
      if (!loaded) {
        ready = load();
        await ready;
      }
      while (online) {
        const due = [...entries.values()]
          .filter((e) => e.state === "pending" && e.nextAttemptAt <= now())
          .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))[0];
        if (!due) break;
        await attempt(due);
      }
    } while (again);
  }

  const outbox: SubmitOutbox = {
    get ready() {
      return ready;
    },
    async enqueue(input) {
      await ready;
      const id = input.idempotencyKey ?? createKey();
      const existing = entries.get(id);
      if (existing) return { ...existing, sending: existing.id === sendingId };
      // A copy as JSON: what is stored is what is sent, and later changes to `input` don't reach it.
      const submission = JSON.parse(JSON.stringify(input.submission ?? {})) as SubmissionInput;
      const at = now();
      const entry: OutboxEntry = {
        id,
        formId: input.formId,
        request: { ...submission, idempotencyKey: id, clientSubmittedAt: input.clientSubmittedAt ?? at },
        meta: input.meta ? (JSON.parse(JSON.stringify(input.meta)) as Record<string, Json>) : null,
        createdAt: at,
        attempts: 0,
        nextAttemptAt: at,
        state: "pending",
        lastError: null,
        rejection: null,
      };
      try {
        await serial(async () => {
          // The entry first, then the index: an index never names an entry that isn't there.
          await storage.setItem(itemKey(id), JSON.stringify(entry));
          await updateIndex((ids) => void ids.add(id));
        });
      } catch (e) {
        storageFailed("Couldn't queue the submission", e);
        throw e;
      }
      storageOk();
      entries.set(id, entry);
      changed();
      if (running) void outbox.flush();
      return { ...entry, sending: false };
    },
    flush() {
      if (flushing) {
        again = true;
        return flushing;
      }
      flushing = drain().finally(() => {
        flushing = null;
        schedule();
      });
      return flushing;
    },
    async retry(id) {
      await ready;
      const entry = entries.get(id);
      if (!entry || entry.state !== "failed") return;
      const next: OutboxEntry = { ...entry, state: "pending", attempts: 0, nextAttemptAt: now(), lastError: null, rejection: null };
      entries.set(id, next);
      changed();
      await persist(next);
      await outbox.flush();
    },
    async discard(id) {
      await ready;
      if (!entries.has(id) || sendingId === id) return false;
      await forget(id);
      entries.delete(id);
      changed();
      schedule();
      return true;
    },
    setOnline(value) {
      if (online === value) return;
      online = value;
      if (online) {
        // Back online: what's pending goes now, not when its backoff ends.
        const at = now();
        for (const [id, e] of entries) if (e.state === "pending" && e.nextAttemptAt > at) entries.set(id, { ...e, nextAttemptAt: at });
      }
      changed();
      if (online && running) void outbox.flush();
      else schedule();
    },
    start() {
      if (running) return;
      running = true;
      void outbox.flush();
    },
    stop() {
      running = false;
      schedule();
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return outbox;
}
