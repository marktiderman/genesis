/**
 * The genesis-support-cleanup Edge Function's request handling, with its
 * dependencies passed in, so it is tested without Deno or a database.
 *
 *   POST {}   (from a schedule: pg_cron + pg_net, or any cron)
 *     x-genesis-support-secret: <GENESIS_SUPPORT_CLEANUP_SECRET>
 *
 * Removes, through the Storage API, the screenshots whose attachment row is
 * gone (queued in public.support_attachment_purges when a report or an account
 * is deleted) and the uploads no attachment ever named (older than a day,
 * `support_orphan_objects`). Supabase refuses direct deletes from
 * storage.objects, so this is the only way they go. A bounded batch per call.
 *
 * It also deletes context dumps older than GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS
 * (default 90, at least 1) where genesis-support's migration 0019 is applied.
 */

export interface PurgeRow {
  id: number;
  bucket: string;
  path: string;
}

/** What the function does with the service role. */
export interface CleanupStore {
  /** The oldest queued purges. */
  queued(limit: number): Promise<PurgeRow[]>;
  /** Objects in the bucket no attachment names, uploaded more than a day ago. */
  orphans(limit: number): Promise<string[]>;
  /** Storage API remove; returns the paths it removed. */
  remove(bucket: string, paths: string[]): Promise<string[]>;
  /** Forget purge rows whose object is gone. */
  forget(ids: number[]): Promise<void>;
  /**
   * Delete up to `DIAGNOSTICS_BATCH` context dumps past their retention (genesis-support
   * 0019's `support_purge_diagnostics`); returns how many went. Left out, or the
   * function missing (0019 not applied), dumps are left alone.
   */
  purgeDiagnostics?(retentionDays: number): Promise<number>;
}

export interface CleanupDeps {
  env: (name: string) => string | undefined;
  store: CleanupStore;
  log: (message: string) => void;
}

const BATCH = 100;
const BUCKET = "genesis-support";
/** Days a context dump is kept (genesis-support's DIAGNOSTICS_DEFAULTS.retentionDays). */
export const DIAGNOSTICS_RETENTION_DAYS = 90;
/** Dumps deleted per call of `support_purge_diagnostics`, and the most calls in one run. */
export const DIAGNOSTICS_BATCH = 1000;
export const DIAGNOSTICS_MAX_ROUNDS = 20;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function handle(req: Request, deps: CleanupDeps): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = deps.env("GENESIS_SUPPORT_CLEANUP_SECRET") ?? "";
  if (!secret) {
    deps.log("[genesis-support-cleanup] GENESIS_SUPPORT_CLEANUP_SECRET is not set; refusing every call");
    return json(500, { error: "not_configured" });
  }
  if (!sameSecret(req.headers.get("x-genesis-support-secret") ?? "", secret)) return json(401, { error: "unauthorized" });

  try {
    const queued = (await deps.store.queued(BATCH)).filter((row) => row.bucket === BUCKET);
    let purged = 0;
    if (queued.length) {
      const paths = queued.map((row) => row.path);
      await deps.store.remove(BUCKET, paths);
      // Storage's remove answers with what it removed; an object already gone is gone too.
      await deps.store.forget(queued.map((row) => row.id));
      purged = queued.length;
    }
    const orphans = await deps.store.orphans(BATCH);
    const removed = orphans.length ? await deps.store.remove(BUCKET, orphans) : [];
    let diagnostics = 0;
    if (deps.store.purgeDiagnostics) {
      const days = Number(deps.env("GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS") ?? DIAGNOSTICS_RETENTION_DAYS);
      const keep = Number.isFinite(days) && days >= 1 ? Math.floor(days) : DIAGNOSTICS_RETENTION_DAYS;
      // A batch at a time until a short one, so a backlog clears in one run, within a bound.
      for (let round = 0; round < DIAGNOSTICS_MAX_ROUNDS; round++) {
        const removed = await deps.store.purgeDiagnostics(keep);
        diagnostics += removed;
        if (removed < DIAGNOSTICS_BATCH) break;
      }
    }
    return json(200, { ok: true, purged, orphans: removed.length, diagnostics });
  } catch (error) {
    deps.log(`[genesis-support-cleanup] ${error instanceof Error ? error.message : String(error)}`);
    return json(500, { error: "cleanup_failed" });
  }
}
