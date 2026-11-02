/**
 * Web sign-in on Supabase Auth, for genesis-ui's `AuthForm`: the calls each
 * of its modes makes (password, magic link, emailed code, sign-up, reset, new
 * password, providers) and the provider list read from the project's
 * `/auth/v1/settings`. Platform-neutral; native sign-in is on `/native`.
 */
import { isAuthError, type SupabaseClient } from "@supabase/supabase-js";

/** The parts of a Supabase client {@link createAuthFormClient} uses. A `SupabaseClient` fits. */
export interface AuthFormSupabase {
  auth: Pick<
    SupabaseClient["auth"],
    "signInWithPassword" | "signInWithOtp" | "verifyOtp" | "signUp" | "resetPasswordForEmail" | "updateUser" | "signInWithOAuth"
  >;
}

/**
 * Why a call failed: Supabase Auth's error `code` (`invalid_credentials`,
 * `otp_expired`, `over_email_send_rate_limit`…), `session_not_found` when
 * there is no session (`AuthSessionMissingError`), or `network` when the
 * request never got an answer. The shape genesis-ui's `AuthFormError` reads.
 * `message` is the server's text: the form never shows it (it is not marked
 * `displayable`), only reports it for a code it has no copy for.
 */
export interface AuthCallError {
  code?: string;
  message?: string;
}

/** What each call resolves with. Never throws. */
export interface AuthCallResult {
  error?: AuthCallError | null;
  /** From `signUp`: the account waits for its email to be confirmed. */
  confirmEmail?: boolean;
}

/**
 * The calls genesis-ui's `AuthForm` makes (its `AuthFormClient`), on Supabase Auth.
 *
 * @stability Beta
 */
export interface AuthFormSupabaseClient {
  signInWithPassword(input: { email: string; password: string }): Promise<AuthCallResult>;
  sendMagicLink(input: { email: string; createUser: boolean }): Promise<AuthCallResult>;
  sendEmailCode(input: { email: string; createUser: boolean }): Promise<AuthCallResult>;
  verifyEmailCode(input: { email: string; code: string }): Promise<AuthCallResult>;
  signUp(input: { email: string; password: string }): Promise<AuthCallResult>;
  sendPasswordReset(input: { email: string }): Promise<AuthCallResult>;
  updatePassword(input: { password: string }): Promise<AuthCallResult>;
  signInWithProvider(provider: string): Promise<AuthCallResult>;
  /** Present when `url` and `publishableKey` were given. */
  providers?(): Promise<string[]>;
}

/** @stability Beta */
export interface CreateAuthFormClientOptions {
  /** The project URL, with `publishableKey`: lets the form discover its providers. */
  url?: string;
  /** The publishable (anon) key. */
  publishableKey?: string;
  /**
   * Where a magic link, a sign-up confirmation and a provider come back to:
   * the app's callback route (`${origin}/auth/callback`). It must be in the
   * project's redirect allow list. Left out: the project's Site URL.
   */
  redirectTo?: string;
  /** Where the password-reset link opens: the page that shows `mode="new-password"`. Default `redirectTo`. */
  resetRedirectTo?: string;
  /** For the settings request. Default the global `fetch`. */
  fetch?: typeof fetch;
}

type SupabaseAuthResult = { data?: unknown; error: { code?: string | undefined; message: string; name?: string; status?: number | undefined } | null };

type SupabaseAuthError = NonNullable<SupabaseAuthResult["error"]>;

function toResult(e: SupabaseAuthError | null): AuthCallResult {
  if (!e) return {};
  // supabase-js answers a request that never reached Auth with AuthRetryableFetchError, status 0.
  const network = e.name === "AuthRetryableFetchError" || e.status === 0;
  // updateUser with no session: AuthSessionMissingError, which has no code.
  const missingSession = e.name === "AuthSessionMissingError";
  const code = e.code ?? (missingSession ? "session_not_found" : network ? "network" : undefined);
  return { error: { ...(code ? { code } : {}), message: e.message } };
}

