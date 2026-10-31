/** A target in memory, for tests and examples. It keeps versions, as a versioned bucket does. */
import type { AssembledObject, ObjectLock, PartReceipt, UploadTarget } from "./target";

/** @stability Experimental */
export interface MemoryTargetOptions {
  minPart?: number;
  maxPart?: number;
  /** Retention to set on each object after it verifies. */
  lock?: { mode: ObjectLock["mode"]; days: number } | undefined;
  tier?: UploadTarget["tier"];
  /** The time, in ms. Default the clock. */
  now?: () => number;
}

/** A memory target, with what tests look at. */
export interface MemoryTarget extends UploadTarget {
  /** The current object at each key. */
  readonly objects: Map<string, Uint8Array>;
  /** Every version, by `key#version`. */
  readonly versions: Map<string, Uint8Array>;
  /** Retention by `key#version`, as `lock` set it. */
  readonly locks: Map<string, ObjectLock>;
  /** Every call, in order (`start k`, `part k 1`, `finish k`, `lock k`, `delete k`…). */
  readonly calls: string[];
  /** Makes the next reads of `key` return these bytes instead (a store that lost or changed a copy). */
  corrupt(key: string, bytes: Uint8Array): void;
  /** Makes every call fail until `heal()` (a store that is down). */
  fail(): void;
  heal(): void;
  /** Multipart uploads started and not finished or aborted. */
  readonly openUploads: Set<string>;
}

/** A content etag (FNV-1a), the same for the same bytes, as S3's MD5 part etags are. */
function contentTag(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return `"${bytes.byteLength}-${h.toString(16)}"`;
}

async function readAll(body: ReadableStream<Uint8Array> | Uint8Array): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body.slice();
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** @stability Experimental */
export function createMemoryTarget(options: MemoryTargetOptions = {}): MemoryTarget {
  const objects = new Map<string, Uint8Array>();
  const current = new Map<string, string>();
  const versions = new Map<string, Uint8Array>();
  const locks = new Map<string, ObjectLock>();
  const uploads = new Map<string, { key: string; parts: Map<number, { etag: string; bytes: Uint8Array }> }>();
  const assemblies = new Map<string, { key: string; object: AssembledObject; parts: string }>();
  const corrupted = new Map<string, Uint8Array>();
  const openUploads = new Set<string>();
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
  const partsKey = (parts: PartReceipt[]) => parts.map((p) => `${p.n}:${p.etag}`).join(",");
  const bytesOf = (key: string, versionId?: string) =>
    corrupted.get(key) ?? (versionId ? versions.get(`${key}#${versionId}`) : objects.get(key));
  return {
    minPart: options.minPart ?? 1,
    maxPart: options.maxPart ?? 64 * 1024 * 1024,
    ...(options.tier ? { tier: options.tier } : {}),
    objects,
    versions,
    locks,
    calls,
    openUploads,
    corrupt: (key, bytes) => void corrupted.set(key, bytes),
    fail: () => void (down = true),
    heal: () => void (down = false),
    async start(key) {
      call(`start ${key}`);
      const id = `mpu-${next++}`;
      uploads.set(id, { key, parts: new Map() });
      openUploads.add(id);
      return id;
    },
    async part(key, id, n, body) {
      call(`part ${key} ${n}`);
      const bytes = await readAll(body);
      const etag = contentTag(bytes);
      upload(key, id).parts.set(n, { etag, bytes });
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
      const versionId = `v${next++}`;
      objects.set(key, out);
      versions.set(`${key}#${versionId}`, out);
      current.set(key, versionId);
      uploads.delete(id);
      openUploads.delete(id);
      const object: AssembledObject = { etag: contentTag(out), versionId };
      assemblies.set(id, { key, object, parts: partsKey(parts) });
      return object;
    },
    async assembled(key, id, parts) {
      call(`assembled ${key}`);
      const a = assemblies.get(id);
      return a && a.key === key && a.parts === partsKey(parts) ? a.object : undefined;
    },
    async abort(key, id) {
      call(`abort ${key}`);
      uploads.delete(id);
      openUploads.delete(id);
    },
    async read(key, versionId) {
      call(`read ${key}`);
      const bytes = bytesOf(key, versionId);
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
    async delete(key, versionId) {
      call(`delete ${key}`);
      const v = versionId ?? current.get(key);
      if (v && locks.has(`${key}#${v}`)) throw new Error(`${key} is under retention`);
      if (v) versions.delete(`${key}#${v}`);
      if (!versionId || current.get(key) === versionId) {
        objects.delete(key);
        current.delete(key);
      }
      corrupted.delete(key);
    },
    async lock(key, versionId) {
      call(`lock ${key}`);
      if (!options.lock) return undefined;
      const lock: ObjectLock = { mode: options.lock.mode, retainUntil: new Date(now() + options.lock.days * 86_400_000).toISOString() };
      locks.set(`${key}#${versionId ?? current.get(key)}`, lock);
      return lock;
    },
  };
}
