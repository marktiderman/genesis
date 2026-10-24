/**
 * Native sign-in onto a Supabase session: finishing an OAuth redirect (PKCE)
 * and Sign in with Apple. Nothing here imports Expo: pass the modules in.
 * Exported from `@marktiderman/genesis-supabase/native`.
 */
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Why a sign-in didn't produce a session. `code` is the provider's error
 * (`access_denied`…), Supabase Auth's error code, or one of Genesis's own:
 * `missing_code` (the redirect carried neither a code nor an error),
 * `exchange_failed`, `apple_unavailable`, `apple_failed`, `apple_no_token`,
 * `sign_in_failed`, `no_session`.
 *
 * @stability Beta
 */
export class GenesisAuthError extends Error {
  override name = "GenesisAuthError";
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
  }
}

/** The parts of a Supabase client the sign-in helpers use. A `SupabaseClient` fits. */
export interface SignInClient {
  auth: Pick<SupabaseClient["auth"], "exchangeCodeForSession" | "signInWithIdToken">;
}

/** @stability Beta */
export type OAuthRedirectResult = { session: Session; error?: undefined } | { session?: undefined; error: GenesisAuthError };

/**
 * The query and fragment parameters of a URL (the query wins for a key in
 * both). Hand-parsed: React Native's `URL` has no reliable `searchParams`.
 */
export function redirectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const hash = url.indexOf("#");
  const query = url.indexOf("?");
  const parts = [
    query >= 0 && (hash < 0 || query < hash) ? url.slice(query + 1, hash >= 0 ? hash : undefined) : "",
    hash >= 0 ? url.slice(hash + 1) : "",
  ];
  for (const part of parts) {
    for (const pair of part.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const key = decode(eq >= 0 ? pair.slice(0, eq) : pair);
      if (!(key in params)) params[key] = decode(eq >= 0 ? pair.slice(eq + 1) : "");
    }
  }
  return params;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/**
 * Finish an OAuth sign-in from the URL the browser came back to (the result of
 * `WebBrowser.openAuthSessionAsync`, or a deep link). With a `code` it
 * exchanges it for a session (PKCE: the verifier is already in the client's
 * storage); with an `error` it returns that error and makes no request.
 * Nothing is thrown; every failure is `{ error }`.
 *
 * @stability Beta
 */
export async function completeOAuthRedirect(client: SignInClient, url: string): Promise<OAuthRedirectResult> {
  const params = redirectParams(url);
  if (params.error || params.error_description) {
    const code = params.error_code || params.error || "oauth_error";
    return { error: new GenesisAuthError(code, params.error_description || params.error || "Sign-in failed") };
  }
  if (!params.code) return { error: new GenesisAuthError("missing_code", "The sign-in redirect carried no code") };
  try {
    const { data, error } = await client.auth.exchangeCodeForSession(params.code);
    if (error) return { error: new GenesisAuthError(error.code ?? "exchange_failed", error.message, error) };
    if (!data.session) return { error: new GenesisAuthError("no_session", "The code exchange returned no session") };
    return { session: data.session };
  } catch (e) {
    return { error: new GenesisAuthError("exchange_failed", e instanceof Error ? e.message : "The code exchange failed", e) };
  }
}

/** A person's name as `expo-apple-authentication` returns it. */
export interface AppleFullNameLike {
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
}

/** The parts of `expo-apple-authentication` that {@link signInWithApple} uses. Pass the module itself. */
export interface AppleAuthenticationLike {
  isAvailableAsync(): Promise<boolean>;
  signInAsync(options: { requestedScopes?: number[]; nonce?: string }): Promise<{
    identityToken: string | null;
    fullName: AppleFullNameLike | null;
    email: string | null;
  }>;
  AppleAuthenticationScope: { FULL_NAME: number; EMAIL: number };
}

/** @stability Beta */
export interface SignInWithAppleOptions {
  /**
   * SHA-256 of a string as lowercase hex, e.g.
   * `(s) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s)` from `expo-crypto`.
   * Apple gets the hash; Supabase gets the raw nonce and checks the token against it.
   */
  digest(value: string): Promise<string>;
  /** A fresh random nonce. Default: 32 bytes from `crypto.getRandomValues`, as hex (pass one, e.g. `Crypto.randomUUID`, where that's missing). */
  randomNonce?: () => string;
}

/** @stability Beta */
export type SignInWithAppleResult =
  | {
      session: Session;
      user: User;
      /** The name Apple shared. Apple sends it on the first sign-in only: save it then. */
      fullName: string | null;
      /** The email Apple shared (possibly a private relay address), on the first sign-in only. */
      email: string | null;
      canceled?: undefined;
      error?: undefined;
    }
  | { canceled: true; session?: undefined; error?: undefined }
  | { error: GenesisAuthError; session?: undefined; canceled?: undefined };

/**
 * Native Sign in with Apple straight into a Supabase session: checks the
 * device supports it, asks for name and email with a SHA-256 hashed nonce, and
 * signs in with the identity token. Closing Apple's sheet is `{ canceled: true }`,
 * not an error. Nothing is thrown; every failure is `{ error }`.
 *
 * @stability Beta
 */
export async function signInWithApple(
  client: SignInClient,
  apple: AppleAuthenticationLike,
  { digest, randomNonce = defaultNonce }: SignInWithAppleOptions,
): Promise<SignInWithAppleResult> {
  const unavailable = (cause?: unknown) => ({
    error: new GenesisAuthError("apple_unavailable", "Sign in with Apple isn't available on this device", cause),
  });
  try {
    if (!(await apple.isAvailableAsync())) return unavailable();
  } catch (e) {
    return unavailable(e);
  }
  let credential: Awaited<ReturnType<AppleAuthenticationLike["signInAsync"]>>;
  let nonce: string;
  try {
    nonce = randomNonce();
    credential = await apple.signInAsync({
      requestedScopes: [apple.AppleAuthenticationScope.FULL_NAME, apple.AppleAuthenticationScope.EMAIL],
      nonce: await digest(nonce),
    });
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === "ERR_REQUEST_CANCELED") return { canceled: true };
    return { error: new GenesisAuthError("apple_failed", e instanceof Error ? e.message : "Sign in with Apple failed", e) };
  }
  if (!credential.identityToken) return { error: new GenesisAuthError("apple_no_token", "Apple returned no identity token") };
  try {
    const { data, error } = await client.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce });
    if (error) return { error: new GenesisAuthError(error.code ?? "sign_in_failed", error.message, error) };
    if (!data.session || !data.user) return { error: new GenesisAuthError("no_session", "Sign-in returned no session") };
    return { session: data.session, user: data.user, fullName: formatFullName(credential.fullName), email: credential.email ?? null };
  } catch (e) {
    return { error: new GenesisAuthError("sign_in_failed", e instanceof Error ? e.message : "Sign-in failed", e) };
  }
}

/** "Given Middle Family", or null when Apple shared no name. */
export function formatFullName(name: AppleFullNameLike | null | undefined): string | null {
  if (!name) return null;
  return [name.givenName, name.middleName, name.familyName].map((p) => p?.trim()).filter(Boolean).join(" ") || null;
}

function defaultNonce(): string {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) throw new Error("[genesis] signInWithApple: no crypto.getRandomValues here; pass randomNonce (e.g. expo-crypto's randomUUID)");
  return Array.from(c.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}
