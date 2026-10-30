/**
 * Fan-out and the read-back check. At finalize the first target holds the
 * assembled object; every other target gets a server-side copy of it; then
 * every copy is read back and hashed, and only a copy with the declared size
 * and SHA-256 is recorded (and then, only then, locked). Big objects do this
 * in a `genesis_jobs` job (`media-library.verify`), small ones inline.
 */
import { sha256Stream } from "../hash";
import type { FailedTarget, UploadCopy } from "../protocol";
import { copyBetweenTargets, type UploadTarget } from "../targets/target";
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
}

/**
 * Copies, reads back and locks an upload in `verifying`, and records what it
 * found: `done`, `partial` (some targets failed; finalize again retries them)
 * or `identity_mismatch` (the assembled object isn't what was declared; it is
 * removed, and nothing was locked). Safe to run twice: a session no longer
 * verifying is left alone.
 */
export async function verifyUpload(uploadId: string, options: UploadVerifyOptions): Promise<UploadSession | null> {
  const { store, targets } = options;
  const now = options.now ?? Date.now;
  const s = await store.get(uploadId);
  if (!s || s.state !== "verifying") return s;
  const primaryName = s.targets[0]!;
  const primary = targets[primaryName];
  const copies: UploadCopy[] = [...s.copies];
  const failed: FailedTarget[] = [];
  const pending = s.targets.filter((t) => !copies.some((c) => c.target === t));

  for (const [i, name] of pending.entries()) {
    const target = targets[name];
    if (!target || !primary) {
      failed.push({ target: name, code: "missing" });
      continue;
    }
    try {
      if (name !== primaryName) await copyBetweenTargets(primary, target, s.key, { contentType: s.contentType, partSize: s.partSize });
      const stream = await target.read(s.key);
      if (!stream) {
        failed.push({ target: name, code: "missing" });
        continue;
      }
      const got = await sha256Stream(stream);
      if (got.size !== s.size || got.sha256 !== s.sha256) {
        if (name === primaryName) {
          // What the client sent isn't what it declared: no copy, nothing locked, the assembly removed.
          await primary.delete(s.key).catch(() => {});
          await store.update(uploadId, { state: "identity_mismatch", copies: [], failed: [] }, ["verifying"]);
          return store.get(uploadId);
        }
        // The copy came out wrong in that store: remove it and report it, the others stand.
        await target.delete(s.key).catch(() => {});
        failed.push({ target: name, code: "readback_mismatch" });
        continue;
      }
      const lock = target.lock ? await target.lock(s.key) : undefined;
      copies.push({
        target: name,
        key: s.key,
        size: got.size,
        sha256: got.sha256,
        ...(lock ? { lockMode: lock.mode, lockedUntil: lock.retainUntil } : {}),
        verifiedAt: new Date(now()).toISOString(),
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
  await store.update(uploadId, { state: failed.length ? "partial" : "done", copies, failed }, ["verifying"]);
  return store.get(uploadId);
}

/**
 * The `media-library.verify` job's handler, for genesis-supabase's
 * `runJobs({ handlers: { [UPLOAD_VERIFY_JOB]: createUploadVerifyJob({ store, targets }) } })`.
 *
 * @stability Experimental
 */
export function createUploadVerifyJob(options: UploadVerifyOptions): (job: { payload: { uploadId?: unknown } }) => Promise<void> {
  return async (job) => {
    const id = job.payload.uploadId;
    if (typeof id !== "string") throw new Error("media-library.verify: the payload needs an uploadId.");
    await verifyUpload(id, options);
  };
}

/**
 * Aborts open sessions that lapsed (no part before `expiresAt`) in their
 * first target and forgets them. Returns how many. For the
 * `media-library.sweep` job, on a schedule.
 *
 * @stability Experimental
 */
export async function sweepExpiredUploads(options: UploadVerifyOptions & { limit?: number }): Promise<number> {
  const now = options.now ?? Date.now;
  const lapsed = await options.store.expired(new Date(now()), options.limit ?? 100);
  for (const s of lapsed) {
    await options.targets[s.targets[0]!]?.abort(s.key, s.targetUploadId).catch(() => {});
    await options.store.remove(s.id);
  }
  return lapsed.length;
}
