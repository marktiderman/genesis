/**
 * Assembly, fan-out and the read-back check. Finalize marks the session
 * `verifying` first; a run then assembles the parts in the first target,
 * gives every other target a server-side copy, reads every copy back and
 * hashes it, and records (and then, only then, locks) only a copy with the
 * declared size and SHA-256. Big objects do this in a `genesis_jobs` job
 * (`media.verify`), small ones inline.
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
import type { UploadSession, UploadSessionPatch, UploadSessionStore } from "./store";

/** The job kind that reads an upload's copies back. Payload `{ uploadId }`. */
export const UPLOAD_VERIFY_JOB = "media.verify";
/** The job kind that aborts lapsed sessions in their targets. */
export const UPLOAD_SWEEP_JOB = "media.sweep";

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
 * Assembles (when finalize hasn't yet), copies, reads back and locks an
 * upload in `verifying`, and records what it found: `done`, `partial` (some targets failed; finalize again retries them)
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
  const holder = randomToken();
  if (!(await store.claimVerify(uploadId, iso(now() + leaseMs), iso(now()), holder))) {
    // Removed meanwhile (an abort before any run took it) is gone, not busy.
    const again = await store.get(uploadId);
    return { session: again, busy: again !== null };
  }
  // Every write this run makes names its lease; once another run holds it, this one stops at once.
  const held = async (patch: UploadSessionPatch) => {
    if (!(await store.update(uploadId, patch, ["verifying"], holder))) throw new LeaseLostError(uploadId);
  };
  const renew = () => held({ leaseUntil: iso(now() + leaseMs) });
  const s = (await store.get(uploadId))!;

  const primaryName = s.targets[0]!;
  const primary = targets[primaryName];
  const copies: UploadCopy[] = [...s.copies];
  const failed: FailedTarget[] = [];
  const assembled: Record<string, AssembledObject> = { ...s.assembled };
  const pendingCopies: Record<string, string> = { ...s.pendingCopies };
  const pending = s.targets.filter((t) => !copies.some((c) => c.target === t));
  const save = () => held({ assembled, pendingCopies, leaseUntil: iso(now() + leaseMs) });

  // Assembled first, under this run's lease: finalize marks the session verifying before anything
  // is assembled, so an abort can never remove a session whose object is being made.
  if (primary && !Object.hasOwn(assembled, primaryName)) {
    let made: AssembledObject;
    try {
      made = await assemble(primary, s);
    } catch (error) {
      // Let the next finalize (or the job's retry) try again at once, rather than after the lease.
      await store.update(uploadId, { leaseUntil: null, leaseHolder: null }, ["verifying"], holder).catch(() => {});
      throw error;
    }
    assembled[primaryName] = made;
    try {
      await save();
    } catch (error) {
      if (!(error instanceof LeaseLostError)) throw error;
      // The lease lapsed while it assembled. If the session went meanwhile, nothing points at the
      // object any more, so it goes too; otherwise the run that holds the lease carries on.
      const after = await store.get(uploadId);
      if (!after) await primary.delete(s.key, made.versionId).catch(() => {});
      return { session: after, busy: after !== null };
    }
  }

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
        const made = await copyBetweenTargets(primary, target, s.key, { partSize: s.partSize, uploadId: pendingCopies[name]!, versionId: assembled[primaryName]?.versionId, onPart: renew });
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
          await renew();
          await primary.delete(s.key, version).catch(() => {});
          await held({ state: "identity_mismatch", copies: [], failed: [], assembled: {}, pendingCopies, leaseUntil: null, leaseHolder: null });
          return { session: await store.get(uploadId), busy: false };
        }
        // The copy came out wrong in that store: remove that copy and report it; the others stand.
        await target.delete(s.key, version).catch(() => {});
        delete assembled[name];
        failed.push({ target: name, code: "readback_mismatch" });
        continue;
      }
      // Still ours before anything is locked: a run that lost its lease never locks.
      await renew();
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
    } catch (error) {
      if (error instanceof LeaseLostError) return { session: await store.get(uploadId), busy: true };
      failed.push({ target: name, code: "target_error" });
      // Without a verified first copy there is nothing to copy from: the rest wait for a retry.
      if (name === primaryName) {
        for (const rest of pending.slice(i + 1)) failed.push({ target: rest, code: "target_error" });
        break;
      }
    }
  }
  try {
    await held({ state: failed.length ? "partial" : "done", copies, failed, assembled, pendingCopies, leaseUntil: null, leaseHolder: null });
  } catch (error) {
    if (error instanceof LeaseLostError) return { session: await store.get(uploadId), busy: true };
    throw error;
  }
  return { session: await store.get(uploadId), busy: false };
}

