/**
 * `@marktiderman/genesis-supabase/jobs`: the server half of
 * `migrations/0007_genesis_jobs.sql`. Server only (it takes the service-role
 * client and the job secret); never import it into browser or app code.
 *
 * - `enqueueJob`: queue work from server code (triggers enqueue in SQL).
 * - `runJobs`: claim due jobs, run each kind's handler, settle each one, with
 *   backoff on failure. Never throws for one job's failure.
 * - `createJobsHandler`: the app's one job route. It checks the bearer secret
 *   (a previous one too, while you rotate it) and runs the named job, which a
 *   pg_cron schedule (`genesis_schedule_job`), a platform cron or a person
 *   with the secret calls.
 *
 * ```ts
 * // src/routes/api/jobs/$job.ts (any server route that hands over a Request)
 * const handle = createJobsHandler({
 *   secret: process.env.GENESIS_JOBS_SECRET,
 *   previousSecret: process.env.GENESIS_JOBS_SECRET_PREVIOUS,
 *   jobs: {
 *     queue: () => runJobs(admin, { handlers: { "email.digest": sendDigest } }),
 *     cleanup: () => removeQueuedFiles(admin),
 *   },
 * });
 * export const POST = ({ request, params }) => handle(request, params.job);
 * ```
 *
 * @packageDocumentation
 */

/** The parts of a Supabase client these helpers use: a service-role `SupabaseClient` fits. */
export interface JobsClient {
  // Loose on purpose: a client typed by an app's Database narrows `rpc`'s
  // function names, and the app's generated types may not list these yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** A failure from the queue's own functions (not from a handler). */
export class JobsError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "JobsError";
    this.code = code;
  }
}

async function call<T>(client: JobsClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new JobsError(`${fn}: ${error.message}`, error.code);
  return data as T;
}

/** @stability Beta */
export interface EnqueueOptions {
  /** Run no earlier than this. Default now. */
  runAfter?: Date;
  /** One job per kind and key while it is queued or running: a repeat returns the queued job's id. */
  idempotencyKey?: string;
  /** Attempts before it fails for good, 1 to 100. Default 8. */
  maxAttempts?: number;
}

/**
 * Queue one job of `kind` (`"email.digest"`, lowercase) with a JSON object
 * payload. Returns the job's id. Payloads are readable by the service role:
 * put ids in them, never secrets.
 *
 * @stability Beta
 */
export function enqueueJob(client: JobsClient, kind: string, payload: Record<string, unknown> = {}, options: EnqueueOptions = {}): Promise<string> {
  return call<string>(client, "genesis_job_enqueue", {
    p_kind: kind,
    p_payload: payload,
    p_run_after: options.runAfter?.toISOString() ?? null,
    p_idempotency_key: options.idempotencyKey ?? null,
    p_max_attempts: options.maxAttempts ?? 8,
  });
}

/** One claimed job, as a handler sees it. @stability Beta */
export interface Job<Payload = Record<string, unknown>> {
  id: string;
  kind: string;
  payload: Payload;
  /** This attempt's number, from 1. */
  attempt: number;
  /** An earlier attempt's lease ran out: it may have done the work. Handlers that can look first, do. */
  redelivery: boolean;
}

/**
 * What a handler can return. Nothing (or `{ done: true }`) is done. Throwing
 * retries with backoff; throw a `PermanentJobError` (or return
 * `{ failed }`) to stop.
 *
 * @stability Beta
 */
export type JobOutcome =
  | void
  | { done: true }
  | { retryAfterSeconds: number; error?: string }
  | { failed: string };

/** Thrown by a handler for a failure that won't get better with a retry (a bad payload, a 4xx). @stability Beta */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

// Handlers are keyed by kind, so each takes its own payload type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JobHandler = (job: Job<any>) => Promise<JobOutcome> | JobOutcome;

/** @stability Beta */
export interface RunJobsOptions {
  /** Kind → handler. Only these kinds are claimed. */
  handlers: Readonly<Record<string, JobHandler>>;
  /** Jobs claimed in this run. Default 25. */
  limit?: number;
  /** How long a claim holds a job; a handler must finish inside it. Default 300. */
  leaseSeconds?: number;
  /** Jobs run at once. Default 4. */
  concurrency?: number;
  /** Seconds before retry `attempt` (from 1). Default 30 s doubling, jittered, at most an hour. */
  backoff?: (attempt: number) => number;
  /** Where one line per failed job goes (kind, id, attempt, the error's message). Default console.error. */
  log?: (line: string) => void;
}

/** @stability Beta */
export interface RunJobsReport {
  claimed: number;
  done: number;
  retried: number;
  failed: number;
  /** Settles refused because the lease ran out first (another run has the job). */
  stale: number;
}

/** 30 s, doubling per attempt, ±20% jitter, at most an hour. */
export function defaultBackoff(attempt: number): number {
  const base = Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 1000);
}

/**
 * Claim due jobs of the handled kinds, run them, and settle each: done, a
 * retry after backoff, or failed. One job's failure never stops the others,
 * and nothing about a payload is logged.
 *
 * @stability Beta
 */
