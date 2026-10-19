// ---------------------------------------------------------------------------
// Outbox delivery (DATA-STUDIO.md "Write safety → Outbox delivery").
//
// The `outbox` audit sink writes each entry to genesis_studio.outbox inside
// the edit's transaction. This worker delivers them afterwards:
//
//   - at least once: each entry carries a unique id, so receivers drop
//     duplicates;
//   - in order per record: an entry waits while an earlier one for the same
//     record is undelivered or dead-lettered; other records keep flowing;
//   - one worker per entry: rows are claimed with FOR UPDATE SKIP LOCKED;
//   - retries with exponential backoff and jitter (default 10 attempts over
//     about a day); an error retrying can't fix skips the rest;
//   - then the dead-letter table, an alert, and a wait for replay.
//
// The worker logs in as its own role (studioSetupSql `workerRole`), never as
// a signed-in user, and touches nothing but the outbox tables.
// ---------------------------------------------------------------------------

import postgres from "postgres";
import type { AuditEntry } from "@marktiderman/genesis-core/schema";

/** Throw this from `deliver` when retrying can't help (the receiver rejected the payload). */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentDeliveryError";
  }
}

export interface OutboxEntry {
  /** The audit entry's id: the same on every attempt, for de-duplication. */
  id: string;
  /** Delivery order across all records; entries for one record arrive in this order. */
  seq: number;
  /** 1 on the first try. */
  attempt: number;
  entry: AuditEntry;
}

export interface DeadLetter {
  id: string;
  seq: number;
  resource: string;
  recordKey: Record<string, unknown>;
  attempts: number;
  lastError: string | null;
  failedAt: string;
}

export interface OutboxWorkerOptions {
  /** The worker role's connection string, or a postgres.js pool. */
  database: string | postgres.Sql;
  /** Send one entry. Resolve on success; throw to retry; throw PermanentDeliveryError to give up. */
  deliver(entry: OutboxEntry): Promise<void>;
  /** Called when an entry moves to the dead-letter table. Wire your alerting here. */
  onDeadLetter?(letter: DeadLetter, error: unknown): void | Promise<void>;
  /**
   * Called when a polling run fails before any delivery (a refused login, a
   * missing grant, a dropped connection), so a stuck worker is seen. Only
   * `start()` reports here; `runOnce()` rejects instead.
   */
  onError?(error: unknown): void | Promise<void>;
  /** Entries claimed per run. Default 20. */
  batchSize?: number;
  /** Attempts before dead-lettering. Default 10. */
  maxAttempts?: number;
  /** First retry delay; doubles each attempt. Default 3 min (10 attempts span about a day). */
  baseDelayMs?: number;
  /** Cap on one retry delay. Default 12 h. */
  maxDelayMs?: number;
  /** Fraction of each delay randomised either way. Default 0.25. */
  jitter?: number;
  /** How often `start()` runs. Default 5 s. */
  pollIntervalMs?: number;
  /** Per-delivery time limit, after which it counts as a failed attempt. Default 30 s. */
  deliveryTimeoutMs?: number;
}

export interface RunSummary {
  delivered: number;
  retried: number;
  deadLettered: number;
}

export interface OutboxWorker {
  /** Claim and deliver one batch. */
  runOnce(): Promise<RunSummary>;
  /** Run every `pollIntervalMs` until `stop()`. */
  start(): void;
  stop(): Promise<void>;
  /** Dead-lettered entries, oldest first. */
  deadLetters(limit?: number): Promise<DeadLetter[]>;
  /** Put a dead-lettered entry back in line with its original order, attempts reset. */
  replay(id: string): Promise<boolean>;
  /**
   * Remove delivered outbox rows older than `olderThanMs` (default 7 days).
   * The audit log keeps every entry; this only clears finished deliveries.
   */
  prune(olderThanMs?: number): Promise<number>;
}

