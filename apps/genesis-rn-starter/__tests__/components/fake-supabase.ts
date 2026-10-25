/**
 * The Supabase client the component tests give the app in place of `src/lib/supabase.ts`
 * (see `setup.ts`). It keeps one session and plays the auth events supabase-js plays:
 * `INITIAL_SESSION` to each new listener, `SIGNED_IN` after a sign-in, `SIGNED_OUT` after a
 * sign-out. `next` scripts the next answers.
 */
import { jest } from "@jest/globals";

export interface FakeUser {
  id: string;
  email: string;
}
export interface FakeSession {
  access_token: string;
  user: FakeUser;
}
type Listener = (event: string, session: FakeSession | null) => void;
type AuthError = { code: string; message: string };
type AuthResult = { data: { session: FakeSession | null; user: FakeUser | null }; error: AuthError | null };
type QueryResult = { data: unknown; error: { code: string; message: string } | null; count: number };
type Query = { [method: string]: unknown; then: Promise<QueryResult>["then"] };

const QUERY_METHODS = ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "gt", "gte", "lt", "lte", "match", "filter", "order", "limit", "range"];

const listeners = new Set<Listener>();
let current: FakeSession | null = null;

/** What the next calls answer. `resetSupabase` puts every field back. */
export const next: {
  /** The next sign-in or sign-up fails with this Supabase error code. */
  authError: string | null;
  /** The next sign-up needs the email confirmed first: no session comes back. */
  confirmEmail: boolean;
  /** `delete_my_account` fails with this Postgres or app error code. */
  deleteError: string | null;
  /** `delete_my_account` doesn't answer until `releaseDelete()`. */
  holdDelete: boolean;
} = { authError: null, confirmEmail: false, deleteError: null, holdDelete: false };

let releaseHeld: () => void = () => {};
/** Lets a `delete_my_account` held by `next.holdDelete` answer. */
export function releaseDelete(): void {
  releaseHeld();
}

export function sessionFor(email: string): FakeSession {
  return { access_token: "test-token", user: { id: `user-${email}`, email } };
}

/** Plays an auth event to every listener, as supabase-js does after a sign-in or sign-out. */
export function emit(event: string, session: FakeSession | null): void {
  current = session;
  for (const listener of listeners) listener(event, session);
}

/** A PostgREST query on an empty table: every filter chains, and awaiting it gives no rows. */
function query(result: QueryResult | Promise<QueryResult>): Query {
  const settle = Promise.resolve(result);
  const q: Query = { then: (onFulfilled, onRejected) => settle.then(onFulfilled, onRejected) };
  for (const method of QUERY_METHODS) q[method] = () => q;
  q.single = () => query(settle.then((r) => ({ ...r, data: null })));
  q.maybeSingle = () => query(settle.then((r) => ({ ...r, data: null })));
  return q;
}

async function signIn(email: string, confirm: boolean): Promise<AuthResult> {
  const code = next.authError;
  next.authError = null;
  if (code) return { data: { session: null, user: null }, error: { code, message: `server text for ${code}` } };
  const session = sessionFor(email);
  if (confirm) return { data: { session: null, user: session.user }, error: null };
  emit("SIGNED_IN", session);
  return { data: { session, user: session.user }, error: null };
}

function deleteMyAccount(): Query {
  const answer = (): QueryResult =>
    next.deleteError
      ? { data: null, error: { code: next.deleteError, message: `refused: ${next.deleteError}` }, count: 0 }
      : { data: null, error: null, count: 0 };
  if (!next.holdDelete) return query(answer());
  return query(new Promise<QueryResult>((resolve) => (releaseHeld = () => resolve(answer()))));
}

export const fakeSupabase = {
  auth: {
    storageKey: "genesis-rn-starter-auth-token",
    storage: { getItem: async (_key: string): Promise<string | null> => (current ? JSON.stringify(current) : null) },
    getSession: jest.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: jest.fn((callback: Listener) => {
      listeners.add(callback);
      // supabase-js tells each new listener the session it has, a tick after it subscribes.
      queueMicrotask(() => {
        if (listeners.has(callback)) callback("INITIAL_SESSION", current);
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    }),
    signInWithPassword: jest.fn(({ email }: { email: string; password: string }) => signIn(email, false)),
    signUp: jest.fn(({ email }: { email: string; password: string }) => signIn(email, next.confirmEmail)),
    signOut: jest.fn(async (_options?: { scope?: string }) => {
      emit("SIGNED_OUT", null);
      return { error: null };
    }),
    updateUser: jest.fn(async () => ({ data: { user: current?.user ?? null }, error: null })),
  },
  from: jest.fn((_table: string) => query({ data: [], error: null, count: 0 })),
  rpc: jest.fn((fn: string, _args?: object) => (fn === "delete_my_account" ? deleteMyAccount() : query({ data: null, error: null, count: 0 }))),
  // Edge Functions (genesis-apple-revoke): every call succeeds.
  functions: { invoke: jest.fn(async (_name: string, _options?: object) => ({ data: { ok: true }, error: null })) },
  // genesis-chat's tables and functions (the Messages tab): an empty inbox.
  schema: jest.fn((_schema: string) => ({ from: fakeSupabase.from, rpc: fakeSupabase.rpc })),
  // Realtime (chat's live hints): channels that join and never hear anything.
  channel: jest.fn((_topic: string, _options?: object) => {
    const channel = { on: () => channel, subscribe: () => channel, send: async () => "ok" };
    return channel;
  }),
  removeChannel: jest.fn(async (_channel: unknown) => "ok"),
};

/** `sessionReady` from `src/lib/supabase.ts`, the boot step that wipes a session left by an earlier install. */
export const sessionReady = jest.fn(async (): Promise<unknown> => false);

/** Starts a test signed in as `email` (or signed out), with no listeners or scripted answers left from the last one. */
export function resetSupabase(email: string | null): void {
  listeners.clear();
  current = email ? sessionFor(email) : null;
  Object.assign(next, { authError: null, confirmEmail: false, deleteError: null, holdDelete: false });
  releaseHeld = () => {};
  sessionReady.mockReset();
  sessionReady.mockImplementation(async () => false);
  for (const fn of [
    fakeSupabase.auth.getSession,
    fakeSupabase.auth.onAuthStateChange,
    fakeSupabase.auth.signInWithPassword,
    fakeSupabase.auth.signUp,
    fakeSupabase.auth.signOut,
    fakeSupabase.auth.updateUser,
    fakeSupabase.from,
    fakeSupabase.rpc,
    fakeSupabase.functions.invoke,
  ]) {
    fn.mockClear();
  }
}
