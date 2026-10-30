/**
 * Fan-out and the read-back check. At finalize the first target holds the
 * assembled object; every other target gets a server-side copy of it; then
 * every copy is read back and hashed, and only a copy with the declared size
 * and SHA-256 is recorded (and then, only then, locked). Big objects do this
 * in a `genesis_jobs` job (`media-library.verify`), small ones inline.
 *
 * One worker at a time: a run first takes the session's lease
 * (`claimVerify`) and renews it as it goes, so a second finalize, or a
 * redelivered job, never copies or locks twice. Everything it reads, locks or
 * deletes is the exact object this upload made (by version, where the store
 * keeps versions), never another upload's.
 */
import { sha256Stream } from "../hash";
import type { FailedTarget, UploadCopy } from "../protocol";
import { copyBetweenTargets, type AssembledObject, type UploadTarget } from "../targets/target";
import type { UploadSession, UploadSessionStore } from "./store";

/** The job kind that reads an upload's copies back. Payload `{ uploadId }`. */
export const UPLOAD_VERIFY_JOB = "media-library.verify";
/** The job kind that aborts lapsed sessions in their targets. */
export const UPLOAD_SWEEP_JOB = "media-library.sweep";

/** What verification needs: the same store and targets the handler has. */
export interface UploadVerifyOptions {
  store: UploadSessionStore;
  targets: Readonly<Record<string, UploadTarget>>;
  /** The time, in ms. Default the clock. */
  now?: (() => number) | undefined;
  /** How long one run holds the session before another may take over (renewed as it goes). Default 10 minutes. */
  leaseSeconds?: number | undefined;
  /** A `verifying` session with no live lease for this long is stuck (its job never ran): abort and the sweep may clear it. Default 1 hour. */
  staleVerifyingSeconds?: number | undefined;
}

/** What a run found: the session after it, or `busy` when another run holds the lease. */
export type VerifyRun = { session: UploadSession | null; busy: boolean };

const RENEW_EVERY_BYTES = 256 * 1024 * 1024;

/**
 * Copies, reads back and locks an upload in `verifying`, and records what it
 * found: `done`, `partial` (some targets failed; finalize again retries them)
 * or `identity_mismatch` (the assembled object isn't what was declared; it is
 * removed, and nothing was locked). A session no longer verifying is left
 * alone; one whose lease another run holds answers `busy`.
 */
export async function verifyUpload(uploadId: string, options: UploadVerifyOptions): Promise<VerifyRun> {
  const { store, targets } = options;
  const now = options.now ?? Date.now;
  const leaseMs = (options.leaseSeconds ?? 600) * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const first = await store.get(uploadId);
  if (!first || first.state !== "verifying") return { session: first, busy: false };
  if (!(await store.claimVerify(uploadId, iso(now() + leaseMs), iso(now())))) return { session: first, busy: true };
  const renew = () => store.update(uploadId, { leaseUntil: iso(now() + leaseMs) }, ["verifying"]);
  const s = (await store.get(uploadId))!;

  const primaryName = s.targets[0]!;
  const primary = targets[primaryName];
  const copies: UploadCopy[] = [...s.copies];
  const failed: FailedTarget[] = [];
  const assembled: Record<string, AssembledObject> = { ...s.assembled };
  const pendingCopies: Record<string, string> = { ...s.pendingCopies };
  const pending = s.targets.filter((t) => !copies.some((c) => c.target === t));
  const save = () => store.update(uploadId, { assembled, pendingCopies, leaseUntil: iso(now() + leaseMs) }, ["verifying"]);

  for (const [i, name] of pending.entries()) {
    const target = targets[name];
    if (!target || !primary) {
      failed.push({ target: name, code: "missing" });
      continue;
    }
    try {
      if (name !== primaryName) {
        // A copy an earlier run started and never finished (it died): abort it first.
        if (pendingCopies[name]) await target.abort(s.key, pendingCopies[name]!).catch(() => {});
        pendingCopies[name] = await target.start(s.key, { contentType: s.contentType });
        await save();
        const made = await copyBetweenTargets(primary, target, s.key, { partSize: s.partSize, uploadId: pendingCopies[name]!, versionId: assembled[primaryName]?.versionId });
        assembled[name] = made ?? {};
        delete pendingCopies[name];
        await save();
      }
      const version = assembled[name]?.versionId;
      const stream = await target.read(s.key, version);
      if (!stream) {
        failed.push({ target: name, code: "missing" });
        continue;
      }
      let since = 0;
      const renewing = stream.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          async transform(chunk, c) {
            since += chunk.byteLength;
            if (since >= RENEW_EVERY_BYTES) {
              since = 0;
              await renew();
            }
            c.enqueue(chunk);
          },
        }),
      );
      const got = await sha256Stream(renewing);
      if (got.size !== s.size || got.sha256 !== s.sha256) {
        if (name === primaryName) {
          // What the client sent isn't what it declared: no copy, nothing locked, and this
          // upload's own assembly (its own key, its own version) removed.
          await primary.delete(s.key, version).catch(() => {});
          await store.update(uploadId, { state: "identity_mismatch", copies: [], failed: [], assembled: {}, pendingCopies, leaseUntil: null }, ["verifying"]);
          return { session: await store.get(uploadId), busy: false };
        }
        // The copy came out wrong in that store: remove that copy and report it; the others stand.
        await target.delete(s.key, version).catch(() => {});
        delete assembled[name];
        failed.push({ target: name, code: "readback_mismatch" });
        continue;
      }
      const lock = target.lock ? await target.lock(s.key, version) : undefined;
      copies.push({
        target: name,
        tier: target.tier ?? "working",
        key: s.key,
        size: got.size,
        sha256: got.sha256,
        ...(lock ? { lockMode: lock.mode, lockedUntil: lock.retainUntil } : {}),
        verifiedAt: iso(now()),
      });
    } catch {
      failed.push({ target: name, code: "target_error" });
      // Without a verified first copy there is nothing to copy from: the rest wait for a retry.
      if (name === primaryName) {
        for (const rest of pending.slice(i + 1)) failed.push({ target: rest, code: "target_error" });
        break;
      }
    }
  }
  await store.update(uploadId, { state: failed.length ? "partial" : "done", copies, failed, assembled, pendingCopies, leaseUntil: null }, ["verifying"]);
  return { session: await store.get(uploadId), busy: false };
}

