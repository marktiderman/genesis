"use client";
/**
 * Appearance preferences (ADR 0024): who sets a person's appearance (light, dark or system) and
 * density (compact, comfortable, spacious).
 *
 * Both are the person's. An app can lock either one; an organization can set a default for its
 * people; an app theme sets the default under that; Genesis's own default is last:
 *
 *     app lock  >  person  >  organization default  >  theme default  >  Genesis default
 *
 * `resolveAppearancePreferences` is that order as a pure function. `defineAppearancePreferences`
 * declares an app's lock, defaults and where a person's choice is kept: a store (an adapter the
 * app backs with its own server table, so the choice follows the person to every device), with
 * the device's storage (`useStorage()`) as a copy and the fallback. `AppearancePreferencesProvider`
 * serves it to the tree: genesis-ui's `AppearanceProvider` (light and dark) and `AppShell`
 * (density) read it when it is there, and work as before when it isn't.
 *
 * Brand is not here: an organization sets its brand (`WorkspaceTheme.brand`), and the app sets
 * the theme per area.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePersistedUiState } from "./hooks/use-persisted-ui-state";
import { reportError } from "./errors";
import {
  APPEARANCES,
  DENSITIES,
  isAppearance,
  isDensity,
  resolveAppearancePreferences,
  toAppearancePreferenceValues,
  type Appearance,
  type AppearancePreferenceLayers,
  type AppearancePreferenceValues,
  type Density,
  type ResolvedAppearancePreferences,
} from "./appearance-values";

/**
 * Where a person's appearance preferences are kept: an adapter an app backs with its own server
 * table (a `profiles` row, say), so the choice follows the person. `read` may be async; return
 * null when the person has chosen nothing. `subscribe` (optional) reports a change made elsewhere.
 *
 * @stability Beta
 */
export interface AppearancePreferencesStore {
  read(): AppearancePreferenceValues | null | undefined | Promise<AppearancePreferenceValues | null | undefined>;
  /**
   * Save the person's values. Writes are sent one at a time, in order, and a write that a newer
   * one replaces before it starts is skipped. `context.previous` is what the store last answered
   * or accepted (null for nothing yet), so a store can write conditionally (compare and set) and
   * refuse a write made from a stale copy by throwing: `onWriteError` hears it.
   */
  write(values: AppearancePreferenceValues, context: AppearanceWriteContext): void | Promise<void>;
  subscribe?(onChange: (values: AppearancePreferenceValues | null) => void): () => void;
}

/** What a store's `write` is told beside the values. @stability Beta */
export interface AppearanceWriteContext {
  /** The values the store last read or accepted; null when it has none yet. */
  readonly previous: AppearancePreferenceValues | null;
}

/** What `defineAppearancePreferences` accepts. */
export interface AppearancePreferencesDefinition {
  /** Where the person's choice is kept beyond this device. Unset: the device only. */
  store?: AppearancePreferencesStore;
  /** The device copy's storage key (`useStorage()`). Default `genesis-appearance`. */
  storageKey?: string;
  /** Values the app fixes: nobody below can change them. */
  lock?: AppearancePreferenceValues;
  /**
   * Hears a store write that failed (offline, refused, a conditional write that lost), with the
   * values it tried to save. The device keeps the choice for this visit; the next successful read
   * of the store (another visit, another device) wins over it. Default: the
   * error goes to `reportError`.
   */
  onWriteError?: (error: unknown, values: AppearancePreferenceValues) => void;
}

/** A defined appearance-preferences setup. */
export interface AppearancePreferences {
  readonly store?: AppearancePreferencesStore;
  readonly storageKey: string;
  readonly lock: Readonly<AppearancePreferenceValues>;
  readonly onWriteError?: (error: unknown, values: AppearancePreferenceValues) => void;
}

