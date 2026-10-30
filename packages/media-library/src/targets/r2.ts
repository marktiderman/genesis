/**
 * An R2 bucket through its Worker binding (`env.BUCKET`). R2 has no
 * per-object retention, so this target locks nothing; use an S3-compatible
 * target with Object Lock for copies that must not be deleted.
 */
import type { PartReceipt, UploadTarget } from "./target";

/** The parts of an R2 binding this target uses (Cloudflare's `R2Bucket` fits). */
export interface R2BucketLike {
  createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<{ uploadId: string }>;
  resumeMultipartUpload(
    key: string,
    uploadId: string,
  ): {
    uploadPart(partNumber: number, value: Uint8Array): Promise<{ partNumber: number; etag: string }>;
    complete(parts: { partNumber: number; etag: string }[]): Promise<unknown>;
    abort(): Promise<void>;
  };
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

const MiB = 1024 * 1024;

/** @stability Experimental */
export function createR2Target(bucket: R2BucketLike): UploadTarget {
  return {
    // R2's limits: 5 MiB to 5 GiB a part, every part but the last the same size.
    minPart: 5 * MiB,
    maxPart: 5 * 1024 * MiB,
    async start(key, meta) {
      return (await bucket.createMultipartUpload(key, { httpMetadata: { contentType: meta.contentType } })).uploadId;
    },
    async part(key, uploadId, n, body) {
      const p = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(n, body);
      return { n: p.partNumber, etag: p.etag } satisfies PartReceipt;
    },
    async finish(key, uploadId, parts) {
      await bucket.resumeMultipartUpload(key, uploadId).complete(parts.map((p) => ({ partNumber: p.n, etag: p.etag })));
    },
    async abort(key, uploadId) {
      await bucket.resumeMultipartUpload(key, uploadId).abort();
    },
    async read(key) {
      return (await bucket.get(key))?.body ?? null;
    },
    async head(key) {
      const o = await bucket.head(key);
      return o ? { size: o.size } : null;
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}
