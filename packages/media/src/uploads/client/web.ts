/**
 * The client's browser entry: `@marktiderman/genesis-media/uploads/client`
 * resolves here under the `browser` condition. The same API, except that
 * `createUploader` hashes files in the package's own Web Worker by default,
 * so checking a big file doesn't freeze the page. (It is a separate entry
 * because the worker is found with `import.meta`, which Metro, for React
 * Native, doesn't have.)
 */
import { packageHashWorker } from "./browser-worker";
import { createUploader as createUploaderCore, type UploaderOptions } from "./uploader";
import { createWorkerFileHasher, isBrowserPage, type WorkerFileHasherOptions } from "./worker-hasher";

export * from "./index";

/** A `hashFile` that hashes in the package's own Web Worker (what `createUploader` here uses by default). */
export function createBrowserFileHasher(options?: WorkerFileHasherOptions) {
  return createWorkerFileHasher(packageHashWorker, options);
}

/** `createUploader`, hashing in a Web Worker by default (unless `hash` or `hashFile` is given). */
export function createUploader(options: UploaderOptions) {
  const inWorker = !options.hash && !options.hashFile && isBrowserPage();
  return createUploaderCore(inWorker ? { ...options, hashFile: createBrowserFileHasher() } : options);
}
