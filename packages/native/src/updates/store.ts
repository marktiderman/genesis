/** A tiny external store for `useSyncExternalStore`: immutable state, one notify per change. */
export interface Store<T> {
  getState(): T;
  setState(next: Partial<T>): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(next) {
      const merged = { ...state, ...next };
      if ((Object.keys(merged) as (keyof T)[]).every((key) => Object.is(merged[key], state[key]))) return;
      state = merged;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Resolves after `ms`, or never when `ms` is not finite. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (Number.isFinite(ms)) setTimeout(resolve, Math.max(0, ms));
  });
}
