/**
 * Supabase for Genesis apps. Platform-neutral: web, React Native and the
 * server import it. Native-only helpers (Keychain storage, foreground
 * refresh, reinstall wipe) are on `@marktiderman/genesis-supabase/native`.
 */
import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

/** The async key-value store Supabase auth keeps its session in. */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** @stability Beta */
export interface GenesisSupabaseOptions {
  url: string;
  /** The publishable (anon) key. Never the secret key in an app. */
  publishableKey: string;
  /** Where the session lives. Native: `keychainStorage(SecureStore)`. Web: leave out for supabase-js's own default. */
  storage?: SessionStorage;
  /**
   * Read a session from the URL after an OAuth redirect. Default `true` on
   * web; pass `false` on native, where the app hands the redirect URL to
   * `exchangeCodeForSession` itself.
   */
  detectSessionInUrl?: boolean;
  /** Anything else for supabase-js, merged last. */
  options?: SupabaseClientOptions<"public">;
}

/**
 * A Supabase client with Genesis's defaults: PKCE sign-in (the code flow, not
 * tokens in a redirect URL), a persisted session that refreshes itself, and
 * the session storage you pass.
 *
 * @stability Beta
 */
export function createGenesisSupabase<Database = unknown>({
  url,
  publishableKey,
  storage,
  detectSessionInUrl = true,
  options = {},
}: GenesisSupabaseOptions): SupabaseClient<Database> {
  // supabase-js's generics over the schema don't survive being forwarded, so the
  // options are built untyped and the client is typed by the caller's Database.
  const client = createClient(url, publishableKey, {
    ...options,
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl,
      ...(storage ? { storage } : {}),
      ...options.auth,
    },
  });
  return client as unknown as SupabaseClient<Database>;
}

/**
 * The data, or a thrown `Error` with the database's message: for query
 * results where an error should fail the caller (a TanStack Query `queryFn`).
 *
 * @stability Beta
 */
export function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
