import type { StorageAdapter } from "./types";

/** localStorage adapter with SSR safety. */
export function createLocalStorageAdapter(): StorageAdapter {
  // Once per key and operation: a browser that blocks storage fails every read, and a hook reads
  // on every render.
  const warned = new Set<string>();
  const warn = (doing: string, key: string, err: unknown) => {
    if (warned.has(`${doing}:${key}`)) return;
    warned.add(`${doing}:${key}`);
    console.warn(`[StorageAdapter] Failed to ${doing} "${key}":`, err instanceof Error ? err.message : String(err));
  };
  return {
    getItem(key) {
      if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
      try {
        return localStorage.getItem(key);
      } catch (err) {
        warn("read", key, err);
        return null;
      }
    },
    setItem(key, value) {
      if (typeof window === "undefined" || typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(key, value);
      } catch (err) {
        warn("write", key, err);
      }
    },
    removeItem(key) {
      if (typeof window === "undefined" || typeof localStorage === "undefined") return;
      try {
        localStorage.removeItem(key);
      } catch (err) {
        warn("remove", key, err);
      }
    },
  };
}

/** In-memory adapter for testing and SSR. */
export function createMemoryStorageAdapter(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

/** No-op adapter — all operations silently do nothing. */
export function createNoopStorageAdapter(): StorageAdapter {
  return {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  };
}
