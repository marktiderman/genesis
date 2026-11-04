"use client";
/**
 * usePersistedUiState: a piece of UI state that outlives the page (a collapsed sidebar, a table's
 * column widths, a dock's size), kept in the app's storage adapter (`useStorage()`: localStorage
 * on the web, MMKV or AsyncStorage on a phone).
 *
 * - SSR-safe: the server renders `initial`, and the client hydrates against it before reading
 *   storage (useSyncExternalStore), so there's no hydration mismatch. A client-only render reads
 *   storage directly, with no flash.
 * - In step: every hook on the same key, in this tab or another, sees a write.
 * - Never writes `initial`: a default stays a default, so changing it later reaches everyone who
 *   hasn't chosen. `set(undefined)` clears the stored value back to the default.
 * - Forgiving: a stored value `parse` refuses falls back to `initial`, and a write storage won't
 *   keep (quota, private mode, a no-op adapter) still applies for this hook's lifetime. Only for
 *   this hook: with nothing stored, another hook on the key can't see it, so the two can disagree
 *   until storage works again.
 * - Optional: a `null` key is plain state that isn't stored, for a component whose persistence
 *   the caller turns on with a key prop.
 *
 * @stability Beta
 */
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStorage } from "../provider/context";

export interface PersistedUiStateOptions<T> {
  /**
   * Turns the stored string into a value; return `undefined` for one you don't accept, and the
   * hook falls back to `initial`. Default: `JSON.parse`, any value.
   */
  parse?: (raw: string) => T | undefined;
  /** Turns a value into the string stored. Default: `JSON.stringify`. */
  serialize?: (value: T) => string;
}

/** Same-tab subscribers by key: one hook's write reaches every other hook on that key. */
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

const jsonParse = <T,>(raw: string): T | undefined => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

/** The server has nothing stored: it renders, and the client hydrates against, `initial`. */
const serverSnapshot = (): null => null;

export function usePersistedUiState<T>(
  key: string | null,
  initial: T,
  options: PersistedUiStateOptions<T> = {},
): [T, (next: T | undefined | ((current: T) => T | undefined)) => void] {
  const storage = useStorage();
  const { parse = jsonParse as (raw: string) => T | undefined, serialize = JSON.stringify as (value: T) => string } = options;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (key === null) return () => undefined;
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(onChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) onChange();
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        set.delete(onChange);
        if (set.size === 0) listeners.delete(key);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => {
    if (key === null) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }, [storage, key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  // The parsed value changes only when the stored string does, so a consumer's effects on it
  // don't run on every render.
  const stored = useMemo(() => (raw === null ? undefined : parse(raw)), [raw, parse]);

  // A write storage didn't keep, held for this hook's lifetime and only for the key it was made
  // under: a new key reads its own stored value. `value: undefined` is "cleared".
  const [unsavedState, setUnsavedState] = useState<{ key: string | null; value: T | undefined } | undefined>(undefined);
  const unsaved = unsavedState && unsavedState.key === key ? unsavedState : undefined;
  const value = unsaved === undefined ? (stored === undefined ? initial : stored) : unsaved.value === undefined ? initial : unsaved.value;
  // The latest value, for a function update: two updates in one tick (before a re-render) each
  // build on the one before, as useState's do.
  const latest = useRef(value);
  latest.current = value;

  const set = useCallback(
    (next: T | undefined | ((current: T) => T | undefined)) => {
      const resolved = typeof next === "function" ? (next as (current: T) => T | undefined)(latest.current) : next;
      latest.current = resolved === undefined ? initial : resolved;
      let kept = false;
      if (key === null) {
        setUnsavedState({ key, value: resolved });
        return;
      }
      try {
        if (resolved === undefined) {
          storage.removeItem(key);
          kept = storage.getItem(key) === null;
        } else {
          const text = serialize(resolved);
          storage.setItem(key, text);
          kept = storage.getItem(key) === text;
        }
      } catch {
        kept = false;
      }
      setUnsavedState(kept ? undefined : { key, value: resolved });
      notify(key);
    },
    // `initial` only matters when a write clears the value; read through a ref, it would be
    // stale after a re-render with a new default, so it's a dependency like the rest.
    [storage, key, serialize, initial],
  );

  return [value, set];
}
