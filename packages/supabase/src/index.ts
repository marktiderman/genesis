/**
 * Supabase for Genesis apps. Platform-neutral: web, React Native and the
 * server import it. Native-only helpers (Keychain storage, foreground
 * refresh, reinstall wipe) are on `@marktiderman/genesis-supabase/native`.
 */
import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import { APPLE_REVOKE_FUNCTION, requestAppleRevocation, type FunctionsClient } from "./apple-tokens";

export {
  APPLE_REVOKE_FUNCTION,
  requestAppleRevocation,
  storeAppleToken,
  type FunctionsClient,
  type StoreAppleTokenOptions,
  type StoreAppleTokenResult,
} from "./apple-tokens";

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
  /** `"native"` sets the React Native defaults (no session from the URL). Default `"web"`. */
  platform?: "web" | "native";
  /**
   * Read a session from the URL after an OAuth redirect. Default: `true` on
   * web, `false` on native, where the app hands the redirect URL to
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
  platform = "web",
  detectSessionInUrl = platform === "web",
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

/** What a Supabase or PostgREST error carries. */
export interface PostgrestErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * A failed query, with the database's `code` (`23505` unique violation,
 * `42501` permission denied, `PGRST116` no rows…), `details` and `hint`, so a
 * caller can tell an RLS refusal from a conflict. The original error is the
 * `cause`.
 *
 * @stability Beta
 */
export class SupabaseQueryError extends Error {
  override name = "SupabaseQueryError";
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
  constructor(error: PostgrestErrorLike) {
    super(error.message, { cause: error });
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
  }
}

/**
 * The data, or a thrown {@link SupabaseQueryError}: for query results where an
 * error should fail the caller (a TanStack Query `queryFn`). The return type
 * keeps `null` when the query can return no row (`.maybeSingle()`).
 *
 * @stability Beta
 */
export function must<T>(result: { data: T; error: null } | { data: null; error: PostgrestErrorLike }): T {
  if (result.error) throw new SupabaseQueryError(result.error);
  return result.data as T;
}

/** The parts of a Supabase client {@link deleteMyAccount} uses. A `SupabaseClient` fits. */
export interface DeleteAccountClient {
  // Loose on purpose: a client typed by an app's Database narrows `rpc`'s
  // function names, and the app's generated types may not list this one yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: PostgrestErrorLike | null }>;
  auth: { signOut(options?: { scope?: "global" | "local" | "others" }): Promise<unknown> };
  /** Needed only with `revokeAppleTokens`. */
  functions?: FunctionsClient["functions"];
}

/** @stability Beta */
export interface DeleteMyAccountOptions {
  /**
   * After the delete, ask the `genesis-apple-revoke` Edge Function to revoke
   * the person's Sign in with Apple tokens now (`true`, or the function's
   * name). Best effort: the delete has already queued them and the
   * function's schedule retries, so a failure here never fails the call.
   */
  revokeAppleTokens?: boolean | string;
}

/**
 * In-app account deletion (App Store Review Guideline 5.1.1(v)), on web and
 * native: calls the `delete_my_account` RPC (this package's
 * `migrations/0001_genesis_account_deletion.sql`), which deletes the login
 * and, through the app's `on delete cascade` foreign keys, its data; then
 * clears the session on this device. Throws a {@link SupabaseQueryError} when
 * the database refuses (`42501`: not signed in) and keeps the session then.
 *
 * With Sign in with Apple, ship the `genesis-apple-revoke` function and
 * migration 0003 and pass `{ revokeAppleTokens: true }`: App Review requires
 * the person's Apple tokens to be revoked.
 *
 * Put it behind a confirmation; see the README.
 *
 * @stability Beta
 */
export async function deleteMyAccount(client: DeleteAccountClient, options: DeleteMyAccountOptions = {}): Promise<void> {
  must((await client.rpc("delete_my_account")) as { data: unknown; error: null } | { data: null; error: PostgrestErrorLike });
  const revoke = options.revokeAppleTokens;
  // The function needs no login (it works through the queue the delete just filled), so this runs after it.
  if (revoke && client.functions) await requestAppleRevocation({ functions: client.functions }, typeof revoke === "string" ? revoke : APPLE_REVOKE_FUNCTION);
  // The login is gone and its refresh tokens with it: only this device's copy is left to clear.
  await client.auth.signOut({ scope: "local" });
}
