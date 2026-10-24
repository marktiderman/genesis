/**
 * Auth gate: the Supabase session as app state.
 *
 * `createSessionStore(supabase)` reads the session once (`load`, a boot step,
 * so the splash stays up until it is known) and follows `onAuthStateChange`.
 * `useSession()` reads it; `AuthGate` renders `signedIn` or `signedOut`.
 *
 * Offline, `getSession()` can wait about 30 seconds on a token refresh that
 * can't succeed and then fail with a retryable error, although the session is
 * still on the phone. So `load` waits at most `waitMs` (5 s) and, on a timeout
 * or a network error, uses the stored session: the user stays signed in and
 * sees their cached data, and Supabase's own events correct it once online.
 *
 * With expo-router, gate in a layout instead and let the router render:
 *
 *   const { status } = useSession();
 *   if (status === "signedOut") return <Redirect href="/sign-in" />;
 *   return <Stack />;
 */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

/** The parts of a Supabase client the gate uses; a `SupabaseClient` fits. */
export interface AuthClientLike<S = unknown> {
  auth: {
    getSession(): Promise<{ data: { session: S | null }; error?: unknown }>;
    onAuthStateChange(callback: (event: string, session: S | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}

export type SessionStatus = "loading" | "signedIn" | "signedOut";

export interface SessionState<S = unknown> {
  status: SessionStatus;
  session: S | null;
  /** The signed-in user's id, or null. */
  userId: string | null;
  /** True when the session came from the phone because Supabase couldn't be reached. */
  offline: boolean;
}

export interface SessionStore<S = unknown> {
  getState(): SessionState<S>;
  subscribe(listener: () => void): () => void;
  /** Read the current session (the boot step). Throws only on a non-network error. */
  load(): Promise<void>;
  /** Follow sign-in and sign-out; returns the unsubscribe. */
  start(): () => void;
}

export interface SessionStoreOptions<S = unknown> {
  /**
   * The signed-in user changed after the session was first known: signed
   * out, signed in, or switched account. `previous` and `next` are user ids
   * (null when nobody). Clear caches here.
   */
  onUserChange?: (previous: string | null, next: string | null) => void;
  /** Longest wait for `getSession()` before using the stored session. Default 5000 ms. */
  waitMs?: number;
  /**
   * Read the session saved on the phone without refreshing it. Default: from
   * the Supabase client's own storage (`auth.storage` under `auth.storageKey`).
   */
  readStoredSession?: () => Promise<S | null>;
  /** The user id in a session. Default `session.user.id`. */
  userIdOf?: (session: S) => string | null;
}

const DEFAULT_WAIT_MS = 5000;

function defaultUserId(session: unknown): string | null {
  const id = (session as { user?: { id?: unknown } } | null)?.user?.id;
  return typeof id === "string" ? id : null;
}

/** A network failure (supabase-js `AuthRetryableFetchError`, status 0), as opposed to a real refusal. */
function isNetworkError(error: unknown): boolean {
  const e = error as { name?: unknown; status?: unknown } | null;
  return e?.name === "AuthRetryableFetchError" || e?.status === 0;
}

/** The session supabase-js keeps under `auth.storageKey`, read without a refresh. */
function storedSessionReader<S>(client: AuthClientLike<S>): () => Promise<S | null> {
  return async () => {
    const auth = client.auth as { storage?: { getItem(key: string): unknown }; storageKey?: unknown };
    if (!auth.storage || typeof auth.storageKey !== "string") return null;
    const raw = await auth.storage.getItem(auth.storageKey);
    if (typeof raw !== "string") return (raw as S | null) ?? null;
    try {
      return JSON.parse(raw) as S;
    } catch {
      return null;
    }
  };
}

/** The Supabase session as a store: `load` reads it once, `start` follows auth events. */
export function createSessionStore<S = unknown>(client: AuthClientLike<S>, options: SessionStoreOptions<S> = {}): SessionStore<S> {
  const { onUserChange, waitMs = DEFAULT_WAIT_MS, userIdOf = defaultUserId } = options;
  const readStored = options.readStoredSession ?? storedSessionReader(client);
  const listeners = new Set<() => void>();
  let state: SessionState<S> = { status: "loading", session: null, userId: null, offline: false };
  // Bumped by every auth event, so a slow `getSession()` can't overwrite a newer one.
  let version = 0;

  const set = (session: S | null, offline = false) => {
    const userId = session ? userIdOf(session) : null;
    const previous = state;
    if (previous.status !== "loading" && previous.session === session && previous.offline === offline) return;
    state = { status: session ? "signedIn" : "signedOut", session, userId, offline };
    for (const listener of listeners) listener();
    if (previous.status !== "loading" && previous.userId !== userId) onUserChange?.(previous.userId, userId);
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      const startedAt = version;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), waitMs);
      });
      const result = await Promise.race([client.auth.getSession(), timedOut]).finally(() => clearTimeout(timer));
      if (version !== startedAt) return; // an auth event already told us
      if (result !== "timeout" && !result.error) return set(result.data.session);
      if (result !== "timeout" && !isNetworkError(result.error)) {
        const error = result.error;
        throw error instanceof Error ? error : new Error("Could not read the session.", { cause: error });
      }
      // Offline (or Supabase is slow): carry on with what the phone has.
      const stored = await readStored().catch(() => null);
      if (version !== startedAt) return;
      set(stored, stored !== null);
    },
    start() {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        version++;
        set(session);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}

const SessionContext = createContext<SessionStore | null>(null);

/** Makes a session store readable with `useSession()`. */
export function SessionProvider({ store, children }: { store: SessionStore; children: ReactNode }) {
  return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>;
}

/** The session and whether it is known yet. Inside `GenesisNativeApp` or a `SessionProvider`. */
export function useSession<S = unknown>(): SessionState<S> {
  const store = useContext(SessionContext);
  if (!store) throw new Error("useSession must be used inside <GenesisNativeApp> or <SessionProvider>.");
  return useSyncExternalStore(store.subscribe, store.getState, store.getState) as SessionState<S>;
}

export interface AuthGateProps {
  signedIn: ReactNode;
  signedOut: ReactNode;
  /** While the session is still being read. Default nothing (the splash is up). */
  loading?: ReactNode;
}

/** Render one tree for a signed-in user and another for everyone else. */
export function AuthGate({ signedIn, signedOut, loading = null }: AuthGateProps) {
  const { status } = useSession();
  if (status === "loading") return <>{loading}</>;
  return <>{status === "signedIn" ? signedIn : signedOut}</>;
}
