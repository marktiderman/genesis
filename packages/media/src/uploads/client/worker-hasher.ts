/**
 * Hashing a browser file in a Web Worker, so a 50 GB file doesn't freeze the
 * page while it is checked. The browser entry uses it by default. Anything
 * that isn't a blob, a page where the worker can't start, and a worker that
 * fails or goes silent, are hashed in this thread instead.
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

/** A whole-file hash: `onBytes` hears progress; `signal` stops it. */
export type HashFile = (source: UploadSource, onBytes: (n: number) => void, signal?: AbortSignal) => Promise<string>;

const aborted = () => Object.assign(new Error("The hashing was cancelled."), { name: "AbortError" });

async function inThread(source: UploadSource, onBytes: (n: number) => void, signal?: AbortSignal): Promise<string> {
  const h = createNobleSha256();
  const chunk = 4 * 1024 * 1024;
  for (let at = 0; at < source.size; at += chunk) {
    if (signal?.aborted) throw aborted();
    const bytes = await source.read(at, Math.min(chunk, source.size - at));
    h.update(bytes);
    onBytes(at + bytes.byteLength);
  }
  return toHex(h.digest());
}

/** @stability Experimental */
export interface WorkerFileHasherOptions {
  /**
   * How long the worker may say nothing (no progress, no answer) before it is
   * taken for dead and the file is hashed here instead. Default 15 seconds:
   * it reports every 4 MiB.
   */
  silentMs?: number;
}

/**
 * A `hashFile` for `createUploader` that hashes blobs in a Web Worker (one
 * worker for every file, started on first use by `createWorker`). After the
 * worker fails or goes silent once, its jobs and every later one are hashed
 * in this thread. A cancelled hash terminates the worker; the files it was
 * still hashing go to a fresh worker, as does the next one.
 */
export function createWorkerFileHasher(createWorker: () => WorkerLike | undefined, options: WorkerFileHasherOptions = {}): HashFile {
  const silentMs = options.silentMs ?? 15_000;
  let worker: WorkerLike | undefined | null = null;
  let broken = false;
  let next = 1;
  type Job = { source: UploadSource; resolve(v: string): void; reject(e: unknown): void; onBytes(n: number): void; signal?: AbortSignal | undefined; timer?: ReturnType<typeof setTimeout> };
  const pending = new Map<number, Job>();

  const stop = () => {
    try {
      worker?.terminate();
    } catch {
      // Already gone.
    }
    worker = null;
  };
  /** The worker failed or went silent: stop using it, and hash what it had here instead. */
  const fail = () => {
    broken = true;
    stop();
    const jobs = [...pending.values()];
    pending.clear();
    for (const job of jobs) {
      clearTimeout(job.timer);
      inThread(job.source, job.onBytes, job.signal).then(job.resolve, job.reject);
    }
  };
  const watch = (job: Job) => {
    clearTimeout(job.timer);
    job.timer = setTimeout(fail, silentMs);
  };
  const start = () => {
    if (broken) return undefined;
    if (worker) return worker;
    try {
      worker = createWorker() ?? undefined;
    } catch {
      worker = undefined;
    }
    if (!worker) {
      broken = true;
      return undefined;
    }
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      if ("bytes" in e.data) {
        watch(job);
        job.onBytes(e.data.bytes);
        return;
      }
      clearTimeout(job.timer);
      pending.delete(e.data.id);
      if ("sha256" in e.data) job.resolve(e.data.sha256);
      else job.reject(new Error(e.data.error));
    };
    worker.onerror = fail;
    return worker;
  };

  return (source, onBytes, signal) => {
    if (signal?.aborted) return Promise.reject(aborted());
    const w = source.blob ? start() : undefined;
    if (!w || !source.blob) return inThread(source, onBytes, signal);
    const id = next++;
    return new Promise<string>((resolve, reject) => {
      const job: Job = { source, resolve, reject, onBytes, signal };
      pending.set(id, job);
      watch(job);
      signal?.addEventListener(
        "abort",
        () => {
          if (!pending.has(id)) return;
          // The worker is mid-file: end it, and give the other files to a fresh one.
          clearTimeout(job.timer);
          pending.delete(id);
          stop();
          const fresh = pending.size ? start() : undefined;
          for (const [otherId, other] of [...pending]) {
            if (other.signal?.aborted) continue; // its own abort handler rejects it
            if (fresh && other.source.blob) {
              watch(other);
              fresh.postMessage({ id: otherId, blob: other.source.blob });
              continue;
            }
            clearTimeout(other.timer);
            pending.delete(otherId);
            inThread(other.source, other.onBytes, other.signal).then(other.resolve, other.reject);
          }
          reject(aborted());
        },
        { once: true },
      );
      w.postMessage({ id, blob: source.blob });
    });
  };
}

/** Whether this is a browser page (a document and module workers): where hashing goes to a worker by default. */
export const isBrowserPage = () => typeof (globalThis as { document?: unknown }).document !== "undefined" && typeof (globalThis as { Worker?: unknown }).Worker === "function";
