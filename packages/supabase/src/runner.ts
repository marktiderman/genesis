/**
 * `@marktiderman/genesis-supabase/runner`: the one outbox engine. Claim a
 * batch of due jobs, send them (grouped, so a destination that takes many at
 * once gets one request), and record what happened. No dependencies: no
 * `@supabase/supabase-js` and no Node built-ins, so a package can bundle it.
 *
 * The store is the caller's (a SQL outbox claimed with SKIP LOCKED, a
 * queue): `claim` hands over leased jobs and `record` takes back outcomes.
 * The engine owns the rest: turning each send result into an outcome with a
 * retry time, jittered backoff, the deferral cap, and never throwing for one
 * job's failure. It runs the background-job queue (`runJobs` in `/jobs`),
 * genesis-notifications' push and email channels, and genesis-forms'
 * destinations (Sheets, webhooks), each with its own claim. It knows nothing
 * about recipients: preferences, windows and caps are the notifier's.
 *
 * Outcomes:
 * - `sent`: delivered (or already there, on a redelivery: `alreadyThere`).
 * - `filtered`: the sender decided it doesn't apply; nothing sent, nothing to retry.
 * - `skipped`: deliberately not sent (`notSent`: a reason safe to store); never retried.
 * - `retry`: a retryable failure. With the service's own Retry-After it is
 *   deferred without counting an attempt (`counted: false`), until
 *   `maxDeferrals`; otherwise it backs off by attempt (`counted: true`), until
 *   `maxAttempts`.
 * - `failed`: permanent, or out of attempts. With `disable: true` the receiver
 *   asked to be switched off (a 410 Gone): stop sending to it.
 *
 * It never logs content, addresses or secrets: only what `label` gives and
 * the senders' safe error messages.
 *
 * @packageDocumentation
 */

/** One claimed job. Extend it with what your sender needs. */
export interface RunnerJob {
  /** Stable across retries (an idempotency key is made from it). */
  id: string;
  /** This attempt's number, from 1. */
  attempt: number;
  /** Deferrals so far (outcomes with `counted: false`); pass it back so `maxDeferrals` holds. Default 0. */
  deferrals?: number | undefined;
  /** An earlier attempt may have gone through (its lease ran out): senders that can look first do. */
  redelivery?: boolean | undefined;
}

/** What a sender says about one job. */
export type JobResult =
  | {
      ok: true;
      /** Deliberately sent nothing; the reason, safe to store. Recorded as `skipped`. */
      notSent?: string | undefined;
      /** It was already there (a redelivery), so nothing was sent this time. */
      alreadyThere?: boolean | undefined;
    }
  | JobFailure;

export interface JobFailure {
  ok: false;
  /** The same request may succeed later (rate limited, the service down, a timeout). */
  retryable: boolean;
  /** The service said when to come back: retry after this many seconds, without counting an attempt. */
  retryAfterSeconds?: number | undefined;
  status?: number | undefined;
  /** The receiver asked to be switched off. Always with `retryable: false`. */
  disable?: true | undefined;
  /** Safe to store and log: never secrets, content or addresses. */
  error: string;
}

export type JobOutcome =
  | { status: "sent"; alreadyThere?: boolean }
  | { status: "filtered" }
  | { status: "skipped"; reason: string }
  | {
      status: "retry";
      error: string;
      retryAt: Date;
      retryAfterSeconds: number;
      /** Whether this attempt counts toward `maxAttempts`. False when the service said when to come back. */
      counted: boolean;
      httpStatus?: number;
    }
  | { status: "failed"; error: string; httpStatus?: number; disable?: true };

export interface RunReport {
  claimed: number;
  sent: number;
  filtered: number;
  skipped: number;
  /** Retryable failures, backed off by attempt. */
  retrying: number;
  /** Retryable failures the service said when to retry; no attempt used. */
  deferred: number;
  failed: number;
  /** Recorded after the claim was lost (`record` resolved false). */
  stale: number;
  /** `record` threw. */
  unrecorded: number;
}

export interface ClaimRequest<Filter> {
  limit: number;
  filter?: Filter | undefined;
}

export interface SendContext {
  signal?: AbortSignal | undefined;
}

