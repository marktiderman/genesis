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
    uploadPart(partNumber: number, value: Uint8Array | ReadableStream<Uint8Array>): Promise<{ partNumber: number; etag: string }>;
    complete(parts: { partNumber: number; etag: string }[]): Promise<{ etag?: string; httpEtag?: string } | unknown>;
    abort(): Promise<void>;
  };
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

const MiB = 1024 * 1024;

type FixedLengthStreamCtor = new (length: number) => TransformStream<Uint8Array, Uint8Array>;

/** @stability Experimental */
export function createR2Target(bucket: R2BucketLike, options: { tier?: UploadTarget["tier"] } = {}): UploadTarget {
  return {
    tier: options.tier ?? "working",
    // R2's limits: 5 MiB to 5 GiB a part, every part but the last the same size.
    minPart: 5 * MiB,
    maxPart: 5 * 1024 * MiB,
    async start(key, meta) {
      return (await bucket.createMultipartUpload(key, { httpMetadata: { contentType: meta.contentType } })).uploadId;
    },
    async part(key, uploadId, n, body, info) {
      // R2 needs a stream's length up front: a Worker's FixedLengthStream gives it.
      const FLS = (globalThis as { FixedLengthStream?: FixedLengthStreamCtor }).FixedLengthStream;
      const value = body instanceof ReadableStream && FLS ? body.pipeThrough(new FLS(info.size)) : body;
      const p = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(n, value);
      return { n: p.partNumber, etag: p.etag } satisfies PartReceipt;
    },
    async finish(key, uploadId, parts) {
      const o = (await bucket.resumeMultipartUpload(key, uploadId).complete(parts.map((p) => ({ partNumber: p.n, etag: p.etag })))) as { etag?: string } | undefined;
      return o?.etag ? { etag: o.etag } : {};
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
