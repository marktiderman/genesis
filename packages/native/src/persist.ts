/**
 * `@marktiderman/genesis-native/persist`: save chosen queries to async storage
 * (AsyncStorage, MMKV, …) with TanStack's own persister, so restore,
 * throttling and max age are theirs.
 *
 * Install `@tanstack/query-persist-client-core` and
 * `@tanstack/query-async-storage-persister` at the same version as your
 * `@tanstack/react-query`: they pin `@tanstack/query-core` exactly, and two
 * copies of it would not share a cache.
 *
 *   <GenesisNativeApp persist={persistQueries({ storage: AsyncStorage, keys: ["clients"], buster: version })} … />
 *
 * @stability Beta
 */
import { defaultShouldDehydrateQuery, type QueryClient } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/query-persist-client-core";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { DAY_MS, type AsyncStorageLike, type QueryPersistence } from "./query";

export interface PersistQueriesOptions {
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

export interface QueryPersistenceOptions extends PersistQueriesOptions {
  queryClient: QueryClient;
}

/** Save the allowlisted queries to async storage and restore them, with a max age, an app-version buster and a user scope. */
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
  // The scope rides in the buster: TanStack discards (and deletes) a saved
  // cache whose buster differs, so another user's cache is never restored.
  const scoped = (scope: string) => `${buster}|user:${scope}`;
  return {
    restore: async (scope) => {
      try {
        await persistQueryClientRestore({ queryClient, persister, buster: scoped(scope), maxAge });
      } catch {
        // An unreadable cache has already been deleted; start without it rather than fail the boot.
      }
    },
    subscribe: (scope) => persistQueryClientSubscribe({ queryClient, persister, buster: scoped(scope), dehydrateOptions }),
    clear: async () => {
      await persister.removeClient();
    },
  };
}

/** `createQueryPersistence` for `GenesisNativeApp`'s `persist` prop, which supplies the client. */
export function persistQueries(options: PersistQueriesOptions): (queryClient: QueryClient) => QueryPersistence {
  return (queryClient) => createQueryPersistence({ ...options, queryClient });
}

export type { QueryPersistence } from "./query";
