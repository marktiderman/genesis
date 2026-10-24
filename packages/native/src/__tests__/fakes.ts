import { vi } from "vitest";
import type { AuthClientLike } from "../auth";
import type { AsyncStorageLike } from "../query";

export interface FakeSession {
  user: { id: string };
}

/** A Supabase stand-in: `emit` plays an auth event to every listener. */
export function fakeSupabase(initial: FakeSession | null = null, { error }: { error?: Error } = {}) {
  const listeners = new Set<(event: string, session: FakeSession | null) => void>();
  const client: AuthClientLike<FakeSession> & { from: (table: string) => unknown } = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: error ? null : initial }, error: error ?? null })),
      onAuthStateChange: vi.fn((callback: (event: string, session: FakeSession | null) => void) => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      }),
    },
    from: () => ({}),
  };
  const emit = (event: string, session: FakeSession | null) => {
    for (const listener of listeners) listener(event, session);
  };
  return { client, emit, listeners };
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
