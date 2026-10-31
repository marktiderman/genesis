/**
 * The small bucket interface the handlers read through, so they work with
 * any object store: an R2 binding, an S3-compatible API, Supabase Storage, or
 * memory in tests. The README shows the wrappers.
 */

/** What a store knows about one object. */
export interface MediaObjectInfo {
  /** The whole object's size in bytes, also when a range was read. */
  size: number;
  /** The stored content type. Default `application/octet-stream`. */
  contentType?: string | undefined;
  /** The HTTP ETag, quoted (`"abc"`), as the store gives it. */
  etag?: string | undefined;
  lastModified?: Date | undefined;
}

/** One object's bytes: the whole object, or the range asked for. */
export interface MediaObject extends MediaObjectInfo {
  body: ReadableStream<Uint8Array>;
}

/** A byte range: `length` bytes from `offset`. */
export interface MediaRange {
  offset: number;
  length: number;
}

/**
 * Read-only access to a bucket. `null` means there is no such object. Keys
 * come from the app's `route` (or a manifest), never straight from a URL.
 *
 * @stability Experimental
 */
export interface MediaStorage {
  head(key: string): Promise<MediaObjectInfo | null>;
  get(key: string, options?: { range?: MediaRange | undefined }): Promise<MediaObject | null>;
}

/** One object for `createMemoryStorage`. */
export interface MemoryObject {
  body: Uint8Array | string;
  contentType?: string;
  lastModified?: Date;
}

/**
 * A `MediaStorage` held in memory, for tests and examples. `reads` lists
 * every key read with `get`, in order.
 *
 * @stability Experimental
 */
export function createMemoryStorage(objects: Record<string, MemoryObject>): MediaStorage & { reads: string[] } {
  const files = new Map<string, MemoryObject & { bytes: Uint8Array; etag: string }>();
  for (const [key, object] of Object.entries(objects)) {
    const bytes = typeof object.body === "string" ? new TextEncoder().encode(object.body) : object.body;
    files.set(key, { ...object, bytes, etag: `"${key.length.toString(16)}-${bytes.byteLength.toString(16)}"` });
  }
  const info = (f: MemoryObject & { bytes: Uint8Array; etag: string }): MediaObjectInfo => ({
    size: f.bytes.byteLength,
    contentType: f.contentType,
    etag: f.etag,
    lastModified: f.lastModified,
  });
  const reads: string[] = [];
  return {
    reads,
    async head(key) {
      const f = files.get(key);
      return f ? info(f) : null;
    },
    async get(key, options) {
      const f = files.get(key);
      if (!f) return null;
      reads.push(key);
      const r = options?.range;
      const bytes = r ? f.bytes.subarray(r.offset, r.offset + r.length) : f.bytes;
      return {
        ...info(f),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice());
            controller.close();
          },
        }),
      };
    },
  };
}
