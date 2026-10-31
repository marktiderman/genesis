import { sha256Bytes } from "../hash";
import { toHex } from "../protocol";

/**
 * A storage target: one store an upload's bytes go to. Each adapter speaks
 * its store's multipart protocol; the handler never knows which store it is.
 */

/** What a target keeps about a part it received. */
export interface PartReceipt {
  n: number;
  etag: string;
}

/** What a target says about an object it assembled: enough to address that exact object later. */
export interface AssembledObject {
  etag?: string | undefined;
  /** On a versioned bucket: the version this upload made. Read-back, lock and delete use it. */
  versionId?: string | undefined;
}

/** An object's retention, once set. */
export interface ObjectLock {
  mode: "GOVERNANCE" | "COMPLIANCE";
  /** ISO 8601. */
  retainUntil: string;
}

/** @stability Experimental */
export interface UploadTarget {
  /** The smallest part it takes (every part but the last). */
  readonly minPart: number;
  /** The largest part it takes. */
  readonly maxPart: number;
  /** The tier its copies are recorded with (ADR 0012's media value). Default `working`. */
  readonly tier?: "working" | "archive" | "cold" | undefined;
  /** Starts a multipart upload; returns the store's upload id. */
  start(key: string, meta: { contentType: string }): Promise<string>;
  /**
   * Writes part `n`. The body streams (the handler never holds a part whole);
   * `info` gives its exact size and its SHA-256 (hex), which a store that
   * checks payloads (S3's `x-amz-content-sha256`) uses to refuse bytes that
   * changed. The handler checks the digest as well, whatever the store does.
   */
  part(key: string, uploadId: string, n: number, body: ReadableStream<Uint8Array> | Uint8Array, info: { size: number; sha256: string }): Promise<PartReceipt>;
  /** Assembles the object from its parts, in order, and says which object it made. */
  finish(key: string, uploadId: string, parts: PartReceipt[]): Promise<AssembledObject | void>;
  abort(key: string, uploadId: string): Promise<void>;
  /**
   * After a `finish` whose answer was lost: the object at `key` if (and only
   * if) it is the one these parts of this upload assembled, else undefined.
   * A target that can't tell leaves it out, and the finalize fails instead.
   */
  assembled?(key: string, uploadId: string, parts: PartReceipt[]): Promise<AssembledObject | undefined>;
  /** The object's bytes (that version, when given), for the read-back check and for copying, or null. */
  read(key: string, versionId?: string): Promise<ReadableStream<Uint8Array> | null>;
  head(key: string): Promise<{ size: number } | null>;
  /** Removes an object (that version, when given) that isn't under retention: an assembly that didn't verify. */
  delete(key: string, versionId?: string): Promise<void>;
  /**
   * Sets the object's retention (that version, when given), after it
   * verified; undefined when this target locks nothing. Never called before
   * verification, so an object under retention is always one that verified.
   */
  lock?(key: string, versionId?: string): Promise<ObjectLock | undefined>;
}

/**
 * Copies `key` (that version of it) from one target to another, a part at a
 * time (one part in memory), as the multipart upload `uploadId` in `to`
 * (started by the caller, who records it so a dead run can be aborted). How
 * fan-out writes every target after the first: the client sends once.
 * Returns the object it made in `to`.
 */
export async function copyBetweenTargets(
  from: UploadTarget,
  to: UploadTarget,
  key: string,
  options: { partSize: number; uploadId: string; versionId?: string | undefined; onPart?: (() => Promise<unknown>) | undefined },
): Promise<AssembledObject | void> {
  const uploadId = options.uploadId;
  const partSize = Math.min(Math.max(options.partSize, to.minPart), to.maxPart);
  const receipts: PartReceipt[] = [];
  // Everything after the caller started `uploadId` is inside the cleanup: a missing source, or
  // one whose stream can't be read, aborts the copy's upload too.
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const source = await from.read(key, options.versionId);
    if (!source) throw new Error(`copy: ${key} is missing from the source target.`);
    reader = source.getReader();
    let buffer = new Uint8Array(partSize);
    let filled = 0;
    let n = 1;
    const flush = async () => {
      const bytes = buffer.subarray(0, filled);
      receipts.push(await to.part(key, uploadId, n, bytes, { size: filled, sha256: toHex(await sha256Bytes(bytes)) }));
      await options.onPart?.();
      n++;
      buffer = new Uint8Array(partSize);
      filled = 0;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let at = 0;
      while (at < value.byteLength) {
        const take = Math.min(partSize - filled, value.byteLength - at);
        buffer.set(value.subarray(at, at + take), filled);
        filled += take;
        at += take;
        if (filled === partSize) await flush();
      }
    }
    if (filled > 0 || receipts.length === 0) await flush();
    return await to.finish(key, uploadId, receipts);
  } catch (error) {
    // The source's body is still open (an S3 fetch, which counts against a Worker's connections): close it too.
    await reader?.cancel().catch(() => {});
    await to.abort(key, uploadId).catch(() => {});
    throw error;
  }
}
