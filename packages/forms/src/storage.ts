/**
 * The key-value storage drafts and the submit outbox keep their data in. One small shape
 * that `localStorage` (web) and React Native's AsyncStorage both are already; MMKV and
 * others take a three-line wrapper:
 *
 * ```ts
 * const storage: KeyValueStorage = {
 *   getItem: (key) => mmkv.getString(key) ?? null,
 *   setItem: (key, value) => mmkv.set(key, value),
 *   removeItem: (key) => mmkv.delete(key),
 * };
 * ```
 */

export type MaybePromise<T> = T | Promise<T>;

/** Strings by key, kept across restarts. Each method may answer at once or with a promise; a throw (or a rejection) is a failure the caller reports. */
export interface KeyValueStorage {
  getItem(key: string): MaybePromise<string | null | undefined>;
  setItem(key: string, value: string): MaybePromise<void>;
  removeItem(key: string): MaybePromise<void>;
}

/** Storage that lasts as long as the page or app does: for tests, and where nothing may be kept on the device. */
export function memoryStorage(): KeyValueStorage & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

/**
 * The browser's `localStorage` (or another `Storage`, such as `sessionStorage`), looked up on
 * each call, so creating it during server rendering is safe. Where there is none (a server, a
 * locked-down private window) every call throws, and the caller reports it.
 */
export function webStorage(storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined): KeyValueStorage {
  const get = () => {
    const s = storage ? storage() : (globalThis as { localStorage?: Storage }).localStorage;
    if (!s) throw new Error("Web storage isn't available here.");
    return s;
  };
  return {
    getItem: (key) => get().getItem(key),
    setItem: (key, value) => get().setItem(key, value),
    removeItem: (key) => get().removeItem(key),
  };
}

/** Whether a value is a promise (or any thenable, as some storage libraries answer). */
export function isThenable<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
}

/** Run `next` on a value that may be a promise, staying synchronous when it isn't. */
export function andThen<T, U>(value: MaybePromise<T>, next: (value: T) => MaybePromise<U>): MaybePromise<U> {
  return isThenable(value) ? Promise.resolve(value).then(next) : next(value);
}
