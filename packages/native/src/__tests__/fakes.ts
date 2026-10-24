import { vi } from "vitest";
import type { AuthClientLike } from "../auth";
import type { AsyncStorageLike } from "../query";

export interface FakeSession {
  user: { id: string };
}

export interface FakeSupabaseOptions {
  /** What `getSession` reports as its error. */
  error?: unknown;
  /** `getSession` never settles (a refresh stuck offline). */
  hang?: boolean;
  /** The session supabase-js keeps in its storage (read without a refresh). */
  stored?: FakeSession | null;
}

/** A Supabase stand-in: `emit` plays an auth event to every listener. */
export function fakeSupabase(initial: FakeSession | null = null, { error, hang, stored }: FakeSupabaseOptions = {}) {
  const listeners = new Set<(event: string, session: FakeSession | null) => void>();
  const storage = new Map<string, string>();
  if (stored !== undefined && stored !== null) storage.set("sb-test-auth-token", JSON.stringify(stored));
  const client: AuthClientLike<FakeSession> & { from: (table: string) => unknown } = {
    auth: Object.assign(
      {
        getSession: vi.fn(() =>
          hang ? new Promise<never>(() => {}) : Promise.resolve({ data: { session: error ? null : initial }, error: error ?? null }),
        ),
        onAuthStateChange: vi.fn((callback: (event: string, session: FakeSession | null) => void) => {
          listeners.add(callback);
          return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
        }),
      },
      { storage: { getItem: async (key: string) => storage.get(key) ?? null }, storageKey: "sb-test-auth-token" },
    ),
    from: () => ({}),
  };
  const emit = (event: string, session: FakeSession | null) => {
    for (const listener of listeners) listener(event, session);
  };
  return { client, emit, listeners };
}

/** supabase-js's error for a request that never reached the server. */
export function retryableFetchError() {
  return Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError", status: 0 });
}

export function memoryStorage(): AsyncStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
export const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