async function call(run: () => Promise<SupabaseAuthResult>): Promise<AuthCallResult> {
  try {
    return toResult((await run()).error);
  } catch (e) {
    // A client made with `throwOnError: true` throws Auth's errors: read them like a returned one.
    if (isAuthError(e)) return toResult(e as SupabaseAuthError);
    return { error: { code: "network", message: e instanceof Error ? e.message : "The request failed" } };
  }
}

/**
 * genesis-ui's `AuthForm` client on Supabase Auth: password sign-in, magic
 * link and emailed code (`signInWithOtp`, the code checked with `verifyOtp`),
 * sign-up (`confirmEmail` when the project confirms emails), the reset email,
 * the new password (`updateUser`, on the session the reset link opened), and
 * OAuth providers (`signInWithOAuth`, which leaves the page). Every failure is
 * `{ error: { code, message } }`, never a throw, also on a client made with
 * `throwOnError: true`.
 *
 * It takes the app's client (from `createGenesisSupabase()`) and makes no
 * client of its own.
 *
 * Without sign-up (`createUser: false`), an email with no account is answered
 * like one with an account: the link or code is "sent". Saying otherwise would
 * tell anyone which emails have accounts.
 *
 * The new-password page: show `mode="new-password"` only after the client's
 * `PASSWORD_RECOVERY` event (`supabase.auth.onAuthStateChange`). Without the
 * session the reset link opened, `updatePassword` fails with
 * `session_not_found`.
 *
 * One email template serves the link and the code: Supabase sends the Magic
 * Link template for both, so a form offering `"email-code"` needs
 * `{{ .Token }}` in it (the default template has only the link).
 *
 * ```ts
 * const client = createAuthFormClient(supabase, {
 *   url: import.meta.env.VITE_SUPABASE_URL,
 *   publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
 *   redirectTo: `${location.origin}/auth/callback`,
 *   resetRedirectTo: `${location.origin}/auth/new-password`,
 * });
 * ```
 *
 * @stability Beta
 */
export function createAuthFormClient(supabase: AuthFormSupabase, options: CreateAuthFormClientOptions = {}): AuthFormSupabaseClient {
  const { url, publishableKey, redirectTo, resetRedirectTo = redirectTo } = options;
  const auth = supabase.auth;
  // Without sign-up, Auth refuses an unknown email with otp_disabled ("Signups not allowed for otp").
  // The client passes it on as it is; AuthForm answers it as sent, so it doesn't say which emails
  // have accounts (one place, for every client).
  const otp = (email: string, createUser: boolean): Promise<AuthCallResult> =>
    call(() =>
      auth.signInWithOtp({ email, options: { shouldCreateUser: createUser, ...(redirectTo ? { emailRedirectTo: redirectTo } : {}) } }),
    );
  const client: AuthFormSupabaseClient = {
    signInWithPassword: ({ email, password }) => call(() => auth.signInWithPassword({ email, password })),
    sendMagicLink: ({ email, createUser }) => otp(email, createUser),
    sendEmailCode: ({ email, createUser }) => otp(email, createUser),
    verifyEmailCode: ({ email, code }) => call(() => auth.verifyOtp({ email, token: code, type: "email" })),
    signUp: async ({ email, password }) => {
      let confirmEmail = false;
      const result = await call(async () => {
        const r = await auth.signUp({ email, password, ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}) });
        confirmEmail = !r.error && !r.data.session;
        return r;
      });
      return confirmEmail ? { ...result, confirmEmail } : result;
    },
    sendPasswordReset: ({ email }) =>
      call(() => auth.resetPasswordForEmail(email, resetRedirectTo ? { redirectTo: resetRedirectTo } : undefined)),
    updatePassword: ({ password }) => call(() => auth.updateUser({ password })),
    signInWithProvider: (provider) =>
      call(() =>
        auth.signInWithOAuth({
          provider: provider as Parameters<typeof auth.signInWithOAuth>[0]["provider"],
          ...(redirectTo ? { options: { redirectTo } } : {}),
        }),
      ),
  };
  if (url && publishableKey) {
    // Asked once per client: the form may mount many times, the project's providers don't change.
    let providers: Promise<string[]> | undefined;
    client.providers = () => {
      providers ??= fetchAuthSettings({ url, publishableKey, ...(options.fetch ? { fetch: options.fetch } : {}) }).then(
        (settings) => settings.providers,
        (e: unknown) => {
          providers = undefined; // a failed lookup can be tried again
          throw e;
        },
      );
      return providers;
    };
  }
  return client;
}

