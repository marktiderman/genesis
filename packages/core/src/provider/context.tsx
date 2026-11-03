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
       * `@marktiderman/genesis-core/offline`. Needs `persistScope`. Give it from the first render:
       * the provider keeps the first one it's given.
       */
      persist?: (client: QueryClient) => QueryPersistence;
      /**
       * Whose cache this is: `cacheScope(user.id, workspaceKey)` once someone is signed in,
       * `null` once nobody is, and `undefined` while that isn't known yet (the session loading).
       * A device is one person's: restoring someone deletes everyone else's kept reads, and
       * `null` deletes them all, so a session that ended outside the app (it expired, or was
       * signed out elsewhere) leaves nothing on the device. Undefined does nothing. A change of
       * scope restores the new one's reads. Clear the QueryClient yourself when the person
       * changes, as a sign-out already does; a `ViewerScope` inside keeps the restored reads for
       * this person. Restoring is client-only: in a server-rendered app, give it after hydration
       * (undefined on the server and the first client render), and the screens restore in the
       * background. Change it only once the provider's session has: a scope must never name a
       * person before the data provider's requests are made as them.
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
  persistScope,
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
          <PersistedViewerContext.Provider value={persist && typeof persistScope === "string" ? userOf(persistScope) : undefined}>
            {restored ? children : null}
          </PersistedViewerContext.Provider>
        </DataProviderRoot>
      </StorageContext.Provider>
    </QueryClientProvider>
  );
}

/** How long the first render waits for the device's reads before it goes on without them. */
const RESTORE_WAIT_MS = 400;

/** The person a scope belongs to (`u:<user>|<workspace>`, or a bare user id). */
const userOf = (scope: string) => (scope.startsWith("u:") ? scope.slice(2, scope.indexOf("|") < 0 ? undefined : scope.indexOf("|")) : scope);

/**
 * Restores `scope`'s kept reads before the screens first render (so they open from the device),
 * waiting at most RESTORE_WAIT_MS, then saves new reads. Only the first render waits, and never on
 * the server; a later scope change restores in the background. When the person changes or signs
 * out, their reads are deleted from the device before anything of the next scope is restored.
 */
function useRestoredReads(
  queryClient: QueryClient,
  persist: ((client: QueryClient) => QueryPersistence) | undefined,
  scope: string | null | undefined,
): boolean {
  // The first `persist` given is kept (one given only later is ignored), so a screen that writes
  // it inline doesn't restart the restore on every render.
  const persistRef = useRef(persist);
  const persistence = useMemo(() => (persistRef.current ? persistRef.current(queryClient) : null), [queryClient]);
  const [ready, setReady] = useState(!persistence || !scope || typeof window === "undefined");
  // Whose reads this provider last restored or saved, and the clear of them still running.
  const person = useRef<string | null>(null);
  const clearing = useRef<Promise<void>>(Promise.resolve());
  // The scope the last run of the effect saw ("not known yet" at mount). A scope that arrives from
  // there is saved only from reads fetched once it's known: whatever the client already holds or
  // is reading may be another session's (the session was loading, or the client outlived this
  // provider and someone else's session), so it's fetched again (`refresh`), never adopted.
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const from = previous.current;
    previous.current = scope;
    if (!persistence || scope === undefined) {
      // Not known yet who's signed in: nothing is restored, saved or deleted.
      setReady(true);
      return;
    }
    if (scope === null) {
      // Nobody signed in: nothing of anyone's stays on the device.
      person.current = null;
      clearing.current = persistence.restore("").catch(() => undefined);
      setReady(true);
      return;
    }
    const next = userOf(scope);
    if (person.current !== null && person.current !== next) {
      clearing.current = persistence.clear().catch(() => undefined);
    }
    person.current = next;
    const abort = new AbortController();
    // Saving starts with the scope. A read made before it is saved only when the scope before was
    // "not known yet" (the same session, loading); from another person or workspace, never.
    const stop = persistence.subscribe(scope, { refresh: from === undefined });
    const open = () => {
      if (!abort.signal.aborted) setReady(true);
    };
    const wait = setTimeout(open, RESTORE_WAIT_MS);
    void clearing.current
      .then(() => (abort.signal.aborted ? undefined : persistence.restore(scope, abort.signal)))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(wait);
        open();
      });
    return () => {
      abort.abort();
      clearTimeout(wait);
      stop();
    };
  }, [persistence, scope]);
  return ready;
}

/**
 * The person whose kept reads `GenesisProvider` restored (`persistScope`'s user), so a
 * `ViewerScope` inside keeps them for that viewer instead of emptying the cache.
 */
export const PersistedViewerContext = createContext<string | undefined>(undefined);