/** Whether a `verifying` session is stuck: no live lease, and verifying for longer than `staleVerifyingSeconds`. */
export function isStuckVerifying(s: UploadSession, options: UploadVerifyOptions): boolean {
  const now = (options.now ?? Date.now)();
  if (s.state !== "verifying") return false;
  if (s.leaseUntil && Date.parse(s.leaseUntil) > now) return false;
  return Date.parse(s.verifyingSince ?? s.createdAt) <= now - (options.staleVerifyingSeconds ?? 3600) * 1000;
}

/**
 * Removes what an abandoned session left in its targets: its open multipart
 * upload, copies under way, and the objects it assembled that never verified
 * (verified copies are media, kept under the app's retention policy).
 */
export async function discardUnverified(s: UploadSession, targets: Readonly<Record<string, UploadTarget>>): Promise<void> {
  if (s.state === "open") await targets[s.targets[0]!]?.abort(s.key, s.targetUploadId).catch(() => {});
  for (const [name, mpu] of Object.entries(s.pendingCopies ?? {})) await targets[name]?.abort(s.key, mpu).catch(() => {});
  for (const [name, object] of Object.entries(s.assembled ?? {})) {
    if (s.copies.some((c) => c.target === name)) continue;
    await targets[name]?.delete(s.key, object.versionId).catch(() => {});
  }
}

/**
 * The `media-library.verify` job's handler, for genesis-supabase's
 * `runJobs({ handlers: { [UPLOAD_VERIFY_JOB]: createUploadVerifyJob({ store, targets }) } })`.
 * When another run holds the lease it asks to run again once the lease could
 * have lapsed, so a run that died is picked up.
 *
 * @stability Experimental
 */
export function createUploadVerifyJob(options: UploadVerifyOptions): (job: { payload: { uploadId?: unknown } }) => Promise<void | { retryAfterSeconds: number }> {
  return async (job) => {
    const id = job.payload.uploadId;
    if (typeof id !== "string") throw new Error("media-library.verify: the payload needs an uploadId.");
    const run = await verifyUpload(id, options);
    if (run.busy) return { retryAfterSeconds: options.leaseSeconds ?? 600 };
  };
}

/**
 * Clears sessions nobody will finish: open ones that lapsed (no part before
 * `expiresAt`), and verifying ones that are stuck (no live lease, verifying
 * for longer than `staleVerifyingSeconds`). Each is removed only while it is
 * still in the state it was found in, after what it left in its targets is
 * discarded. Returns how many. For the `media-library.sweep` job.
 *
 * @stability Experimental
 */
export async function sweepExpiredUploads(options: UploadVerifyOptions & { limit?: number }): Promise<number> {
  const now = (options.now ?? Date.now)();
  const stale = await options.store.stale(new Date(now), options.limit ?? 100, new Date(now - (options.staleVerifyingSeconds ?? 3600) * 1000));
  let removed = 0;
  for (const s of stale) {
    // Claimed first (state unchanged since listed), then cleaned, so a session that moved on is left alone.
    const still = await options.store.get(s.id);
    if (!still || still.state !== s.state) continue;
    if (still.state === "verifying" && !isStuckVerifying(still, options)) continue;
    if (!(await options.store.remove(s.id, [s.state]))) continue;
    await discardUnverified(still, options.targets);
    removed++;
  }
  return removed;
}
