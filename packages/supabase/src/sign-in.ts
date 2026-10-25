/**
 * Native sign-in onto a Supabase session: finishing an OAuth redirect (PKCE),
 * Sign in with Apple and native Google sign-in. Nothing here imports Expo or
 * the Google module: pass the modules in.
 * Exported from `@marktiderman/genesis-supabase/native`.
 */
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Why a sign-in didn't produce a session. `code` is the provider's error
 * (`access_denied`…), Supabase Auth's error code, or one of Genesis's own:
 * `missing_code` (the redirect carried neither a code nor an error),
 * `oauth_error`, `exchange_failed`, `apple_unavailable`, `apple_failed`,
 * `apple_no_token`, `google_failed`, `google_no_token`,
 * `google_nonce_missing`, `bad_digest`, `sign_in_failed`, `no_session`.
 *
 * @stability Beta
 */
export class GenesisAuthError extends Error {
  override name = "GenesisAuthError";
  readonly code: string;
  /**
   * The provider's own `error_description`, as it came in the redirect.
   * UNTRUSTED: any app or web page can open your callback link with any text
   * here, so never show it as an official message. Log it; show `message`.
   */
  readonly providerMessage?: string;
  constructor(code: string, message: string, options: { cause?: unknown; providerMessage?: string } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    if (options.providerMessage !== undefined) this.providerMessage = options.providerMessage;
  }
}

/** Fixed, safe copy for the redirect errors an app is likely to see; anything else gets the fallback. */
const REDIRECT_MESSAGES: Record<string, string> = {
  access_denied: "Sign-in was canceled or not allowed.",
  otp_expired: "That sign-in link has expired. Ask for a new one.",
  flow_state_expired: "That sign-in took too long. Try again.",
  flow_state_not_found: "That sign-in has already been used or has expired. Try again.",
  bad_oauth_state: "That sign-in couldn't be checked. Try again.",
  bad_oauth_callback: "That sign-in couldn't be checked. Try again.",
  provider_email_needs_verification: "Verify your email with the provider, then try again.",
  server_error: "The sign-in service had a problem. Try again.",
  temporarily_unavailable: "The sign-in service is busy. Try again in a moment.",
};
const REDIRECT_FALLBACK = "Sign-in didn't complete. Try again.";

/** The parts of a Supabase client the sign-in helpers use. A `SupabaseClient` fits. */
export interface SignInClient {
  auth: Pick<SupabaseClient["auth"], "exchangeCodeForSession" | "signInWithIdToken">;
}

/** @stability Beta */
export type OAuthRedirectResult =
  | {
      session: Session;
      /** `"recovery"` after a password-reset link (send them to set a new password), otherwise `null`. */
      redirectType: string | null;
      error?: undefined;
    }
  | { session?: undefined; redirectType?: undefined; error: GenesisAuthError };

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/**
 * The query and fragment parameters of a URL (the query wins for a key in
 * both). Hand-parsed: React Native's `URL` has no reliable `searchParams`.
 */