/**
 * Declare where a person's appearance and density are kept and what the app locks. Checks the
 * lock and returns it frozen; throws on a value that isn't an appearance or a density.
 *
 * ```ts
 * export const appearance = defineAppearancePreferences({
 *   store: {
 *     read: () => api.myPreferences(),            // { appearance: "dark", density: "compact" }
 *     write: (values) => api.saveMyPreferences(values),
 *   },
 *   lock: { density: "comfortable" },
 * });
 * ```
 *
 * @stability Beta
 */
export function defineAppearancePreferences(definition: AppearancePreferencesDefinition = {}): AppearancePreferences {
  const problems: string[] = [];
  const lock = definition.lock ?? {};
  if (lock.appearance !== undefined && !isAppearance(lock.appearance)) problems.push(`lock.appearance: one of ${APPEARANCES.join(", ")}`);
  if (lock.density !== undefined && !isDensity(lock.density)) problems.push(`lock.density: one of ${DENSITIES.join(", ")}`);
  if (definition.store && (typeof definition.store.read !== "function" || typeof definition.store.write !== "function"))
    problems.push("store: an object with read() and write()");
  if (definition.storageKey !== undefined && (typeof definition.storageKey !== "string" || !definition.storageKey.trim()))
    problems.push("storageKey: a non-empty string");
  if (definition.onWriteError !== undefined && typeof definition.onWriteError !== "function") problems.push("onWriteError: a function");
  if (problems.length) throw new Error(`defineAppearancePreferences: ${problems.join("; ")}`);
  return Object.freeze({
    ...(definition.store ? { store: definition.store } : {}),
    ...(definition.onWriteError ? { onWriteError: definition.onWriteError } : {}),
    storageKey: definition.storageKey ?? "genesis-appearance",
    lock: Object.freeze(toAppearancePreferenceValues(lock)),
  });
}

/** What `useAppearancePreferences` returns. */
export interface UseAppearancePreferencesReturn extends ResolvedAppearancePreferences {
  /** The person's own choice (the store's, else this device's), before the order is applied. */
  person: AppearancePreferenceValues;
  /** Which values the app has locked. */
  locked: { appearance: boolean; density: boolean };
  /**
   * Every layer as given, for a component with a default of its own to put in the order
   * (`AppShell` puts its `options.density` under the theme's).
   */
  layers: AppearancePreferenceLayers;
  /** False until the store's first read has answered. */
  ready: boolean;
  /** Save the person's appearance (`undefined` clears it back to the defaults). Ignored when locked. */
  setAppearance(appearance: Appearance | undefined): void;
  /** Save the person's density (`undefined` clears it). Ignored when locked. */
  setDensity(density: Density | undefined): void;
}

const AppearancePreferencesContext = createContext<UseAppearancePreferencesReturn | null>(null);

const FORMAT = {
  parse: (raw: string) => {
    try {
      return toAppearancePreferenceValues(JSON.parse(raw));
    } catch {
      return undefined;
    }
  },
};
const NONE: AppearancePreferenceValues = {};

export interface AppearancePreferencesProviderProps {
  /** From `defineAppearancePreferences`. Default: this device only, nothing locked. */
  preferences?: AppearancePreferences;
  /** The active organization's defaults (`resolveWorkspaceAppearance(workspace)`). */
  organization?: AppearancePreferenceValues | undefined;
  /** The app theme's defaults. */
  theme?: AppearancePreferenceValues | undefined;
  /** Hears a failed store write (wins over the definition's `onWriteError`). */
  onWriteError?: ((error: unknown, values: AppearancePreferenceValues) => void) | undefined;
  children: ReactNode;
}

const DEVICE_ONLY = defineAppearancePreferences();

/**
 * Serves a person's appearance and density to the tree, resolved in the written order. Reads the
 * store once on mount (and on its `subscribe`), keeps a copy on the device, and writes both when
 * the person changes a value.
 *
 * @stability Beta
 */
