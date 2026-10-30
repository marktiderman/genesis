/**
 * Hashing a browser file in a Web Worker, so a 50 GB file doesn't freeze the
 * page while it is checked. The default in browsers; anything that isn't a
 * blob (or a page without workers) is hashed in this thread instead.
 */
import { createNobleSha256 } from "../hash";
import { toHex } from "../protocol";
import type { HashReply } from "./hash-core";
import type { UploadSource } from "./sources";

type WorkerLike = {
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

/** The package's own worker, next to this module. Undefined where there are no module workers. */
function defaultWorker(): WorkerLike | undefined {
  const W = (globalThis as { Worker?: new (url: URL, o: { type: "module" }) => WorkerLike }).Worker;
  if (!W) return undefined;
  try {
    return new W(new URL("./hash-worker.js", import.meta.url), { type: "module" });
  } catch {
    return undefined;
  }
}

/**
 * A `hashFile` for `createUploader` that hashes blobs in a Web Worker (one
 * worker for every file, started on first use). `createWorker` overrides how
 * it starts; without workers it hashes in this thread.
 */
export function createWorkerFileHasher(createWorker: () => WorkerLike | undefined = defaultWorker) {
  let worker: WorkerLike | undefined | null = null;
  let next = 1;
  const pending = new Map<number, { resolve(v: string): void; reject(e: Error): void; onBytes(n: number): void }>();
  const start = () => {
    if (worker !== null) return worker;
    worker = createWorker();
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
        for (const job of pending.values()) job.reject(new Error("The hashing worker failed."));
        pending.clear();
      };
    }
    return worker;
  };
  return (source: UploadSource, onBytes: (n: number) => void): Promise<string> => {
    const w = source.blob ? start() : undefined;
    if (!w || !source.blob) return inThread(source, onBytes);
    const id = next++;
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject, onBytes });
      w.postMessage({ id, blob: source.blob });
    });
  };
}

/** Whether this is a browser page (a document and module workers): where hashing goes to a worker by default. */
export const isBrowserPage = () => typeof (globalThis as { document?: unknown }).document !== "undefined" && typeof (globalThis as { Worker?: unknown }).Worker === "function";
