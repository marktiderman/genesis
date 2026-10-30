/** A target in memory, for tests and examples. */
import type { ObjectLock, PartReceipt, UploadTarget } from "./target";

/** @stability Experimental */
export interface MemoryTargetOptions {
  minPart?: number;
  maxPart?: number;
  /** Retention to set on each object after it verifies. */
  lock?: { mode: ObjectLock["mode"]; days: number } | undefined;
  /** The time, in ms. Default the clock. */
  now?: () => number;
}

/** A memory target, with what tests look at. */
export interface MemoryTarget extends UploadTarget {
  /** Stored objects by key. */
  readonly objects: Map<string, Uint8Array>;
  /** Retention by key, as `lock` set it. */
  readonly locks: Map<string, ObjectLock>;
  /** Every call, in order (`start k`, `part k 1`, `finish k`, `lock k`, `delete k`…). */
  readonly calls: string[];
  /** Makes the next reads of `key` return these bytes instead (a store that lost or changed a copy). */
  corrupt(key: string, bytes: Uint8Array): void;
  /** Makes every call fail until `heal()` (a store that is down). */
  fail(): void;
  heal(): void;
}

/** @stability Experimental */
export function createMemoryTarget(options: MemoryTargetOptions = {}): MemoryTarget {
  const objects = new Map<string, Uint8Array>();
  const locks = new Map<string, ObjectLock>();
  const uploads = new Map<string, { key: string; parts: Map<number, { etag: string; bytes: Uint8Array }> }>();
  const corrupted = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const now = options.now ?? Date.now;
  let down = false;
  let next = 1;
  const call = (what: string) => {
    calls.push(what);
    if (down) throw new Error(`memory target is down (${what})`);
  };
  const upload = (key: string, id: string) => {
    const u = uploads.get(id);
    if (!u || u.key !== key) throw new Error(`no upload ${id} for ${key}`);
    return u;
  };
  return {
    minPart: options.minPart ?? 1,
    maxPart: options.maxPart ?? 64 * 1024 * 1024,
    objects,
    locks,
    calls,
    corrupt: (key, bytes) => void corrupted.set(key, bytes),
    fail: () => void (down = true),
    heal: () => void (down = false),
    async start(key) {
      call(`start ${key}`);
      const id = `mpu-${next++}`;
      uploads.set(id, { key, parts: new Map() });
      return id;
    },
    async part(key, id, n, body) {
      call(`part ${key} ${n}`);
      const etag = `"${key}-${n}-${body.byteLength}-${next++}"`;
      upload(key, id).parts.set(n, { etag, bytes: body.slice() });
      return { n, etag } satisfies PartReceipt;
    },
    async finish(key, id, parts) {
      call(`finish ${key}`);
      const u = upload(key, id);
      const chunks = parts
        .slice()
        .sort((a, b) => a.n - b.n)
        .map((p) => {
          const stored = u.parts.get(p.n);
          if (!stored || stored.etag !== p.etag) throw new Error(`part ${p.n} of ${key} doesn't match`);
          return stored.bytes;
        });
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.byteLength;
      }
      objects.set(key, out);
      uploads.delete(id);
    },
    async abort(key, id) {
      call(`abort ${key}`);
      uploads.delete(id);
    },
    async read(key) {
      call(`read ${key}`);
      const bytes = corrupted.get(key) ?? objects.get(key);
      if (!bytes) return null;
      const chunk = 1 << 16;
      let at = 0;
      return new ReadableStream<Uint8Array>({
        pull(c) {
          if (at >= bytes.byteLength) return c.close();
          c.enqueue(bytes.slice(at, at + chunk));
          at += chunk;
        },
      });
    },
    async head(key) {
      call(`head ${key}`);
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength } : null;
    },
    async delete(key) {
      call(`delete ${key}`);
      if (locks.has(key)) throw new Error(`${key} is under retention`);
      objects.delete(key);
      corrupted.delete(key);
    },
    async lock(key) {
      call(`lock ${key}`);
      if (!options.lock) return undefined;
      const lock: ObjectLock = { mode: options.lock.mode, retainUntil: new Date(now() + options.lock.days * 86_400_000).toISOString() };
      locks.set(key, lock);
      return lock;
    },
  };
}
