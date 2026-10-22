import { chrome } from "./chrome";

/**
 * An extension's settings in `chrome.storage.local`, under one key, with
 * defaults. Writes run one after another, each merging into the latest
 * saved values, so two quick changes (from two pages, say) can't overwrite
 * each other; one failed write doesn't block later ones.
 */
export interface Prefs<T extends Record<string, unknown>> {
  readonly key: string;
  readonly defaults: T;
  get(): Promise<T>;
  /** Merge `patch` into the saved settings. */
  set(patch: Partial<T>): Promise<void>;
  /** Called with the new settings whenever any page changes them. Returns an unsubscribe. */
  subscribe(listener: (prefs: T) => void): () => void;
}

export function createPrefs<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): Prefs<T> {
  let writes: Promise<void> = Promise.resolve();
  const get = async (): Promise<T> => {
    const data = await chrome().storage.local.get(key);
    return { ...defaults, ...(data[key] as Partial<T> | undefined) };
  };
  return {
    key,
    defaults,
    get,
    set(patch) {
      const run = writes.then(async () => {
        const current = await get();
        await chrome().storage.local.set({ [key]: { ...current, ...patch } });
      });
      writes = run.catch(() => undefined);
      return run;
    },
    subscribe(listener) {
      const onChanged = (
        changes: Record<string, { newValue?: unknown }>,
        area: string,
      ) => {
        if (area !== "local" || !changes[key]) return;
        listener({
          ...defaults,
          ...(changes[key]!.newValue as Partial<T> | undefined),
        });
      };
      chrome().storage.onChanged.addListener(onChanged);
      return () => chrome().storage.onChanged.removeListener(onChanged);
    },
  };
}
