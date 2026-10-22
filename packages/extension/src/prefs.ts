import { getChrome } from "./chrome";

/**
 * An extension's settings in `chrome.storage.local`, under one key, with
 * defaults. Each write reads the latest saved values and merges into them
 * under a Web Lock (`navigator.locks`) named for the key, which every page
 * and the service worker of the extension share, so two quick changes from
 * two pages can't overwrite each other. Where Web Locks are missing, writes
 * from one page still run one after another. One failed write doesn't block
 * later ones.
 *
 * A frame of the extension inside a web page may not share those locks:
 * Chrome can partition its storage by the page (checked unpartitioned with
 * host access to the page; with only activeTab it may be). Its writes still
 * merge the latest saved values, so at worst two writes at the same moment
 * from a frame and another page can lose one of them.
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
    const data = await getChrome().storage.local.get(key);
    return { ...defaults, ...(data[key] as Partial<T> | undefined) };
  };
  return {
    key,
    defaults,
    get,
    set(patch) {
      const merge = async () => {
        const current = await get();
        await getChrome().storage.local.set({
          [key]: { ...current, ...patch },
        });
      };
      const locks = (globalThis.navigator as Navigator | undefined)?.locks;
      const run: Promise<void> = writes.then(async () => {
        if (locks) await locks.request(`genesis-extension:prefs:${key}`, merge);
        else await merge();
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
      getChrome().storage.onChanged.addListener(onChanged);
      return () => getChrome().storage.onChanged.removeListener(onChanged);
    },
  };
}
