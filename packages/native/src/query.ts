/**
 * Query: a TanStack Query client with offline-safe defaults, and the contract
 * for saving it to the phone. The persister itself is in
 * `@marktiderman/genesis-native/persist`, so an app that saves nothing doesn't
 * install TanStack's persister packages.
 */
import { QueryClient, focusManager, isCancelledError, onlineManager, type QueryClientConfig } from "@tanstack/react-query";
import { classifyError } from "@marktiderman/genesis-core/errors";
import type { ErrorReport } from "./errors";

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
    if (netInfo) {
      onlineManager.setEventListener(() => () => {});
      // Nothing reports the network any more: don't leave paused queries waiting on the last
      // "offline" NetInfo said (offlineFirst pauses retries while offline).
      onlineManager.setOnline(true);
    }
  };
}

/** A failed query or mutation, as `reportQueryErrors` hands it on. */
export type QueryErrorReporter = (error: Error, report: ErrorReport) => void;

export interface ReportQueryErrorsOptions {
  /** True when the device is offline. Default TanStack's `onlineManager`. */
  isOffline?: () => boolean;
}

// A key segment that is a name (`tasks`, `chat.messages`), not an id or text.
const KEY_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const LOOKS_LIKE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$|[0-9a-f]{20,}/i;

/** The first segment of a query or mutation key, when it is a name; never the ids after it. */
export function queryKeyName(key: readonly unknown[] | undefined): string | undefined {
  const first = key?.[0];
  return typeof first === "string" && KEY_NAME.test(first) && !LOOKS_LIKE_ID.test(first) ? first : undefined;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(typeof value === "string" ? value : "Unknown error");
}

/**
 * Hand every query and mutation that failed for good (after its retries) to
 * `report`, as a non-fatal `query` or `mutation` error tagged with the key's
 * first segment (`query.key: "tasks"`), never the ids after it.
 *
 * Only errors worth a report (`classifyError(e).report`): being offline,
 * signed out, a record that's gone and the server's expected refusals
 * (forbidden, conflict, a rejected value) are the screen's to show, not
 * bugs. A cancelled query is never reported. One query or mutation opts out
 * with `meta: { reportErrors: false }`.
 *
 * Works on any client (it subscribes to the caches), so it covers a client
 * the app passed in too. Returns the unsubscribe.
 *
 * @stability Beta
 */
export function reportQueryErrors(client: QueryClient, report: QueryErrorReporter, options: ReportQueryErrorsOptions = {}): () => void {
  const isOffline = options.isOffline ?? (() => !onlineManager.isOnline());
  const send = (raw: unknown, source: "query" | "mutation", key: readonly unknown[] | undefined, meta: Record<string, unknown> | undefined) => {
    if (meta?.reportErrors === false || isCancelledError(raw)) return;
    if (!classifyError(raw, { isOffline }).report) return;
    const name = queryKeyName(key);
    try {
      report(toError(raw), { fatal: false, source, ...(name ? { tags: { [`${source}.key`]: name } } : {}) });
    } catch {
      // A failing reporter must not break the cache's listeners.
    }
  };
  const offQueries = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    send(event.action.error, "query", event.query.queryKey, event.query.meta);
  });
  const offMutations = client.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    send(event.action.error, "mutation", event.mutation.options.mutationKey, event.mutation.meta);
  });
  return () => {
    offQueries();
    offMutations();
  };
}
