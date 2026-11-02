/**
 * Web sign-in on Supabase Auth, for genesis-ui's `AuthForm`: the calls each
 * of its modes makes (password, magic link, emailed code, sign-up, reset, new
 * password, providers) and the provider list read from the project's
 * `/auth/v1/settings`. Platform-neutral; native sign-in is on `/native`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** The parts of a Supabase client {@link createAuthFormClient} uses. A `SupabaseClient` fits. */
export interface AuthFormSupabase {
  auth: Pick<
    SupabaseClient["auth"],
    "signInWithPassword" | "signInWithOtp" | "verifyOtp" | "signUp" | "resetPasswordForEmail" | "updateUser" | "signInWithOAuth"
  >;
}

/**
 * Why a call failed: Supabase Auth's error `code` (`invalid_credentials`,
 * `otp_expired`, `over_email_send_rate_limit`…), or `network` when the
 * request never got an answer. The shape genesis-ui's `AuthFormError` reads.
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

function toResult(result: SupabaseAuthResult): AuthCallResult {
  const e = result.error;
  if (!e) return {};
  // supabase-js answers a request that never reached Auth with AuthRetryableFetchError, status 0.
  const network = e.name === "AuthRetryableFetchError" || e.status === 0;
  const code = e.code ?? (network ? "network" : undefined);
  return { error: { ...(code ? { code } : {}), message: e.message } };
}

async function call(run: () => Promise<SupabaseAuthResult>): Promise<AuthCallResult> {
  try {
    return toResult(await run());
  } catch (e) {
    return { error: { code: "network", message: e instanceof Error ? e.message : "The request failed" } };
  }
}

/**
 * genesis-ui's `AuthForm` client on Supabase Auth: password sign-in, magic
 * link and emailed code (`signInWithOtp`, the code checked with `verifyOtp`),
 * sign-up (`confirmEmail` when the project confirms emails), the reset email,
 * the new password (`updateUser`, on the session the reset link opened), and
 * OAuth providers (`signInWithOAuth`, which leaves the page). Every failure is
 * `{ error: { code, message } }`, never a throw.
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
  const otp = (email: string, createUser: boolean) =>
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
    client.providers = async () => (await fetchAuthSettings({ url, publishableKey, ...(options.fetch ? { fetch: options.fetch } : {}) })).providers;
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

/** Keys of `external` that aren't OAuth providers. */
const NOT_PROVIDERS = new Set(["email", "phone", "anonymous_users", "saml"]);

/**
 * Reads a project's public Auth settings (`GET <url>/auth/v1/settings` with
 * the publishable key): which OAuth providers are on, whether email and phone
 * sign-in are, and whether sign-up is closed. Throws when the request fails.
 *
 * @stability Beta
 */
export async function fetchAuthSettings({
  url,
  publishableKey,
  fetch: fetcher = globalThis.fetch,
}: {
  url: string;
  publishableKey: string;
  fetch?: typeof fetch;
}): Promise<AuthSettings> {
  const response = await fetcher(`${url.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: publishableKey } });
  if (!response.ok) throw new Error(`Supabase Auth settings: ${response.status}`);
  const body = (await response.json()) as {
    external?: Record<string, unknown>;
    disable_signup?: unknown;
    mailer_autoconfirm?: unknown;
  };
  const external = body.external ?? {};
  return {
    providers: Object.keys(external)
      .filter((key) => external[key] === true && !NOT_PROVIDERS.has(key))
      .sort(),
    email: external.email === true,
    phone: external.phone === true,
    signUpDisabled: body.disable_signup === true,
    autoConfirm: body.mailer_autoconfirm === true,
  };
}
