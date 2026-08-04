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
    };

const defaultStorage = createLocalStorageAdapter();

export function GenesisProvider({
  children,
  provider,
  mock,
  storage,
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

  // Internal QueryClient with sensible defaults.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
          },
        },
      }),
    [],
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
