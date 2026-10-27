/**
 * Before the app reloads itself (an over-the-air update applied now, a
 * channel switch), the JavaScript runtime is thrown away with whatever it
 * had queued. `onBeforeReload` registers work that must happen first (the
 * observability block flushes its sinks there); the updates block awaits
 * `runBeforeReload()` before `reloadAsync`. Each hook gets a share of a short
 * deadline, and a slow or failing hook never stops the reload.
 */

/** Work to finish before a reload; gets the milliseconds it has. */
export type BeforeReloadHook = (timeoutMs: number) => unknown;

// On globalThis, so the `/updates` and `/observability` entries share one list even when bundled apart.
const KEY = Symbol.for("genesis.beforeReload");
type Holder = { [KEY]?: Set<BeforeReloadHook> };

function hooks(): Set<BeforeReloadHook> {
  const holder = globalThis as Holder;
  return (holder[KEY] ??= new Set());
}

/** Run `hook` before every reload the updates block starts. Returns the unregister. @stability Beta */
export function onBeforeReload(hook: BeforeReloadHook): () => void {
  hooks().add(hook);
  return () => {
    hooks().delete(hook);
  };
}

/** The default deadline for every hook together. */
export const BEFORE_RELOAD_TIMEOUT_MS = 2000;

/**
 * Run every registered hook, in parallel, and resolve when they have all
 * settled or `timeoutMs` has passed, whichever is first. Never rejects.
 *
 * @stability Beta
 */
export async function runBeforeReload(timeoutMs: number = BEFORE_RELOAD_TIMEOUT_MS): Promise<void> {
  const list = [...hooks()];
  if (list.length === 0) return;
  const settled = Promise.allSettled(
    list.map(async (hook) => {
      await hook(timeoutMs);
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([settled, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
