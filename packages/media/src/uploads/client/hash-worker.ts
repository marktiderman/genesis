/**
 * The Web Worker that hashes a browser file off the main thread, with
 * `@noble/hashes`. `createWorkerFileHasher()` starts it; an app whose bundler
 * needs the worker named can start it itself:
 * `new Worker(new URL("@marktiderman/genesis-media/uploads/client/hash-worker", import.meta.url), { type: "module" })`.
 */
import { hashBlob, type HashRequest } from "./hash-core";

const scope = globalThis as unknown as { onmessage: ((e: { data: HashRequest }) => void) | null; postMessage(m: unknown): void };
scope.onmessage = (e) => void hashBlob(e.data, (reply) => scope.postMessage(reply));
