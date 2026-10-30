/**
 * Hashing a browser file in a Web Worker, so a 50 GB file doesn't freeze the
 * page while it is checked. The default in browsers; anything that isn't a
 * blob (or a page without workers) is hashed in this thread instead.
 */
import { createNobleSha256 } from "../hash";
import { toHex } from "../protocol";
import type { HashReply } from "./hash-core";
import type { UploadSource } from "./sources";

/** What `createWorkerFileHasher` needs of a `Worker`. */
export type WorkerLike = {
  postMessage(message: unknown): void;
  onmessage: ((e: { data: HashReply }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  terminate(): void;
};

async function inThread(source: UploadSource, onBytes: (n: number) => void): Promise<string> {
  const h = createNobleSha256();
  const chunk = 4 * 1024 * 1024;
  for (let at = 0; at < source.size; at += chunk) {
    const bytes = await source.read(at, Math.min(chunk, source.size - at));
    h.update(bytes);
    onBytes(at + bytes.byteLength);
  }
  return toHex(h.digest());
}

/**
 * A `hashFile` for `createUploader` that hashes blobs in a Web Worker (one
 * worker for every file, started on first use by `createWorker`). Anything
 * that isn't a blob, or a page where the worker can't start, is hashed in
 * this thread; so is everything after the worker fails once (its jobs are
 * hashed again here).
 *
 * The browser entry (`@marktiderman/genesis-media-library/client` under the
 * `browser` condition) passes the package's own worker.
 */
export function createWorkerFileHasher(createWorker: () => WorkerLike | undefined) {
  let worker: WorkerLike | undefined | null = null;
  let broken = false;
  let next = 1;
  type Job = { source: UploadSource; resolve(v: string): void; reject(e: unknown): void; onBytes(n: number): void };
  const pending = new Map<number, Job>();
  const start = () => {
    if (broken) return undefined;
    if (worker !== null) return worker;
    try {
      worker = createWorker();
    } catch {
      worker = undefined;
    }
    if (worker) {
      worker.onmessage = (e) => {
        const job = pending.get(e.data.id);
        if (!job) return;
        if ("bytes" in e.data) job.onBytes(e.data.bytes);
        else {
          pending.delete(e.data.id);
          if ("sha256" in e.data) job.resolve(e.data.sha256);
          else job.reject(new Error(e.data.error));
        }
      };
      worker.onerror = () => {
        // The worker is gone: stop using it, and hash what it had here instead.
        broken = true;
        try {
          worker?.terminate();
        } catch {
          // Already gone.
        }
        worker = undefined;
        const jobs = [...pending.values()];
        pending.clear();
        for (const job of jobs) inThread(job.source, job.onBytes).then(job.resolve, job.reject);
      };
    }
    return worker;
  };
  return (source: UploadSource, onBytes: (n: number) => void): Promise<string> => {
    const w = source.blob ? start() : undefined;
    if (!w || !source.blob) return inThread(source, onBytes);
    const id = next++;
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { source, resolve, reject, onBytes });
      w.postMessage({ id, blob: source.blob });
    });
  };
}

/** Whether this is a browser page (a document and module workers): where hashing goes to a worker by default. */
export const isBrowserPage = () => typeof (globalThis as { document?: unknown }).document !== "undefined" && typeof (globalThis as { Worker?: unknown }).Worker === "function";