export interface RunnerOptions<J extends RunnerJob, Filter = undefined> {
  /** Claims up to `limit` due jobs, each leased so no other runner sends it meanwhile. */
  claim(request: ClaimRequest<Filter>): Promise<readonly J[]>;
  /**
   * Sends one group of jobs (those with the same `group` key) and resolves one
   * result per job, in order, or `"filtered"`. A throw fails the whole group
   * with a retryable error.
   */
  send(group: readonly J[], context: SendContext): Promise<readonly (JobResult | "filtered")[]>;
  /** Jobs with the same key are sent together. Default: each job alone. */
  group?: ((job: J) => string) | undefined;
  /**
   * Records an outcome. Resolve `false` when the claim was no longer held: it
   * is counted as stale. A rejection is counted as unrecorded; the lease runs
   * out and the job comes back on its own.
   */
  record(job: J, outcome: JobOutcome): Promise<void | boolean>;
  now?: (() => number) | undefined;
  /** Safe lines (ids, kinds, short reasons). Default: nothing is logged. */
  log?: ((message: string) => void) | undefined;
  /** How a job is named in a log line, capitalised ("Delivery d1 (email)"). Default `Job <id>`. */
  label?: ((job: J) => string) | undefined;
  /** How a job is named when recording it failed ("delivery d1"). Default `job <id>`. */
  recordLabel?: ((job: J) => string) | undefined;
  /** Jobs claimed per run. Default 25. */
  batchSize?: number | undefined;
  /** Groups sent (and their outcomes recorded) at once. Default: every group at once. */
  concurrency?: number | undefined;
  /** Counted attempts before a retryable failure is given up. Default 8. */
  maxAttempts?: number | undefined;
  /** Deferrals allowed before a further one counts as an attempt. Default 24. */
  maxDeferrals?: number | undefined;
  /** Seconds to wait after a counted failed attempt. Default `defaultBackoff`. */
  backoff?: ((attempt: number) => number) | undefined;
}

export interface RunOptions<Filter> {
  filter?: Filter | undefined;
  /** Overrides `batchSize` for this run. */
  limit?: number | undefined;
  /** Aborts the sends in flight. */
  signal?: AbortSignal | undefined;
}

export interface Runner<Filter = undefined> {
  /** One claim, its sends and their records. Never rejects for a job's failure; a failing `claim` rejects. */
  run(options?: RunOptions<Filter>): Promise<RunReport>;
}

export const DEFAULT_MAX_ATTEMPTS = 8;
export const DEFAULT_MAX_DEFERRALS = 24;
export const DEFAULT_BATCH_SIZE = 25;

/**
 * 5 minutes, quadrupling each attempt, at most 24 hours: 5m, 20m, 80m, 5h20m,
 * 21h20m, then 24h; about 3 days across 8 attempts. Each wait is jittered by
 * up to ±20%, so jobs that failed together don't all come back at once.
 */
export function defaultBackoff(attempt: number, random?: () => number): number {
  const nominal = Math.min(24 * 3600, 300 * 4 ** Math.max(0, attempt - 1));
  // A function only: `[1, 2].map(defaultBackoff)` passes an index here.
  const r = typeof random === "function" ? random() : Math.random();
  return Math.round(nominal * (0.8 + 0.4 * Math.min(1, Math.max(0, r))));
}

/** Turns a send result into an outcome for a job on its `attempt`. */
export function jobOutcome(
  result: JobResult,
  attempt: number,
  options: {
    now?: number | undefined;
    maxAttempts?: number | undefined;
    backoff?: ((attempt: number) => number) | undefined;
    deferrals?: number | undefined;
    maxDeferrals?: number | undefined;
  } = {},
): JobOutcome {
  if (result.ok) {
    if (result.notSent) return { status: "skipped", reason: result.notSent.slice(0, 500) };
    return result.alreadyThere ? { status: "sent", alreadyThere: true } : { status: "sent" };
  }
  const http = result.status !== undefined ? { httpStatus: result.status } : {};
  if (result.disable) return { status: "failed", error: result.error, ...http, disable: true };
  if (!result.retryable) return { status: "failed", error: result.error, ...http };
  const now = options.now ?? Date.now();
  if (result.retryAfterSeconds !== undefined && (options.deferrals ?? 0) < (options.maxDeferrals ?? DEFAULT_MAX_DEFERRALS)) {
    const seconds = Math.max(1, Math.ceil(result.retryAfterSeconds));
    return { status: "retry", error: result.error, retryAt: new Date(now + seconds * 1000), retryAfterSeconds: seconds, counted: false, ...http };
  }
  const max = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (attempt >= max) return { status: "failed", error: `${result.error} (gave up after ${attempt} attempts)`.slice(0, 500), ...http };
  const seconds = Math.max(1, Math.ceil((options.backoff ?? defaultBackoff)(attempt)));
  return { status: "retry", error: result.error, retryAt: new Date(now + seconds * 1000), retryAfterSeconds: seconds, counted: true, ...http };
}