export function AppearancePreferencesProvider({ preferences = DEVICE_ONLY, organization, theme, onWriteError, children }: AppearancePreferencesProviderProps) {
  const { store, storageKey, lock } = preferences;
  const [device, setDevice] = usePersistedUiState<AppearancePreferenceValues>(storageKey, NONE, FORMAT);
  const [stored, setStored] = useState<AppearancePreferenceValues | null | undefined>(undefined);
  const [ready, setReady] = useState(!store);
  const latestStore = useRef(store);
  latestStore.current = store;
  // The first read settles before any write goes out: choices made while it's in flight wait here as
  // patches, then go out merged onto what the store said, with that as `previous`.
  const firstRead = useRef<"pending" | "settled">(store ? "pending" : "settled");
  const waiting = useRef<AppearancePreferenceValues | null>(null);
  // How many newer values the store has given since a read started (a write it accepted, or a
  // value its `subscribe` delivered): a read that started before one is older than it.
  const writesDone = useRef(0);
  // Which store the queue and its writes belong to: a store change drops what was waiting for the
  // old one, and an old write that completes afterwards changes nothing here.
  const generation = useRef(0);
  // What the store last answered or accepted, for a conditional write.
  const confirmed = useRef<AppearancePreferenceValues | null>(null);
  // One write at a time, in order; the newest waiting write replaces an older waiting one.
  // One write at a time per store: each store generation gets its own queue, so a store never
  // waits behind the last one's write. What waits is a patch (the person's choices), merged onto
  // the store's latest confirmed values when it goes out, so a newer value from another device
  // isn't overwritten by a stale snapshot.
  type Queue = { running: boolean; next: { patch: AppearancePreferenceValues; generation: number } | null };
  const queue = useRef<Queue>({ running: false, next: null });
  const deviceSetter = useRef(setDevice);
  deviceSetter.current = setDevice;
  const writeErrorHandler = useRef(onWriteError ?? preferences.onWriteError);
  writeErrorHandler.current = onWriteError ?? preferences.onWriteError;

  useEffect(() => {
    generation.current += 1;
    // What waited for the last store isn't this one's to write: neither a queued write nor a
    // choice held while that store's first read was out (the device keeps its copy).
    queue.current = { running: false, next: null };
    waiting.current = null;
    // What the last store confirmed isn't this one's `previous`: a conditional write to the new
    // store must start from what it says (its read), or from nothing.
    confirmed.current = null;
    if (!store) return;
    let active = true;
    firstRead.current = "pending";
    const writesAtStart = writesDone.current;
    // Choices made meanwhile go out now: merged onto what the store said, or onto this device's.
    const release = (base: AppearancePreferenceValues | null) => {
      firstRead.current = "settled";
      const patch = waiting.current;
      waiting.current = null;
      if (!patch) return;
      const merged = toAppearancePreferenceValues({ ...(base ?? {}), ...patch });
      setStored(merged);
      deviceSetter.current(Object.keys(merged).length ? merged : undefined);
      queue.current.next = { patch: merged, generation: generation.current };
      void drainRef.current();
    };
    Promise.resolve()
      .then(() => store.read())
      .then(
        (values) => {
          if (!active) return;
          const read = values ? toAppearancePreferenceValues(values) : null;
          // A read older than an accepted write or a delivered value says nothing new: drop it, and
          // put a held patch onto the newest values instead.
          const fresh = writesDone.current === writesAtStart;
          if (fresh) {
            confirmed.current = read;
            if (!waiting.current) {
              setStored(read);
              // The device keeps a copy of what the store said, for the next visit's first paint.
              if (read) deviceSetter.current(Object.keys(read).length ? read : undefined);
            }
          }
          release(fresh ? read : confirmed.current);
          setReady(true);
        },
        (error: unknown) => {
          // A store that can't be read leaves the device's copy in charge.
          reportError(error, "core:appearance-preferences");
          if (!active) return;
          release(deviceRef.current);
          setReady(true);
        },
      );
    const unsubscribe = store.subscribe?.((values) => {
      if (!active) return;
      const next = values ? toAppearancePreferenceValues(values) : null;
      confirmed.current = next;
      writesDone.current += 1;
      // The store's values are the baseline; a choice still held for the first read stays on top,
      // shown and kept on the device, until it goes out.
      const shown = waiting.current ? toAppearancePreferenceValues({ ...(next ?? {}), ...waiting.current }) : next;
      setStored(shown);
      if (shown) deviceSetter.current(Object.keys(shown).length ? shown : undefined);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [store]);

  // The store's answer is the person's choice; the device's copy fills in until it comes, and
  // when there is no store.
  const person = useMemo<AppearancePreferenceValues>(() => ({ ...device, ...(stored ?? {}) }), [device, stored]);
  const deviceRef = useRef(device);
  deviceRef.current = device;

  const drain = useCallback(async () => {
    const q = queue.current;
    if (q.running) return;
    q.running = true;
    try {
      while (q.next) {
        const { patch, generation: owner } = q.next;
        q.next = null;
        const target = latestStore.current;
        if (!target) break;
        // Queued for a store that has since been replaced: not this one's to write.
        if (owner !== generation.current) continue;
        const values = toAppearancePreferenceValues({ ...(confirmed.current ?? {}), ...patch });
        try {
          // Newer values the store's subscription delivers while this write is out win over it.
          const freshAtStart = writesDone.current;
          await target.write(values, { previous: confirmed.current });
          // The store changed while it was out: the new one's state isn't this write's.
          if (owner !== generation.current) continue;
          if (writesDone.current === freshAtStart) confirmed.current = values;
          writesDone.current += 1;
        } catch (error: unknown) {
          const handler = writeErrorHandler.current;
          if (handler) handler(error, values);
          else reportError(error, "core:appearance-preferences");
        }
      }
    } finally {
      q.running = false;
    }
  }, []);
  const drainRef = useRef(drain);
  drainRef.current = drain;

  const save = useCallback(
    (patch: AppearancePreferenceValues) => {
      // An undefined value in the patch clears that key: the spread sets it, and the check drops it.
      const next = toAppearancePreferenceValues({ ...person, ...patch });
      setDevice(Object.keys(next).length ? next : undefined);
      if (latestStore.current) {
        setStored(next);
        if (firstRead.current === "pending") {
          // Not yet: the patch waits for the store's answer, so nothing it holds is overwritten.
          waiting.current = { ...(waiting.current ?? {}), ...patch };
          return;
        }
        const q = queue.current;
        // Kept raw: an undefined value (a cleared choice) must survive to clear the key on write.
        q.next = { patch: { ...(q.next?.generation === generation.current ? q.next.patch : {}), ...patch }, generation: generation.current };
        void drain();
      }
    },
    [person, setDevice, drain],
  );

  const value = useMemo<UseAppearancePreferencesReturn>(() => {
    const layers: AppearancePreferenceLayers = { lock, person, organization, theme };
    const resolved = resolveAppearancePreferences(layers);
    const locked = { appearance: lock.appearance !== undefined, density: lock.density !== undefined };
    return {
      ...resolved,
      person,
      locked,
      layers,
      ready,
      setAppearance: (appearance) => {
        if (!locked.appearance) save({ appearance });
      },
      setDensity: (density) => {
        if (!locked.density) save({ density });
      },
    };
  }, [lock, person, organization, theme, ready, save]);

  return <AppearancePreferencesContext.Provider value={value}>{children}</AppearancePreferencesContext.Provider>;
}

/**
 * The person's appearance and density, resolved, with setters. Throws outside an
 * `AppearancePreferencesProvider`; a component that works with or without one reads
 * `useOptionalAppearancePreferences`.
 *
 * @stability Beta
 */
export function useAppearancePreferences(): UseAppearancePreferencesReturn {
  const value = useContext(AppearancePreferencesContext);
  if (!value) throw new Error("useAppearancePreferences: no AppearancePreferencesProvider above this component.");
  return value;
}

/**
 * Like `useAppearancePreferences`, but null outside a provider: for a component (a shell, a
 * theme provider) that keeps its own behaviour when an app hasn't set preferences up.
 *
 * @stability Beta
 */
export function useOptionalAppearancePreferences(): UseAppearancePreferencesReturn | null {
  return useContext(AppearancePreferencesContext);
}
