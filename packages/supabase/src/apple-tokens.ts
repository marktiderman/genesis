/**
 * The app's side of Sign in with Apple token revocation: hand the sign-in's
 * authorization code to the `genesis-apple-revoke` Edge Function (it keeps
 * Apple's refresh token server-side), and ask it to revoke after the account
 * is deleted. The function and its migration ship in this package; see the
 * README ("Revoking Apple's tokens").
 */

/** The Edge Function's default name, as shipped in `functions/genesis-apple-revoke`. */
export const APPLE_REVOKE_FUNCTION = "genesis-apple-revoke";

/** The parts of a Supabase client these helpers use. A `SupabaseClient` fits. */
export interface FunctionsClient {
  functions: {
    // Loose on purpose, so any supabase-js version's `invoke` fits.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoke: (name: string, options?: any) => PromiseLike<{ data: unknown; error: unknown }>;
  };
}

/** @stability Beta */
export interface StoreAppleTokenOptions {
  /** `authorizationCode` from `signInWithApple`'s result. Single-use, valid for five minutes: send it straight after sign-in. */
  authorizationCode: string;
  /** The client id the code was issued for: your bundle id on iOS. Must be in the function's APPLE_CLIENT_IDS; default its first. */
  clientId?: string;
  /** The Edge Function's name. Default `genesis-apple-revoke`. */
  functionName?: string;
}

/** @stability Beta */
export type StoreAppleTokenResult = { ok: true } | { ok: false; error: Error };

/**
 * After a Sign in with Apple, sends the authorization code to the Edge
 * Function, which exchanges it for Apple's refresh token and keeps it where
 * only the server reads it, so deleting the account can revoke it. Call it
 * with the session from that sign-in. Never throws: the person is signed in
 * either way, so log a failure rather than showing it.
 *
 * @stability Beta
 */
export async function storeAppleToken(client: FunctionsClient, { authorizationCode, clientId, functionName = APPLE_REVOKE_FUNCTION }: StoreAppleTokenOptions): Promise<StoreAppleTokenResult> {
  try {
    const { error } = await client.functions.invoke(functionName, { body: { action: "store", code: authorizationCode, ...(clientId ? { clientId } : {}) } });
    if (error) return { ok: false, error: error instanceof Error ? error : new Error(String((error as { message?: unknown }).message ?? error)) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Asks the Edge Function to revoke the tokens of deleted accounts now, rather
 * than at its next scheduled run. Never throws and never fails the caller:
 * the account is already gone and the queue keeps the token until a run
 * succeeds.
 */
export async function requestAppleRevocation(client: FunctionsClient, functionName = APPLE_REVOKE_FUNCTION): Promise<boolean> {
  try {
    const { error } = await client.functions.invoke(functionName, { body: { action: "revoke" } });
    return !error;
  } catch {
    return false;
  }
}