/** A thrown error as a retryable failure with a safe message. */
export function failureOf(error: unknown): JobFailure {
  const e = error as { name?: unknown; message?: unknown; retryable?: unknown; retryAfterSeconds?: unknown; status?: unknown; disable?: unknown } | null;
  if (e && typeof e === "object" && typeof e.retryable === "boolean" && typeof e.message === "string") {
    return {
      ok: false,
      retryable: e.disable === true ? false : e.retryable,
      error: e.message.slice(0, 500),
      ...(typeof e.retryAfterSeconds === "number" ? { retryAfterSeconds: e.retryAfterSeconds } : {}),
      ...(typeof e.status === "number" ? { status: e.status } : {}),
      ...(e.disable === true ? { disable: true as const } : {}),
    };
  }
  const timeout = e && typeof e === "object" && (e.name === "TimeoutError" || e.name === "AbortError");
  return { ok: false, retryable: true, error: timeout ? "Timed out" : "Unexpected error" };
}

/**
 * The runner.
 *
 * @stability Beta
 */
export function createRunner<J extends RunnerJob, Filter = undefined>(options: RunnerOptions<J, Filter>): Runner<Filter> {
  const log = (message: string): void => {
    try {
      options.log?.(message);
    } catch {
      // A logger that throws never stops an outcome being recorded.
    }
  };
  const label = (job: J) => options.label?.(job) ?? `Job ${job.id}`;
  const recordLabel = (job: J) => options.recordLabel?.(job) ?? `job ${job.id}`;
  const now = () => options.now?.() ?? Date.now();

  return {
    async run(runOptions: RunOptions<Filter> = {}): Promise<RunReport> {
      const report: RunReport = { claimed: 0, sent: 0, filtered: 0, skipped: 0, retrying: 0, deferred: 0, failed: 0, stale: 0, unrecorded: 0 };
      const limit = runOptions.limit ?? options.batchSize ?? DEFAULT_BATCH_SIZE;
      const claimed = await options.claim({ limit, filter: runOptions.filter });
      report.claimed = claimed.length;

      const groups = new Map<string, J[]>();
      claimed.forEach((job, i) => {
        const key = options.group ? options.group(job) : `\u0000${i}`;
        const list = groups.get(key) ?? [];
        list.push(job);
        groups.set(key, list);
      });

      const runGroup = async (group: J[]): Promise<void> => {
        let results: readonly (JobResult | "filtered")[];
        try {
          results = await options.send(group, { signal: runOptions.signal });
          if (results.length !== group.length) throw new Error("send answered the wrong number of results");
        } catch (error) {
          const failure = failureOf(error);
          results = group.map(() => failure);
        }
        const at = now();
        await Promise.all(
          group.map(async (job, i) => {
            const result = results[i]!;
            const outcome: JobOutcome =
              result === "filtered"
                ? { status: "filtered" }
                : jobOutcome(result, job.attempt, {
                    now: at,
                    maxAttempts: options.maxAttempts,
                    backoff: options.backoff,
                    deferrals: job.deferrals,
                    maxDeferrals: options.maxDeferrals,
                  });
            if (outcome.status === "failed" || outcome.status === "retry") {
              log(`${label(job)} ${outcome.status === "failed" ? "failed" : "will be retried"}: ${outcome.error}`);
            } else if (outcome.status === "skipped") {
              log(`${label(job)} skipped: ${outcome.reason}`);
            }
            let recorded: void | boolean;
            try {
              recorded = await options.record(job, outcome);
            } catch {
              report.unrecorded++;
              log(`Recording ${recordLabel(job)} failed`);
              return;
            }
            if (recorded === false) report.stale++;
            else if (outcome.status === "sent") report.sent++;
            else if (outcome.status === "filtered") report.filtered++;
            else if (outcome.status === "skipped") report.skipped++;
            else if (outcome.status === "failed") report.failed++;
            else if (outcome.counted) report.retrying++;
            else report.deferred++;
          }),
        );
      };

      const queue = [...groups.values()];
      const wanted = options.concurrency ?? queue.length;
      const width = Math.max(1, Math.min(Number.isFinite(wanted) ? Math.floor(wanted) : queue.length, queue.length));
      await Promise.all(
        Array.from({ length: width }, async () => {
          for (let group = queue.shift(); group; group = queue.shift()) await runGroup(group);
        }),
      );
      return report;
    },
  };
}
