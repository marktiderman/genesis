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
  write(values: AppearancePreferenceValues): void | Promise<void>;
  subscribe?(onChange: (values: AppearancePreferenceValues | null) => void): () => void;
}

/** What `defineAppearancePreferences` accepts. */
export interface AppearancePreferencesDefinition {
  /** Where the person's choice is kept beyond this device. Unset: the device only. */
  store?: AppearancePreferencesStore;
  /** The device copy's storage key (`useStorage()`). Default `genesis-appearance`. */
  storageKey?: string;
  /** Values the app fixes: nobody below can change them. */
  lock?: AppearancePreferenceValues;
}

/** A defined appearance-preferences setup. */
export interface AppearancePreferences {
  readonly store?: AppearancePreferencesStore;
  readonly storageKey: string;
  readonly lock: Readonly<AppearancePreferenceValues>;
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
  if (problems.length) throw new Error(`defineAppearancePreferences: ${problems.join("; ")}`);
  return Object.freeze({
    ...(definition.store ? { store: definition.store } : {}),
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
export function AppearancePreferencesProvider({ preferences = DEVICE_ONLY, organization, theme, children }: AppearancePreferencesProviderProps) {
  const { store, storageKey, lock } = preferences;
  const [device, setDevice] = usePersistedUiState<AppearancePreferenceValues>(storageKey, NONE, FORMAT);
  const [stored, setStored] = useState<AppearancePreferenceValues | null | undefined>(undefined);
  const [ready, setReady] = useState(!store);
  const latestStore = useRef(store);
  latestStore.current = store;

  useEffect(() => {
    if (!store) return;
    let active = true;
    Promise.resolve()
      .then(() => store.read())
      .then(
        (values) => {
          if (!active) return;
          setStored(values ? toAppearancePreferenceValues(values) : null);
          setReady(true);
        },
        (error: unknown) => {
          // A store that can't be read leaves the device's copy in charge.
          if (process.env.NODE_ENV !== "production") console.warn("[genesis-core] appearance preferences: the store's read failed", error);
          if (active) setReady(true);
        },
      );
    const unsubscribe = store.subscribe?.((values) => {
      if (active) setStored(values ? toAppearancePreferenceValues(values) : null);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [store]);

  // The store's answer is the person's choice; the device's copy fills in until it comes, and
  // when there is no store.
  const person = useMemo<AppearancePreferenceValues>(() => ({ ...device, ...(stored ?? {}) }), [device, stored]);

  const save = useCallback(
    (patch: AppearancePreferenceValues) => {
      // An undefined value in the patch clears that key: the spread sets it, and the check drops it.
      const next = toAppearancePreferenceValues({ ...person, ...patch });
      setDevice(Object.keys(next).length ? next : undefined);
      if (latestStore.current) {
        setStored(next);
        void Promise.resolve()
          .then(() => latestStore.current?.write(next))
          .catch((error: unknown) => {
            if (process.env.NODE_ENV !== "production") console.warn("[genesis-core] appearance preferences: the store's write failed", error);
          });
      }
    },
    [person, setDevice],
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