export function redirectParams(url: string): Record<string, string> {
  const params: Record<string, string> = Object.create(null);
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
      if (!hasOwn(params, key)) params[key] =decode(eq >= 0 ? pair.slice(eq + 1) : "");
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
 * Finish an OAuth sign-in from the URL the browser came back to. With a `code`
 * it exchanges it for a session (PKCE: the verifier is already in the client's
 * storage), passing the redirect's `sb_flow_id` so the right flow's verifier
 * is used; with an `error` it returns that error and makes no request.
 * Nothing is thrown; every failure is `{ error }`.
 *
 * Pass only the URL `WebBrowser.openAuthSessionAsync` resolved with, for the
 * sign-in this app just started. A code is single-use and the exchange uses
 * up the stored verifier whatever happens, so a stray `?code=` from another
 * link spends the sign-in in progress, and handling the same redirect twice
 * (the auth-session result and a `Linking` listener) fails the second time.
 * Handle each redirect once.
 *
 * The error `message` is fixed copy chosen by `code`; the redirect's own text
 * is only in `providerMessage`, which is untrusted.
 *
 * @stability Beta
 */
export async function completeOAuthRedirect(client: SignInClient, url: string): Promise<OAuthRedirectResult> {
  const params = redirectParams(url);
  if (params.error || params.error_description || params.error_code) {
    const code = params.error_code || params.error || "oauth_error";
    const message = REDIRECT_MESSAGES[code] ?? (params.error ? REDIRECT_MESSAGES[params.error] : undefined) ?? REDIRECT_FALLBACK;
    return { error: new GenesisAuthError(code, message, { providerMessage: params.error_description || undefined }) };
  }
  if (!params.code) return { error: new GenesisAuthError("missing_code", "The sign-in redirect carried no code") };
  try {
    const { data, error } = await client.auth.exchangeCodeForSession(
      params.code,
      params.sb_flow_id ? { flowId: params.sb_flow_id } : undefined,
    );
    if (error) return { error: new GenesisAuthError(error.code ?? "exchange_failed", error.message, { cause: error }) };
    if (!data.session) return { error: new GenesisAuthError("no_session", "The code exchange returned no session") };
    // supabase-js returns redirectType at run time without typing it.
    const redirectType = (data as { redirectType?: string | null }).redirectType ?? null;
    return { session: data.session, redirectType };
  } catch (e) {
    return { error: new GenesisAuthError("exchange_failed", e instanceof Error ? e.message : "The code exchange failed", { cause: e }) };
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
    /** Single-use, valid about five minutes: what a server exchanges for the Apple refresh token it revokes on deletion. */
    authorizationCode: string | null;
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
  /**
   * A fresh random nonce. Default: 32 bytes from `crypto.getRandomValues`, as
   * hex. On React Native that is the expo-crypto polyfill
   * `createGenesisSupabase({ platform: "native", crypto })` installs; leave
   * this out rather than pass something with less randomness.
   */
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
      /**
       * Apple's single-use authorization code (valid about five minutes). Send it
       * to your server straight away: it exchanges it for the Apple refresh token
       * that account deletion must revoke. See the README.
       */
      authorizationCode: string | null;
      canceled?: undefined;
      error?: undefined;
    }
  | { canceled: true; session?: undefined; error?: undefined }
  | {
      error: GenesisAuthError;
      /** When Apple shared a name but Supabase then refused: Apple won't send it again, so keep it for the retry. */
      fullName?: string | null;
      session?: undefined;
      canceled?: undefined;
    };

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
    error: new GenesisAuthError("apple_unavailable", "Sign in with Apple isn't available on this device", { cause }),
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
    const hashed = await digest(nonce);
    if (!/^[0-9a-f]{64}$/.test(hashed)) {
      return { error: new GenesisAuthError("bad_digest", "signInWithApple: digest must return SHA-256 as 64 lowercase hex characters") };
    }
    credential = await apple.signInAsync({
      requestedScopes: [apple.AppleAuthenticationScope.FULL_NAME, apple.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === "ERR_REQUEST_CANCELED") return { canceled: true };
    return { error: new GenesisAuthError("apple_failed", e instanceof Error ? e.message : "Sign in with Apple failed", { cause: e }) };
  }
  const fullName = formatFullName(credential.fullName);
  if (!credential.identityToken) return { error: new GenesisAuthError("apple_no_token", "Apple returned no identity token"), fullName };
  try {
    const { data, error } = await client.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce });
    if (error) return { error: new GenesisAuthError(error.code ?? "sign_in_failed", error.message, { cause: error }), fullName };
    if (!data.session || !data.user) return { error: new GenesisAuthError("no_session", "Sign-in returned no session"), fullName };
    return {
      session: data.session,
      user: data.user,
      fullName,
      email: credential.email ?? null,
      authorizationCode: credential.authorizationCode ?? null,
    };
  } catch (e) {
    return { error: new GenesisAuthError("sign_in_failed", e instanceof Error ? e.message : "Sign-in failed", { cause: e }), fullName };
  }
}

/**
 * The part of `@react-native-google-signin/google-signin` that
 * {@link signInWithGoogle} uses: its Universal sign-in module,
 * `GoogleOneTapSignIn`, configured (`configure({ webClientId, iosClientId })`)
 * before the first sign-in. Pass the module itself.
 *
 * Only Universal sign-in passes a nonce into the ID token on Android and iOS.
 * The free package's original `GoogleSignin.signIn` can't (its `nonce` is iOS
 * and paid-version only), so its tokens fail the nonce check below.
 */
export interface GoogleSignInLike {
  authenticate(params?: { nonce?: string }): Promise<{
    user?: { idToken?: string | null; user?: { email?: string | null; name?: string | null } | null } | null;
    error?: { code?: string | number; message?: string } | null;
    isCancelled?: boolean;
  }>;
}

/** @stability Beta */
export interface SignInWithGoogleOptions {
  /** SHA-256 of a string as lowercase hex, as for {@link signInWithApple}. Google gets the hash; Supabase gets the raw nonce. */
  digest(value: string): Promise<string>;
  /** A fresh random nonce. Default: 32 bytes from `crypto.getRandomValues`, as hex. */
  randomNonce?: () => string;
}

/** @stability Beta */
export type SignInWithGoogleResult =
  | {
      session: Session;
      user: User;
      /** The name Google shared, if any. */
      fullName: string | null;
      email: string | null;
      canceled?: undefined;
      error?: undefined;
    }
  | { canceled: true; session?: undefined; error?: undefined }
  | { error: GenesisAuthError; session?: undefined; canceled?: undefined };

