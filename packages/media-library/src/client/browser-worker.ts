/**
 * The package's own hashing worker, next to this module in `dist/`. Only the
 * browser entry imports this file: `import.meta` isn't available to every
 * bundler (Metro, for React Native, has none), so the runtime-neutral entry
 * never touches it.
 */
export function packageHashWorker(): { postMessage(m: unknown): void; onmessage: never; onerror: never; terminate(): void } | undefined {
  const W = (globalThis as { Worker?: new (url: URL, o: { type: "module" }) => unknown }).Worker;
  if (!W) return undefined;
  return new W(new URL("./hash-worker.js", import.meta.url), { type: "module" }) as never;
}
