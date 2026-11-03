import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DataProvider } from "./types";
import { createMockProvider, type MockProviderOptions } from "./mock-provider";
import type { StorageAdapter } from "../storage/types";
import { createLocalStorageAdapter } from "../storage/adapters";
import type { QueryPersistence } from "../offline/types";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DataProviderContext = createContext<DataProvider | null>(null);
const StorageContext = createContext<StorageAdapter>(createLocalStorageAdapter());

// ---------------------------------------------------------------------------
// DataProviderRoot — thin context wrapper
// ---------------------------------------------------------------------------

/**
 * Puts a `DataProvider` in context, and nothing else. Mount it inside your
 * app's own `QueryClientProvider` and the Genesis hooks share that cache:
 * the same query keys (`[resource, "list", params]`,
 * `[resource, "detail", id, select]`), so invalidating `[resource]` from app
 * code refreshes Genesis lists too, and vice versa.
 */
export interface DataProviderRootProps {
  provider: DataProvider;
  children: ReactNode;
}

export function DataProviderRoot({ provider, children }: DataProviderRootProps) {
  return (
    <DataProviderContext.Provider value={provider}>
      {children}
    </DataProviderContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDataProvider(): DataProvider {
  const ctx = useContext(DataProviderContext);
  if (!ctx) {
    throw new Error(
      "useDataProvider must be used inside <DataProviderRoot> or <GenesisProvider>. " +
        "Wrap your app (or the relevant subtree) in one of these providers.",
    );
  }
  return ctx;
}

export function useStorage(): StorageAdapter {
  return useContext(StorageContext);
}

// ---------------------------------------------------------------------------
// GenesisProvider — convenience wrapper
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export type GenesisProviderProps =
  | {
      children: ReactNode;
      /** Pass a ready-made DataProvider. Mutually exclusive with `mock`. */
      provider: DataProvider;
      mock?: never;
      /** Platform-specific storage adapter. Defaults to localStorage (SSR-safe). */
      storage?: StorageAdapter;
      /**
       * Keep reads on the device and restore them on the next start, so lists and records open at
       * once: `persistOffline({ cache: indexedDbLocalCache(), resources, buster })` from
       * `@marktiderman/genesis-core/offline`. Needs `persistScope`.
       */
      persist?: (client: QueryClient) => QueryPersistence;
      /**
       * Whose cache this is: `cacheScope(user.id, workspaceKey)`, or null while nobody is signed in
       * (nothing is restored or saved). A change restores the new scope's reads; clear the
       * QueryClient yourself when the person changes, as a sign-out already does.
       */
      persistScope?: string | null;
      /**
       * The TanStack Query client to use. Without it, GenesisProvider creates
       * its OWN client — a second cache beside any the app already has, so app
       * queries and Genesis queries would not see each other's invalidations.
       * An app with a `QueryClientProvider` should pass its client here, or
       * use `DataProviderRoot` inside that provider instead.
       */
      queryClient?: QueryClient;
    }
  | {
      children: ReactNode;
      provider?: never;
      /** Pass mock datasets. Mutually exclusive with `provider`. */
      mock: {
        datasets: Record<string, Row[]>;
        options?: MockProviderOptions;
      };
      /** Platform-specific storage adapter. Defaults to localStorage (SSR-safe). */
      storage?: StorageAdapter;
      /** See the `provider` variant. */
      queryClient?: QueryClient;
      /** See the `provider` variant. */
      persist?: (client: QueryClient) => QueryPersistence;
      /** See the `provider` variant. */
      persistScope?: string | null;
    };

const defaultStorage = createLocalStorageAdapter();

/**
 * Convenience root: a `QueryClientProvider`, storage, and a data provider
 * (yours, or a mock built from datasets). It creates its own `QueryClient`
 * unless you pass `queryClient`; an app that already has one should pass it,
 * or mount `DataProviderRoot` inside its existing `QueryClientProvider`.
 */
export function GenesisProvider({
  children,
  provider,
  mock,
  storage,
  queryClient: queryClientProp,
  persist,
  persistScope = null,
}: GenesisProviderProps) {
  if (provider && mock) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[GenesisProvider] Both `provider` and `mock` were passed. `provider` takes precedence. This is likely a mistake.");
    }
  }

  // Build provider from mock datasets when no explicit provider is given.
  const resolvedProvider = useMemo(() => {
    if (provider) return provider;
    if (mock) return createMockProvider(mock.datasets, mock.options);
    throw new Error(
      "<GenesisProvider> requires either a `provider` or `mock` prop.",
    );
  }, [provider, mock]);

  // The caller's QueryClient, or an internal one with sensible defaults.
  const queryClient = useMemo(
    () =>
      queryClientProp ??
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
          },
        },
      }),
    [queryClientProp],
  );

  const resolvedStorage = storage ?? defaultStorage;
  const restored = useRestoredReads(queryClient, persist, persistScope);

  return (
    <QueryClientProvider client={queryClient}>
      <StorageContext.Provider value={resolvedStorage}>
        <DataProviderRoot provider={resolvedProvider}>
          {restored ? children : null}
        </DataProviderRoot>
      </StorageContext.Provider>
    </QueryClientProvider>
  );
}

/** How long the first render waits for the device's reads before it goes on without them. */
const RESTORE_WAIT_MS = 400;

/**
 * Restores `scope`'s kept reads before the screens first render (so they open from the device),
 * waiting at most RESTORE_WAIT_MS, then saves new reads. Never blocks a later scope change.
 */
function useRestoredReads(
  queryClient: QueryClient,
  persist: ((client: QueryClient) => QueryPersistence) | undefined,
  scope: string | null,
): boolean {
  // The first `persist` given is kept, so a screen that writes it inline doesn't restart the
  // restore on every render.
  const persistRef = useRef(persist);
  const persistence = useMemo(() => (persistRef.current ? persistRef.current(queryClient) : null), [queryClient]);
  const [ready, setReady] = useState(!persistence || !scope);
  useEffect(() => {
    if (!persistence || !scope) {
      setReady(true);
      return;
    }
    let live = true;
    let stop: (() => void) | undefined;
    const open = () => {
      if (live) setReady(true);
    };
    const wait = setTimeout(open, RESTORE_WAIT_MS);
    void persistence
      .restore(scope)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(wait);
        open();
        if (live) stop = persistence.subscribe(scope);
      });
    return () => {
      live = false;
      clearTimeout(wait);
      stop?.();
    };
  }, [persistence, scope]);
  return ready;
}