/**
 * Native Google sign-in straight into a Supabase session, as Supabase's
 * Google guide describes: a fresh random nonce, its SHA-256 (hex) to Google,
 * which puts it in the ID token, and the raw nonce to `signInWithIdToken`,
 * which checks the two match, so a token minted for another sign-in, which
 * carries that sign-in's nonce, can't be replayed through this app. Before
 * Supabase sees the token it is checked here too: a token whose `nonce` claim
 * isn't this sign-in's hash (a module that ignored the nonce) is
 * `google_nonce_missing`, never sent. Closing Google's sheet is
 * `{ canceled: true }`. Nothing is thrown; every failure is `{ error }`.
 *
 * Keep the Supabase Google provider's "Skip nonce check" off: this helper
 * needs no exception, and turning it on lets a stolen nonce-bearing ID token
 * sign in. What a nonce can't stop: Supabase still accepts an ID token with
 * no nonce claim when the caller sends none, so a stolen nonce-less token for
 * one of your client ids signs in through a direct API call whatever the app
 * does. Keep the "Authorized Client IDs" list to your own apps.
 *
 * @stability Beta
 */
export async function signInWithGoogle(
  client: SignInClient,
  google: GoogleSignInLike,
  { digest, randomNonce = defaultNonce }: SignInWithGoogleOptions,
): Promise<SignInWithGoogleResult> {
  let nonce: string;
  let hashed: string;
  let response: Awaited<ReturnType<GoogleSignInLike["authenticate"]>>;
  try {
    nonce = randomNonce();
    hashed = await digest(nonce);
    if (!/^[0-9a-f]{64}$/.test(hashed)) {
      return { error: new GenesisAuthError("bad_digest", "signInWithGoogle: digest must return SHA-256 as 64 lowercase hex characters") };
    }
    response = await google.authenticate({ nonce: hashed });
  } catch (e) {
    return { error: new GenesisAuthError("google_failed", e instanceof Error ? e.message : "Google sign-in failed", { cause: e }) };
  }
  if (response.isCancelled) return { canceled: true };
  if (response.error) {
    return { error: new GenesisAuthError("google_failed", response.error.message ?? `Google sign-in failed (${String(response.error.code ?? "unknown")})`, { cause: response.error }) };
  }
  const token = response.user?.idToken;
  if (!token) return { error: new GenesisAuthError("google_no_token", "Google returned no ID token") };
  if (jwtClaim(token, "nonce") !== hashed) {
    return {
      error: new GenesisAuthError(
        "google_nonce_missing",
        "Google's ID token doesn't carry this sign-in's nonce. Use the Universal sign-in module (GoogleOneTapSignIn) of @react-native-google-signin/google-signin; the original GoogleSignin can't pass one.",
      ),
    };
  }
  try {
    const { data, error } = await client.auth.signInWithIdToken({ provider: "google", token, nonce });
    if (error) return { error: new GenesisAuthError(error.code ?? "sign_in_failed", error.message, { cause: error }) };
    if (!data.session || !data.user) return { error: new GenesisAuthError("no_session", "Sign-in returned no session") };
    const profile = response.user?.user;
    return { session: data.session, user: data.user, fullName: profile?.name?.trim() || null, email: profile?.email ?? null };
  } catch (e) {
    return { error: new GenesisAuthError("sign_in_failed", e instanceof Error ? e.message : "Sign-in failed", { cause: e }) };
  }
}

/** One string claim of a JWT's payload, unverified (Supabase verifies the signature), or undefined. */
function jwtClaim(token: string, claim: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const value: unknown = JSON.parse(decodeBase64Url(payload))?.[claim];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url to a UTF-8 string, without atob, Buffer or TextDecoder (not on every React Native runtime). */
function decodeBase64Url(input: string): string {
  let escaped = "";
  let buffer = 0;
  let bits = 0;
  for (const ch of input.replace(/=+$/, "")) {
    const v = B64.indexOf(ch === "+" ? "-" : ch === "/" ? "_" : ch);
    if (v < 0) throw new Error("not base64url");
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      escaped += `%${((buffer >> bits) & 0xff).toString(16).padStart(2, "0")}`;
      buffer &= (1 << bits) - 1;
    }
  }
  return decodeURIComponent(escaped);
}

/** "Given Middle Family", or null when Apple shared no name. */
export function formatFullName(name: AppleFullNameLike | null | undefined): string | null {
  if (!name) return null;
  return [name.givenName, name.middleName, name.familyName].map((p) => p?.trim()).filter(Boolean).join(" ") || null;
}

function defaultNonce(): string {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  // A nonce is a secret: no fallback to anything weaker than the platform's CSPRNG.
  if (!c?.getRandomValues) throw new Error("[genesis] sign-in nonce: no crypto.getRandomValues here; install react-native-get-random-values or expo-crypto's getRandomValues polyfill, or pass randomNonce returning 32 random bytes");
  return Array.from(c.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}