/** The parts the session recorded, as the target's receipts. */
const receiptsOf = (s: UploadSession) => s.parts.filter((p) => p.etag !== null).map((p) => ({ n: p.n, etag: p.etag! }));

/**
 * Assembles the first target's object from the session's parts. A finish
 * whose answer was lost goes on only when the target can tell the object at
 * this key is the one these parts of this upload made.
 */
async function assemble(primary: UploadTarget, s: UploadSession): Promise<AssembledObject> {
  const receipts = receiptsOf(s);
  try {
    return (await primary.finish(s.key, s.targetUploadId, receipts)) ?? {};
  } catch (error) {
    const ours = await primary.assembled?.(s.key, s.targetUploadId, receipts).catch(() => undefined);
    if (!ours) throw error;
    return ours;
  }
}

/** Whether a `verifying` session's object is assembled yet (finalize leaves that to the run). */
export function isAssembled(s: UploadSession): boolean {
  return Object.hasOwn(s.assembled ?? {}, s.targets[0]!);
}

/** This run's lease was taken by another (it ran too long without renewing): it stops. */
class LeaseLostError extends Error {
  constructor(id: string) {
    super(`upload ${id}: the verification lease was lost`);
    this.name = "LeaseLostError";
  }
}

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
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
 * upload (or one marked verifying and never assembled), copies under way, and
 * the objects it assembled that never verified (verified copies are media,
 * kept under the app's retention policy).
 */
export async function discardUnverified(s: UploadSession, targets: Readonly<Record<string, UploadTarget>>): Promise<void> {
  const primary = targets[s.targets[0]!];
  if (s.state === "verifying" && !isAssembled(s) && primary) {
    // Verifying but never recorded as assembled: a run may have assembled it and died before it
    // said so. That object is this upload's own (its key, its parts), so it goes.
    const lost = await primary.assembled?.(s.key, s.targetUploadId, receiptsOf(s)).catch(() => undefined);
    if (lost) await primary.delete(s.key, lost.versionId).catch(() => {});
  }
  if (s.state === "open" || (s.state === "verifying" && !isAssembled(s))) await primary?.abort(s.key, s.targetUploadId).catch(() => {});
  for (const [name, mpu] of Object.entries(s.pendingCopies ?? {})) await targets[name]?.abort(s.key, mpu).catch(() => {});
  for (const [name, object] of Object.entries(s.assembled ?? {})) {
    if (s.copies.some((c) => c.target === name)) continue;
    await targets[name]?.delete(s.key, object.versionId).catch(() => {});
  }
}

/**
 * The `media.verify` job's handler, for genesis-supabase's
 * `runJobs({ handlers: { [UPLOAD_VERIFY_JOB]: createUploadVerifyJob({ store, targets }) } })`.
 * When another run holds the lease it asks to run again once the lease could
 * have lapsed, so a run that died is picked up.
 *
 * @stability Experimental
 */
export function createUploadVerifyJob(options: UploadVerifyOptions): (job: { payload: { uploadId?: unknown } }) => Promise<void | { retryAfterSeconds: number }> {
  return async (job) => {
    const id = job.payload.uploadId;
    if (typeof id !== "string") throw new Error("media.verify: the payload needs an uploadId.");
    const run = await verifyUpload(id, options);
    if (run.busy) return { retryAfterSeconds: options.leaseSeconds ?? 600 };
  };
}

/**
 * Clears sessions nobody will finish: open ones that lapsed (no part before
 * `expiresAt`), and verifying ones that are stuck (no live lease, verifying
 * for longer than `staleVerifyingSeconds`). Each is removed only while it is
 * still in the state it was found in, after what it left in its targets is
 * discarded. Returns how many. For the `media.sweep` job.
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
    // The lease is checked in the same step as the state: a job that claimed it meanwhile keeps it.
    if (!(await options.store.remove(s.id, [s.state], new Date(now).toISOString()))) continue;
    await discardUnverified(still, options.targets);
    removed++;
  }
  return removed;
}
