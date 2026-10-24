/**
 * Auth gate: the Supabase session as app state.
 *
 * `createSessionStore(supabase)` reads the session once (`load`, a boot step,
 * so the splash stays up until it is known) and follows `onAuthStateChange`.
 * `useSession()` reads it; `AuthGate` renders `signedIn` or `signedOut`.
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
}

export interface SessionStore<S = unknown> {
  getState(): SessionState<S>;
  subscribe(listener: () => void): () => void;
  /** Read the current session (the boot step). Throws when Supabase reports an error. */
  load(): Promise<void>;
  /** Follow sign-in and sign-out; returns the unsubscribe. */
  start(): () => void;
}

export interface SessionStoreOptions {
  /** A signed-in user signed out (or the session ended): clear caches here. */
  onSignedOut?: () => void;
}

/** The Supabase session as a store: `load` reads it once, `start` follows auth events. */
export function createSessionStore<S = unknown>(client: AuthClientLike<S>, { onSignedOut }: SessionStoreOptions = {}): SessionStore<S> {
  const listeners = new Set<() => void>();
  let state: SessionState<S> = { status: "loading", session: null };

  const set = (session: S | null) => {
    const status: SessionStatus = session ? "signedIn" : "signedOut";
    const wasSignedIn = state.status === "signedIn";
    if (state.status === status && state.session === session) return;
    state = { status, session };
    for (const listener of listeners) listener();
    if (wasSignedIn && status === "signedOut") onSignedOut?.();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error instanceof Error ? error : new Error("Could not read the session.", { cause: error });
      set(data.session);
    },
    start() {
      const { data } = client.auth.onAuthStateChange((_event, session) => set(session));
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