/** What a project's Auth allows, from `/auth/v1/settings`. */
export interface AuthSettings {
  /** The OAuth providers turned on, as `signInWithOAuth` names them (`"google"`, `"apple"`…), sorted. */
  providers: string[];
  /** Email sign-in (password, link or code) is on. */
  email: boolean;
  /** Phone sign-in is on. */
  phone: boolean;
  /** New accounts are refused. */
  signUpDisabled: boolean;
  /** Emails are confirmed without a link. */
  autoConfirm: boolean;
}

/**
 * The OAuth providers `fetchAuthSettings` reports: the ones `signInWithOAuth`
 * takes and genesis-ui's `AUTH_PROVIDER_NAMES` names. Any other key of the
 * settings' `external` (`email`, `phone`, `saml`, `web3_*`…) isn't a button.
 *
 * @stability Beta
 */
export const SUPABASE_OAUTH_PROVIDERS: readonly string[] = [
  "apple",
  "azure",
  "bitbucket",
  "discord",
  "facebook",
  "figma",
  "github",
  "gitlab",
  "google",
  "kakao",
  "keycloak",
  "linkedin_oidc",
  "notion",
  "slack_oidc",
  "spotify",
  "twitch",
  "twitter",
  "workos",
  "zoom",
];
const OAUTH_PROVIDERS = new Set(SUPABASE_OAUTH_PROVIDERS);

/** How long the settings request may take. */
const SETTINGS_TIMEOUT_MS = 5000;

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

/**
 * Reads a project's public Auth settings (`GET <url>/auth/v1/settings` with
 * the publishable key): which OAuth providers are on, whether email and phone
 * sign-in are, and whether sign-up is closed. Throws when the request fails,
 * takes over 5 seconds or `signal` aborts it, and refuses a secret key
 * (`sb_secret_…`), which must never reach a browser.
 *
 * @stability Beta
 */
export async function fetchAuthSettings({
  url,
  publishableKey,
  fetch: fetcher = globalThis.fetch,
  signal,
}: {
  url: string;
  publishableKey: string;
  fetch?: typeof fetch;
  /** Cancels the request (an unmounting form, say). */
  signal?: AbortSignal;
}): Promise<AuthSettings> {
  if (publishableKey.startsWith("sb_secret_")) {
    throw new Error("fetchAuthSettings takes the publishable key, not a secret key (sb_secret_…)");
  }
  // A controller and a timer rather than AbortSignal.timeout/any, which older Safari and React
  // Native's Hermes lack.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const timedOut = new Error("Supabase Auth settings: timed out");
    timedOut.name = "TimeoutError";
    controller.abort(timedOut);
  }, SETTINGS_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let response: Response;
  try {
    response = await fetcher(`${withoutTrailingSlashes(url)}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) throw new Error(`Supabase Auth settings: ${response.status}`);
  const body = (await response.json()) as {
    external?: Record<string, unknown>;
    disable_signup?: unknown;
    mailer_autoconfirm?: unknown;
  };
  const external = body.external ?? {};
  return {
    providers: Object.keys(external)
      .filter((key) => external[key] === true && OAUTH_PROVIDERS.has(key))
      .sort(),
    email: external.email === true,
    phone: external.phone === true,
    signUpDisabled: body.disable_signup === true,
    autoConfirm: body.mailer_autoconfirm === true,
  };
}
