/**
 * A hydration gate holds writes until a persisted store has loaded from disk.
 *
 * The bug it prevents: a persisted store (zustand `persist`, say) is created
 * with defaults, something sets a value before the saved state has been read,
 * and that write lands on disk first, replacing what the user had. With the
 * gate, a write made before hydration never reaches disk (`storage()`), or
 * waits for it (`run()`).
 *
 *   const gate = createHydrationGate();
 *   persist(store, {
 *     storage: createJSONStorage(() => gate.storage(AsyncStorage)),
 *     onRehydrateStorage: () => () => gate.markHydrated(),
 *   });
 */
import type { AsyncStorageLike } from "./query";

export interface HydrationGate {
  readonly hydrated: boolean;
  /** Call once the store has read its saved state. Idempotent. */
  markHydrated(): void;
  /** Resolves once hydrated. */
  whenHydrated(): Promise<void>;
  /** Run a write now if hydrated, otherwise once hydrated. */
  run<T>(write: () => T | Promise<T>): Promise<T>;
  /**
   * The storage, with writes made before hydration dropped (reads pass
   * through, since hydration is a read). After hydration the store writes
   * its merged state on its next change, so nothing is lost but the stale
   * write. (A zustand migration's own write during hydration is dropped too;
   * the old version stays on disk and is migrated again until then.)
   */
  storage<S extends AsyncStorageLike>(storage: S): S;
}

export interface HydrationGateOptions {
  /** Told about each write `storage()` dropped (to log it in development). */
  onDroppedWrite?: (key: string) => void;
}

/** A gate that holds writes until a persisted store has hydrated. */
export function createHydrationGate({ onDroppedWrite }: HydrationGateOptions = {}): HydrationGate {
  let hydrated = false;
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  const gate: HydrationGate = {
    get hydrated() {
      return hydrated;
    },
    markHydrated() {
      if (hydrated) return;
      hydrated = true;
      open();
    },
    whenHydrated: () => opened,
    async run(write) {
      if (!hydrated) await opened;
      return write();
    },
    storage(storage) {
      return {
        ...storage,
        getItem: (key: string) => storage.getItem(key),
        setItem: async (key: string, value: string) => {
          if (!hydrated) return onDroppedWrite?.(key);
          return storage.setItem(key, value);
        },
        removeItem: async (key: string) => {
          if (!hydrated) return onDroppedWrite?.(key);
          return storage.removeItem(key);
        },
      };
    },
  };
  return gate;
}
