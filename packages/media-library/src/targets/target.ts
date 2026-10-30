/**
 * A storage target: one store an upload's bytes go to. Each adapter speaks
 * its store's multipart protocol; the handler never knows which store it is.
 */

/** What a target keeps about a part it received. */
export interface PartReceipt {
  n: number;
  etag: string;
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
  /** Starts a multipart upload; returns the store's upload id. */
  start(key: string, meta: { contentType: string }): Promise<string>;
  part(key: string, uploadId: string, n: number, body: Uint8Array): Promise<PartReceipt>;
  /** Assembles the object from its parts, in order. */
  finish(key: string, uploadId: string, parts: PartReceipt[]): Promise<void>;
  abort(key: string, uploadId: string): Promise<void>;
  /** The object's bytes, for the read-back check and for copying, or null. */
  read(key: string): Promise<ReadableStream<Uint8Array> | null>;
  head(key: string): Promise<{ size: number } | null>;
  /** Removes an object that isn't under retention (an assembly that didn't verify). */
  delete(key: string): Promise<void>;
  /**
   * Sets the object's retention, after it verified; undefined when this
   * target locks nothing. Never called before verification, so an object
   * under retention is always one that verified.
   */
  lock?(key: string): Promise<ObjectLock | undefined>;
}

/**
 * Copies `key` from one target to another, a part at a time (one part in
 * memory), as a multipart upload in `to`. How fan-out writes every target
 * after the first: the client sends once.
 */
export async function copyBetweenTargets(
  from: UploadTarget,
  to: UploadTarget,
  key: string,
  options: { contentType: string; partSize: number },
): Promise<void> {
  const source = await from.read(key);
  if (!source) throw new Error(`copy: ${key} is missing from the source target.`);
  const partSize = Math.min(Math.max(options.partSize, to.minPart), to.maxPart);
  const uploadId = await to.start(key, { contentType: options.contentType });
  const receipts: PartReceipt[] = [];
  try {
    const reader = source.getReader();
    let buffer = new Uint8Array(partSize);
    let filled = 0;
    let n = 1;
    const flush = async () => {
      receipts.push(await to.part(key, uploadId, n, buffer.subarray(0, filled)));
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
    await to.finish(key, uploadId, receipts);
  } catch (error) {
    await to.abort(key, uploadId).catch(() => {});
    throw error;
  }
}
