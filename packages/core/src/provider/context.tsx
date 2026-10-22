import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DataProvider } from "./types";
import { createMockProvider, type MockProviderOptions } from "./mock-provider";
import type { StorageAdapter } from "../storage/types";
import { createLocalStorageAdapter } from "../storage/adapters";

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

  return (
    <QueryClientProvider client={queryClient}>
      <StorageContext.Provider value={resolvedStorage}>
        <DataProviderRoot provider={resolvedProvider}>
          {children}
        </DataProviderRoot>
      </StorageContext.Provider>
    </QueryClientProvider>
  );
}