/** Delay before attempt `attempt + 1`, with jitter. */
export function backoffDelay(attempt: number, base: number, max: number, jitter: number, random = Math.random): number {
  const raw = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const spread = raw * jitter;
  return Math.max(0, Math.round(raw - spread + random() * 2 * spread));
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Delivery timed out after ${ms} ms.`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createOutboxWorker(options: OutboxWorkerOptions): OutboxWorker {
  const owned = typeof options.database === "string";
  const sql = owned ? postgres(options.database as string, { max: 2, prepare: false, onnotice: () => {} }) : (options.database as postgres.Sql);
  const batchSize = options.batchSize ?? 20;
  const maxAttempts = options.maxAttempts ?? 10;
  const base = options.baseDelayMs ?? 180_000;
  const maxDelay = options.maxDelayMs ?? 12 * 60 * 60 * 1000;
  const jitter = options.jitter ?? 0.25;
  const timeout = options.deliveryTimeoutMs ?? 30_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<unknown> | null = null;

  async function runOnce(): Promise<RunSummary> {
    const summary: RunSummary = { delivered: 0, retried: 0, deadLettered: 0 };
    await sql.begin(async (tx) => {
      // Claim due entries whose record has nothing earlier still pending or
      // dead. Rows another worker holds are skipped, not waited on.
      const claimed = await tx.unsafe(
        `select o.id::text as id, o.seq, o.resource, o.record_key, o.payload, o.attempts,
                o.last_error, o.created_at::text as created_at
           from genesis_studio.outbox o
          where o.delivered_at is null
            and o.next_attempt_at <= clock_timestamp()
            and not exists (
              select 1 from genesis_studio.outbox p
               where p.resource = o.resource and p.record_key = o.record_key
                 and p.seq < o.seq and p.delivered_at is null)
            and not exists (
              select 1 from genesis_studio.outbox_dead_letter d
               where d.resource = o.resource and d.record_key = o.record_key)
          order by o.seq
          limit $1::text::int
          for update of o skip locked`,
        [String(batchSize)],
      );
      // One record's entries go one at a time even within a batch.
      const blocked = new Set<string>();
      for (const row of claimed) {
        const recordId = `${row.resource}\u0000${JSON.stringify(row.record_key)}`;
        if (blocked.has(recordId)) continue;
        const attempt = Number(row.attempts) + 1;
        try {
          await withTimeout(
            options.deliver({ id: String(row.id), seq: Number(row.seq), attempt, entry: row.payload as AuditEntry }),
            timeout,
          );
          await tx.unsafe(
            `update genesis_studio.outbox set delivered_at = clock_timestamp(), attempts = $2::text::int, last_error = null
              where id = $1::text::uuid`,
            [String(row.id), String(attempt)],
          );
          summary.delivered++;
        } catch (error) {
          blocked.add(recordId);
          const permanent = error instanceof PermanentDeliveryError;
          if (permanent || attempt >= maxAttempts) {
            await tx.unsafe(
              `insert into genesis_studio.outbox_dead_letter
                 (id, seq, resource, record_key, payload, attempts, last_error, created_at)
               select id, seq, resource, record_key, payload, $2::text::int, $3::text, created_at
                 from genesis_studio.outbox where id = $1::text::uuid`,
              [String(row.id), String(attempt), message(error)],
            );
            await tx.unsafe(`delete from genesis_studio.outbox where id = $1::text::uuid`, [String(row.id)]);
            summary.deadLettered++;
            const letter: DeadLetter = {
              id: String(row.id),
              seq: Number(row.seq),
              resource: String(row.resource),
              recordKey: row.record_key as Record<string, unknown>,
              attempts: attempt,
              lastError: message(error),
              failedAt: new Date().toISOString(),
            };
            try {
              await options.onDeadLetter?.(letter, error);
            } catch {
              // An alerting failure must not lose the dead letter.
            }
          } else {
            const delay = backoffDelay(attempt, base, maxDelay, jitter);
            await tx.unsafe(
              `update genesis_studio.outbox
                  set attempts = $2::text::int, last_error = $3::text,
                      next_attempt_at = clock_timestamp() + ($4::text || ' milliseconds')::interval
                where id = $1::text::uuid`,
              [String(row.id), String(attempt), message(error), String(delay)],
            );
            summary.retried++;
          }
        }
      }
    });
    return summary;
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (running) return;
        running = runOnce()
          .catch(async (error: unknown) => {
            try {
              await options.onError?.(error);
            } catch {
              // A failing logger must not stop the worker.
            }
          })
          .finally(() => {
            running = null;
          });
      }, options.pollIntervalMs ?? 5_000);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
      if (owned) await sql.end({ timeout: 5 });
    },
    async deadLetters(limit = 100) {
      const rows = await sql.unsafe(
        `select id::text as id, seq, resource, record_key, attempts, last_error, failed_at::text as failed_at
           from genesis_studio.outbox_dead_letter order by seq limit $1::text::int`,
        [String(limit)],
      );
      return rows.map((r) => ({
        id: String(r.id),
        seq: Number(r.seq),
        resource: String(r.resource),
        recordKey: r.record_key as Record<string, unknown>,
        attempts: Number(r.attempts),
        lastError: (r.last_error as string | null) ?? null,
        failedAt: String(r.failed_at),
      }));
    },
    async prune(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
      const rows = await sql.unsafe(
        `delete from genesis_studio.outbox
          where delivered_at is not null
            and delivered_at < clock_timestamp() - ($1::text || ' milliseconds')::interval
          returning 1`,
        [String(olderThanMs)],
      );
      return rows.length;
    },
    async replay(id) {
      return sql.begin(async (tx) => {
        const moved = await tx.unsafe(
          `insert into genesis_studio.outbox
             (id, seq, resource, record_key, payload, attempts, next_attempt_at, last_error, created_at)
           overriding system value
           select id, seq, resource, record_key, payload, 0, clock_timestamp(), null, created_at
             from genesis_studio.outbox_dead_letter where id = $1::text::uuid
           returning id`,
          [id],
        );
        if (moved.length === 0) return false;
        await tx.unsafe(`delete from genesis_studio.outbox_dead_letter where id = $1::text::uuid`, [id]);
        return true;
      }) as Promise<boolean>;
    },
  };
}
