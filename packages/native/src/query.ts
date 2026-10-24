/**
 * Query: a TanStack Query client with offline-safe defaults, and persistence
 * of chosen queries to async storage (AsyncStorage, MMKV, …), built on
 * TanStack's own persister so restore, throttling and max age are theirs.
 */
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  focusManager,
  onlineManager,
  type QueryClientConfig,
} from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/query-persist-client-core";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

/** The part of AsyncStorage (or any async key-value store) Genesis uses. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** One day in milliseconds: the default max age of the saved query cache. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A QueryClient for a phone. `networkMode: "always"` runs a query or mutation
 * even when the device reports offline, so it fails (and shows its error or
 * cached data) instead of waiting forever for a network that may never come
 * back. `gcTime` matches the persisted max age, or restored queries would be
 * collected before they are used. Your `config` wins.
 */
export function createNativeQueryClient(config: QueryClientConfig = {}): QueryClient {
  const { queries, mutations, ...rest } = config.defaultOptions ?? {};
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...rest,
      queries: { networkMode: "always", gcTime: DAY_MS, staleTime: 60_000, ...queries },
      mutations: { networkMode: "always", ...mutations },
    },
  });
}

export interface QueryPersistenceOptions {
  queryClient: QueryClient;
  storage: AsyncStorageLike;
  /**
   * The query-key roots to persist: a query is saved when its key's first
   * element is listed (`["clients", id]` is saved under `"clients"`). Nothing
   * else is written to the phone.
   */
  keys: readonly string[];
  /** Your app's version: a different value discards the saved cache. */
  buster: string;
  /** How old a saved cache may be when restored. Default 24 hours. */
  maxAge?: number;
  /** Storage key. Default `"genesis-query-cache"`. */
  storageKey?: string;
  /** Write at most this often. Default 1000 ms. */
  throttleMs?: number;
}

export interface QueryPersistence {
  /** Load the saved cache into the client (a boot step). */
  restore(): Promise<void>;
  /** Save on every cache change; returns the unsubscribe. */
  subscribe(): () => void;
  /**
   * Delete the saved cache (sign-out). Clear the QueryClient first: the
   * subscription then saves the empty cache, so a save already in flight
   * can't leave the old queries on disk.
   */
  clear(): Promise<void>;
}

/** Save the allowlisted queries to async storage and restore them, with a max age and an app-version buster. */
export function createQueryPersistence({
  queryClient,
  storage,
  keys,
  buster,
  maxAge = DAY_MS,
  storageKey = "genesis-query-cache",
  throttleMs = 1000,
}: QueryPersistenceOptions): QueryPersistence {
  const persister = createAsyncStoragePersister({ storage, key: storageKey, throttleTime: throttleMs });
  const allowed = new Set(keys);
  const dehydrateOptions = {
    shouldDehydrateQuery: (query: Parameters<typeof defaultShouldDehydrateQuery>[0]) =>
      allowed.has(String(query.queryKey[0])) && defaultShouldDehydrateQuery(query),
    // Mutations stay in memory: replaying a saved write is an outbox's job.
    shouldDehydrateMutation: () => false,
  };
  return {
    restore: () => persistQueryClientRestore({ queryClient, persister, buster, maxAge }),
    subscribe: () => persistQueryClientSubscribe({ queryClient, persister, buster, dehydrateOptions }),
    clear: async () => {
      await persister.removeClient();
    },
  };
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
