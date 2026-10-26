/**
 * `@marktiderman/genesis-supabase/jobs`: the server half of
 * `migrations/0007_genesis_jobs.sql`. Server only (it takes the service-role
 * client and the job secret); never import it into browser or app code.
 *
 * - `enqueueJob`: queue work from server code (triggers enqueue in SQL).
 * - `runJobs`: claim due jobs, run each kind's handler, settle each one, with
 *   backoff on failure. Never throws for one job's failure.
 * - `createJobsHandler`: the app's one job route. It checks the request is
 *   signed for the job (`genesis_schedule_job` signs; the secret never
 *   travels) or carries the bearer secret (a platform cron, a person), with a
 *   previous secret accepted while you rotate it, and runs the named job.
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
  /** Settles that failed (the database unreachable): those jobs come back when their lease runs out. */
  unsettled: number;
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
 * retry after backoff, or failed. One job's failure, or a failure to record
 * it, never stops the others; only a failed claim throws. Nothing about a
 * payload is logged.
 *
 * @stability Beta
 */
export async function runJobs(client: JobsClient, options: RunJobsOptions): Promise<RunJobsReport> {
  const kinds = Object.keys(options.handlers);
  const report: RunJobsReport = { claimed: 0, done: 0, retried: 0, failed: 0, stale: 0, unsettled: 0 };
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

  type Settle = ["done" | "retry" | "failed", number | null, string | null];

  // What the handler says, as a settle. Only the handler runs inside this try.
  const outcomeOf = async (job: Claimed): Promise<Settle> => {
    const handler = options.handlers[job.kind];
    const { claim_id: _claim, ...seen } = job;
    try {
      const outcome = handler ? await handler(seen) : { failed: `no handler for ${job.kind}` };
      if (outcome && "failed" in outcome) {
        log(`[jobs] ${job.kind} ${job.id} attempt ${job.attempt} failed: ${outcome.failed}`);
        return ["failed", null, outcome.failed.slice(0, 1000)];
      }
      if (outcome && "retryAfterSeconds" in outcome) return ["retry", Math.max(0, Math.round(outcome.retryAfterSeconds)), outcome.error ?? null];
      return ["done", null, null];
    } catch (error) {
      const message = messageOf(error);
      log(`[jobs] ${job.kind} ${job.id} attempt ${job.attempt}: ${message}`);
      return error instanceof PermanentJobError ? ["failed", null, message] : ["retry", backoff(job.attempt), message];
    }
  };

  const runOne = async (job: Claimed) => {
    const [outcome, retryAfter, error] = await outcomeOf(job);
    try {
      await settle(job, outcome, retryAfter, error);
    } catch (failure) {
      // The queue didn't take the outcome: the lease runs out and the job comes back as a
      // redelivery. The other jobs in this run carry on.
      report.unsettled++;
      log(`[jobs] ${job.kind} ${job.id}: could not record ${outcome}: ${messageOf(failure)}`);
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
  /** The job secret. Unset refuses every request (500). */
  secret: string | undefined;
  /** The secret before a rotation, accepted too. Remove it once every caller has the new one. */
  previousSecret?: string | undefined;
  /** How far a signed request's time may be from now, in seconds. Default 300. */
  maxSkewSeconds?: number;
  /** Now, in seconds (for tests). */
  now?: () => number;
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/**
 * The `Authorization` value a scheduler sends for `job`: `GenesisJob
 * t=<unix seconds>,sig=<hex HMAC-SHA256 of "<t>.<job>">`. What
 * `genesis_schedule_job` sends; for calling a job route from your own code.
 *
 * @stability Beta
 */
export async function signJobRequest(secret: string, job: string, now: number = Math.floor(Date.now() / 1000)): Promise<string> {
  return `GenesisJob t=${now},sig=${await hmacHex(secret, `${now}.${job}`)}`;
}

/**
 * Checks a request's `Authorization` in constant time against the secret and
 * the previous one. Two forms: `GenesisJob t=…,sig=…`, signed for `job` within
 * `maxSkewSeconds` (what schedules send: the secret never travels), or
 * `Bearer <secret>` (a platform cron, a person). The scheme's case and extra
 * spaces don't matter. Returns `null` when it passes, else the response to
 * send: 401, or 500 when no secret is configured.
 *
 * @stability Beta
 */
export async function verifyJobRequest(request: Request, options: VerifyJobRequestOptions, job?: string): Promise<Response | null> {
  if (!options.secret) return Response.json({ error: "The job secret is not configured." }, { status: 500 });
  const secrets = [options.secret, ...(options.previousSecret ? [options.previousSecret] : [])];
  const header = (request.headers.get("authorization") ?? "").trim();
  const unauthorized = () => Response.json({ error: "Unauthorized." }, { status: 401 });

  const bearer = /^bearer\s+([^\s,]+)$/i.exec(header)?.[1];
  if (bearer) {
    const given = await digest(bearer);
    let ok = false;
    for (const secret of secrets) ok = sameBytes(given, await digest(secret)) || ok;
    return ok ? null : unauthorized();
  }

  const signed = /^genesisjob\s+t=(\d{1,12})\s*,\s*sig=([0-9a-f]{64})$/i.exec(header);
  if (signed && job) {
    const t = Number(signed[1]);
    const now = options.now?.() ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - t) > (options.maxSkewSeconds ?? 300)) return unauthorized();
    const given = await digest(signed[2]!.toLowerCase());
    let ok = false;
    for (const secret of secrets) ok = sameBytes(given, await digest(await hmacHex(secret, `${t}.${job}`))) || ok;
    return ok ? null : unauthorized();
  }
  return unauthorized();
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
 * The app's job route: checks the request is signed for (or carries the
 * secret of) the job named by the route (`name`, e.g. a path param), the
 * body's `job`, or the URL's last segment, then runs it. GET and POST (platform crons send GET). Answers 401, 404 for an
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
    const raw = request.method === "POST" ? await request.clone().json().catch(() => null) : null;
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const job = name ?? (typeof body["job"] === "string" ? body["job"] : new URL(request.url).pathname.split("/").filter(Boolean).at(-1));

    // The signature is for one job name, so check it against the name the route will run.
    const refused = await verifyJobRequest(request, options, job);
    if (refused) return refused;

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
