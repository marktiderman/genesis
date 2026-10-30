/**
 * The package's own hashing worker, next to this module in `dist/`. Only the
 * browser entry imports this file: `import.meta` isn't available to every
 * bundler (Metro, for React Native, has none), so the runtime-neutral entry
 * never touches it.
 *
 * The call is written out literally, `new Worker(new URL("./hash-worker.js",
 * import.meta.url), { type: "module" })`, because that exact form is what
 * Vite and webpack recognise and bundle as a worker; through a variable they
 * leave it alone and the worker never loads. `hash-worker.js` is built as one
 * standalone file, with nothing to import.
 */
import type { WorkerLike } from "./worker-hasher";

// The DOM's Worker, declared here so the package needn't compile against the DOM library.
declare const Worker: new (url: URL, options: { type: "module" }) => unknown;

export function packageHashWorker(): WorkerLike | undefined {
  if (typeof Worker === "undefined") return undefined;
  return new Worker(new URL("./hash-worker.js", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}
