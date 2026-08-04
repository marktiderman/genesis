import type { StorageAdapter } from "./types";

/** localStorage adapter with SSR safety. */
export function createLocalStorageAdapter(): StorageAdapter {
  return {
    getItem(key) {
      if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
      try {
        return localStorage.getItem(key);
      } catch (err) {
        console.warn(`[StorageAdapter] Failed to read "${key}":`, err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    setItem(key, value) {
      if (typeof window === "undefined" || typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(key, value);
      } catch (err) {
        console.warn(`[StorageAdapter] Failed to write "${key}":`, err instanceof Error ? err.message : String(err));
      }
    },
    removeItem(key) {
      if (typeof window === "undefined" || typeof localStorage === "undefined") return;
      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.warn(`[StorageAdapter] Failed to remove "${key}":`, err instanceof Error ? err.message : String(err));
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
