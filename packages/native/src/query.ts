/**
 * Query: a TanStack Query client with offline-safe defaults, and the contract
 * for saving it to the phone. The persister itself is in
 * `@marktiderman/genesis-native/persist`, so an app that saves nothing doesn't
 * install TanStack's persister packages.
 */
import { QueryClient, focusManager, onlineManager, type QueryClientConfig } from "@tanstack/react-query";

/** The part of AsyncStorage (or any async key-value store) Genesis uses. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** One day in milliseconds: the default max age of the saved query cache. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A QueryClient for a phone. `networkMode: "offlineFirst"` runs a query or
 * mutation once whatever the network says, then pauses its retries while the
 * device is offline (`onlineManager`, which `connectQueryLifecycle` feeds from
 * NetInfo), continues them when it is back, and refetches stale queries on
 * reconnect. So offline, a query with saved data keeps showing it
 * (`fetchStatus: "paused"`); one with nothing saved stays `pending` and paused
 * until the network returns (check `isPaused`, not only `isPending`, before
 * showing a spinner); and a mutation, which TanStack doesn't retry by default,
 * fails at once instead of waiting. `gcTime` matches the persisted max age, or
 * restored queries would be collected before they are used. Your `config` wins.
 */
export function createNativeQueryClient(config: QueryClientConfig = {}): QueryClient {
  const { queries, mutations, ...rest } = config.defaultOptions ?? {};
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...rest,
      queries: { networkMode: "offlineFirst", gcTime: DAY_MS, staleTime: 60_000, ...queries },
      mutations: { networkMode: "offlineFirst", ...mutations },
    },
  });
}

/**
 * The saved query cache. A `scope` (the signed-in user's id, `""` for nobody)
 * is part of what is saved: a cache saved for one user is discarded, on disk
 * too, when another scope restores it.
 */
export interface QueryPersistence {
  /** Load the saved cache into the client, if it was saved for `scope`. */
  restore(scope: string): Promise<void>;
  /** Save on every cache change, for `scope`; returns the unsubscribe. */
  subscribe(scope: string): () => void;
  /**
   * Delete the saved cache. Clear the QueryClient first: the subscription
   * then saves the empty cache, so a save already in flight can't leave the
   * old queries on disk.
   */
  clear(): Promise<void>;
}

/** React Native's `AppState`, or a stand-in. */
export interface AppStateLike {
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

/** `@react-native-community/netinfo`'s default export, or a stand-in. */
export interface NetInfoLike {
  addEventListener(listener: (state: { isConnected: boolean | null }) => void): () => void;
}

export interface QueryLifecycleOptions {
  appState?: AppStateLike;
  netInfo?: NetInfoLike;
}

/**
 * Tell TanStack Query when the app comes to the front (refetch stale
 * queries) and when the network comes and goes. Returns the cleanup.
 */
export function connectQueryLifecycle({ appState, netInfo }: QueryLifecycleOptions): () => void {
  if (appState) {
    focusManager.setEventListener((setFocused) => {
      const subscription = appState.addEventListener("change", (state) => setFocused(state === "active"));
      return () => subscription.remove();
    });
  }
  if (netInfo) {
    onlineManager.setEventListener((setOnline) => netInfo.addEventListener((state) => setOnline(state.isConnected !== false)));
  }
  return () => {
    // Replacing the listener runs the cleanup of the one set above.
    if (appState) focusManager.setEventListener(() => () => {});
    if (netInfo) onlineManager.setEventListener(() => () => {});
  };
}