export async function runJobs(client: JobsClient, options: RunJobsOptions): Promise<RunJobsReport> {
  const kinds = Object.keys(options.handlers);
  const report: RunJobsReport = { claimed: 0, done: 0, retried: 0, failed: 0, stale: 0 };
  if (kinds.length === 0) return report;
  const backoff = options.backoff ?? defaultBackoff;
  const log = options.log ?? ((line: string) => console.error(line));

  type Claimed = Job & { claim_id: string };
  const claimed =
    (await call<Claimed[] | null>(client, "genesis_jobs_claim", {
      p_kinds: kinds,
      p_limit: options.limit ?? 25,
      p_lease_seconds: options.leaseSeconds ?? 300,
    })) ?? [];
  report.claimed = claimed.length;

  const settle = async (job: Claimed, outcome: "done" | "retry" | "failed", retryAfter: number | null, error: string | null) => {
    const ok = await call<boolean>(client, "genesis_jobs_settle", {
      p_id: job.id,
      p_claim_id: job.claim_id,
      p_outcome: outcome,
      p_retry_after_seconds: retryAfter,
      p_error: error,
    });
    if (!ok) report.stale++;
    else if (outcome === "done") report.done++;
    else if (outcome === "retry") report.retried++;
    else report.failed++;
  };

  const runOne = async (job: Claimed) => {
    const handler = options.handlers[job.kind];
    const { claim_id: _claim, ...seen } = job;
    try {
      const outcome = handler ? await handler(seen) : { failed: `no handler for ${job.kind}` };
      if (outcome && "failed" in outcome) {
        log(`[jobs] ${job.kind} ${job.id} attempt ${job.attempt} failed: ${outcome.failed}`);
        await settle(job, "failed", null, outcome.failed.slice(0, 1000));
      } else if (outcome && "retryAfterSeconds" in outcome) {
        await settle(job, "retry", Math.max(0, Math.round(outcome.retryAfterSeconds)), outcome.error ?? null);
      } else {
        await settle(job, "done", null, null);
      }
    } catch (error) {
      const message = messageOf(error);
      log(`[jobs] ${job.kind} ${job.id} attempt ${job.attempt}: ${message}`);
      if (error instanceof PermanentJobError) await settle(job, "failed", null, message);
      else await settle(job, "retry", backoff(job.attempt), message);
    }
  };

  const queue = [...claimed];
  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, queue.length)) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await runOne(job);
  });
  await Promise.all(workers);
  return report;
}

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** @stability Beta */
export interface VerifyJobRequestOptions {
  /** The secret callers send as `Authorization: Bearer <secret>`. Unset refuses every request (500). */
  secret: string | undefined;
  /** The secret before a rotation, accepted too until you remove it. */
  previousSecret?: string | undefined;
}

/**
 * Checks `Authorization: Bearer <secret>` in constant time against the
 * secret and the previous one. Returns `null` when it matches, else the
 * response to send: 401, or 500 when no secret is configured.
 *
 * @stability Beta
 */
export async function verifyJobRequest(request: Request, options: VerifyJobRequestOptions): Promise<Response | null> {
  if (!options.secret) return Response.json({ error: "The job secret is not configured." }, { status: 500 });
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const given = await digest(token);
  const current = sameBytes(given, await digest(options.secret));
  const previous = options.previousSecret ? sameBytes(given, await digest(options.previousSecret)) : false;
  return current || previous ? null : Response.json({ error: "Unauthorized." }, { status: 401 });
}

/** One named job a route can run. Its return value (JSON) is the response body. @stability Beta */
export type NamedJob = (context: { request: Request; body: Record<string, unknown> }) => Promise<unknown> | unknown;

/** @stability Beta */
export interface JobsHandlerOptions extends VerifyJobRequestOptions {
  /** Job name (`"digests"`, as `genesis_schedule_job` names it) → what it runs. */
  jobs: Readonly<Record<string, NamedJob>>;
  /** Where a job's failure goes (name and the error's message). Default console.error. */
  log?: (line: string) => void;
}

const JOB_NAME = /^[a-z][a-z0-9]*([-_][a-z0-9]+)*$/;

/**
 * The app's job route: checks the secret, then runs the job named by the
 * route (`name`, e.g. a path param), the body's `job`, or the URL's last
 * segment. GET and POST (platform crons send GET). Answers 401, 404 for an
 * unknown job, 405, 200 with the job's result, or 500 with no detail.
 *
 * @stability Beta
 */
export function createJobsHandler(options: JobsHandlerOptions): (request: Request, name?: string) => Promise<Response> {
  const log = options.log ?? ((line: string) => console.error(line));
  return async (request, name) => {
    if (request.method !== "GET" && request.method !== "POST") {
      return Response.json({ error: "Use GET or POST." }, { status: 405, headers: { Allow: "GET, POST" } });
    }
    const refused = await verifyJobRequest(request, options);
    if (refused) return refused;

    const raw = request.method === "POST" ? await request.json().catch(() => null) : null;
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const job = name ?? (typeof body["job"] === "string" ? body["job"] : new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
    const run = job && JOB_NAME.test(job) && Object.hasOwn(options.jobs, job) ? options.jobs[job] : undefined;
    if (!run) return Response.json({ error: "No such job." }, { status: 404 });

    try {
      return Response.json({ job, result: (await run({ request, body })) ?? null });
    } catch (error) {
      log(`[jobs] ${job}: ${messageOf(error)}`);
      return Response.json({ job, error: "The job failed; see the server log." }, { status: 500 });
    }
  };
}
