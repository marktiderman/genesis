import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createAuthFormClient, fetchAuthSettings, type AuthFormSupabase } from "../auth-form-client";

function fakeSupabase(overrides: Partial<Record<keyof AuthFormSupabase["auth"], unknown>> = {}) {
  const ok = () => Promise.resolve({ data: { session: { access_token: "t" }, user: { id: "u" } }, error: null });
  const auth = {
    signInWithPassword: vi.fn(ok),
    signInWithOtp: vi.fn(ok),
    verifyOtp: vi.fn(ok),
    signUp: vi.fn(ok),
    resetPasswordForEmail: vi.fn(ok),
    updateUser: vi.fn(ok),
    signInWithOAuth: vi.fn(ok),
    ...overrides,
  };
  return { auth } as unknown as AuthFormSupabase & { auth: Record<string, ReturnType<typeof vi.fn>> };
}

describe("createAuthFormClient", () => {
  it("makes each mode's Supabase Auth call with the redirects", async () => {
    const supabase = fakeSupabase();
    const client = createAuthFormClient(supabase, { redirectTo: "https://acme.test/auth/callback", resetRedirectTo: "https://acme.test/reset" });

    expect(await client.signInWithPassword({ email: "a@acme.test", password: "pw" })).toEqual({});
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@acme.test", password: "pw" });

    await client.sendMagicLink({ email: "a@acme.test", createUser: false });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "a@acme.test",
      options: { shouldCreateUser: false, emailRedirectTo: "https://acme.test/auth/callback" },
    });

    await client.sendEmailCode({ email: "a@acme.test", createUser: true });
    expect(supabase.auth.signInWithOtp).toHaveBeenLastCalledWith({
      email: "a@acme.test",
      options: { shouldCreateUser: true, emailRedirectTo: "https://acme.test/auth/callback" },
    });

    await client.verifyEmailCode({ email: "a@acme.test", code: "123456" });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@acme.test", token: "123456", type: "email" });

    await client.sendPasswordReset({ email: "a@acme.test" });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@acme.test", { redirectTo: "https://acme.test/reset" });

    await client.updatePassword({ password: "new-password" });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });

    await client.signInWithProvider("google");
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://acme.test/auth/callback" } });
  });

  it("sends providers where providerRedirectTo says, with providerQueryParams, per provider", async () => {
    const supabase = fakeSupabase();
    const client = createAuthFormClient(supabase, {
      redirectTo: "https://acme.test/auth/callback",
      providerRedirectTo: (provider) => (provider === "apple" ? "https://acme.test/auth/apple" : undefined),
      providerQueryParams: (provider) => (provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined),
    });
    await client.signInWithProvider("google");
    expect(supabase.auth.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: "google",
      options: { redirectTo: "https://acme.test/auth/callback", queryParams: { access_type: "offline", prompt: "consent" } },
    });
    await client.signInWithProvider("apple");
    expect(supabase.auth.signInWithOAuth).toHaveBeenLastCalledWith({ provider: "apple", options: { redirectTo: "https://acme.test/auth/apple" } });

    const fixed = createAuthFormClient(supabase, { providerRedirectTo: "https://acme.test/oauth", providerQueryParams: { hd: "acme.test" } });
    await fixed.signInWithProvider("google");
    expect(supabase.auth.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: "google",
      options: { redirectTo: "https://acme.test/oauth", queryParams: { hd: "acme.test" } },
    });
    // providerRedirectTo leaves the emailed links on redirectTo.
    const both = createAuthFormClient(supabase, { redirectTo: "https://acme.test/auth/callback", providerRedirectTo: "https://acme.test/oauth" });
    await both.sendMagicLink({ email: "a@acme.test", createUser: true });
    expect(supabase.auth.signInWithOtp).toHaveBeenLastCalledWith({
      email: "a@acme.test",
      options: { shouldCreateUser: true, emailRedirectTo: "https://acme.test/auth/callback" },
    });
  });

  it("sends the emailed links to emailRedirectTo, the reset link too unless resetRedirectTo says otherwise", async () => {
    const supabase = fakeSupabase();
    const client = createAuthFormClient(supabase, { redirectTo: "https://acme.test/auth/callback", emailRedirectTo: "https://acme.test/auth/confirm" });
    await client.signUp({ email: "a@acme.test", password: "longenough" });
    expect(supabase.auth.signUp).toHaveBeenLastCalledWith({
      email: "a@acme.test",
      password: "longenough",
      options: { emailRedirectTo: "https://acme.test/auth/confirm" },
    });
    await client.sendPasswordReset({ email: "a@acme.test" });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenLastCalledWith("a@acme.test", { redirectTo: "https://acme.test/auth/confirm" });
    await client.signInWithProvider("google");
    expect(supabase.auth.signInWithOAuth).toHaveBeenLastCalledWith({ provider: "google", options: { redirectTo: "https://acme.test/auth/callback" } });
  });

  it("passes sign-up's data as the user's metadata", async () => {
    const supabase = fakeSupabase();
    const client = createAuthFormClient(supabase, { redirectTo: "https://acme.test/auth/callback" });
    await client.signUp({ email: "a@acme.test", password: "longenough", data: { full_name: "Sam Lee" } });
    expect(supabase.auth.signUp).toHaveBeenLastCalledWith({
      email: "a@acme.test",
      password: "longenough",
      options: { emailRedirectTo: "https://acme.test/auth/callback", data: { full_name: "Sam Lee" } },
    });
  });

  it("sends and checks a code by text message", async () => {
    const supabase = fakeSupabase();
    const client = createAuthFormClient(supabase, { redirectTo: "https://acme.test/auth/callback" });
    expect(await client.sendPhoneCode({ phone: "+15551234567", createUser: false })).toEqual({});
    expect(supabase.auth.signInWithOtp).toHaveBeenLastCalledWith({ phone: "+15551234567", options: { shouldCreateUser: false } });
    expect(await client.verifyPhoneCode({ phone: "+15551234567", code: "123456" })).toEqual({});
    expect(supabase.auth.verifyOtp).toHaveBeenLastCalledWith({ phone: "+15551234567", token: "123456", type: "sms" });
  });

  it("reads the signed-in email from the session, when the client has getSession", async () => {
    expect(createAuthFormClient(fakeSupabase()).currentEmail).toBeUndefined();
    const withSession = fakeSupabase({
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { email: "a@acme.test" } } }, error: null })),
    });
    expect(await createAuthFormClient(withSession).currentEmail?.()).toBe("a@acme.test");
    const noSession = fakeSupabase({ getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) });
    expect(await createAuthFormClient(noSession).currentEmail?.()).toBeNull();
    const throwing = fakeSupabase({ getSession: vi.fn(() => Promise.reject(new Error("storage"))) });
    expect(await createAuthFormClient(throwing).currentEmail?.()).toBeNull();
  });

  it("says when a sign-up waits for its email to be confirmed", async () => {
    const supabase = fakeSupabase({ signUp: vi.fn(() => Promise.resolve({ data: { user: { id: "u" }, session: null }, error: null })) });
    const client = createAuthFormClient(supabase);
    expect(await client.signUp({ email: "a@acme.test", password: "longenough" })).toEqual({ confirmEmail: true });
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: "a@acme.test", password: "longenough" });
  });

  it("returns Auth's error code, and network for a request that never got an answer, without throwing", async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi.fn(() =>
        Promise.resolve({ data: { session: null, user: null }, error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } }),
      ),
      verifyOtp: vi.fn(() => Promise.resolve({ data: {}, error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 } })),
      updateUser: vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    });
    const client = createAuthFormClient(supabase);
    expect(await client.signInWithPassword({ email: "a@acme.test", password: "x" })).toEqual({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    expect(await client.verifyEmailCode({ email: "a@acme.test", code: "000000" })).toEqual({ error: { code: "network", message: "Failed to fetch" } });
    expect(await client.updatePassword({ password: "x" })).toEqual({ error: { code: "network", message: "Failed to fetch" } });
  });

  it("reads Auth's errors from a client made with throwOnError, and network only for anything else", async () => {
    const supabase = fakeSupabase({
      signInWithPassword: vi.fn(() => Promise.reject(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"))),
      signUp: vi.fn(() => Promise.reject(new Error("socket hang up"))),
    });
    const client = createAuthFormClient(supabase);
    expect(await client.signInWithPassword({ email: "a@acme.test", password: "x" })).toEqual({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    expect(await client.signUp({ email: "a@acme.test", password: "longenough" })).toEqual({ error: { code: "network", message: "socket hang up" } });
  });

  it("answers a new password with no session as session_not_found, returned or thrown", async () => {
    const returned = fakeSupabase({ updateUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: new AuthSessionMissingError() })) });
    expect((await createAuthFormClient(returned).updatePassword({ password: "x" })).error?.code).toBe("session_not_found");
    const thrown = fakeSupabase({ updateUser: vi.fn(() => Promise.reject(new AuthSessionMissingError())) });
    expect((await createAuthFormClient(thrown).updatePassword({ password: "x" })).error?.code).toBe("session_not_found");
  });

  it("passes otp_disabled on as it is (AuthForm decides what to show)", async () => {
    const refused = () => Promise.resolve({ data: {}, error: { code: "otp_disabled", message: "Signups not allowed for otp", status: 422 } });
    const client = createAuthFormClient(fakeSupabase({ signInWithOtp: vi.fn(refused) }));
    expect((await client.sendMagicLink({ email: "nobody@acme.test", createUser: false })).error?.code).toBe("otp_disabled");
    expect((await client.sendEmailCode({ email: "nobody@acme.test", createUser: true })).error?.code).toBe("otp_disabled");
  });

  it("discovers providers only with the project URL and key, asking once per client", async () => {
    expect(createAuthFormClient(fakeSupabase()).providers).toBeUndefined();
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ external: { google: true, email: true } }))));
    const client = createAuthFormClient(fakeSupabase(), { url: "https://p.supabase.co", publishableKey: "pk", fetch: fetcher as typeof fetch });
    expect(await client.providers!()).toEqual(["google"]);
    expect(await client.providers!()).toEqual(["google"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed lookup", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ external: { github: true } })));
    const client = createAuthFormClient(fakeSupabase(), { url: "https://p.supabase.co", publishableKey: "pk", fetch: fetcher as unknown as typeof fetch });
    await expect(client.providers!()).rejects.toThrow("503");
    expect(await client.providers!()).toEqual(["github"]);
  });
});

describe("fetchAuthSettings", () => {
  it("reads the OAuth providers turned on, leaving out email, phone, anonymous, SAML, Web3 and unknown keys", async () => {
    const fetcher = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            external: {
              apple: true,
              github: false,
              google: true,
              email: true,
              phone: false,
              anonymous_users: true,
              saml: true,
              azure: true,
              web3_solana: true,
              web3_ethereum: true,
              something_new: true,
            },
            disable_signup: true,
            mailer_autoconfirm: false,
          }),
        ),
      ),
    );
    const settings = await fetchAuthSettings({ url: "https://p.supabase.co//", publishableKey: "pk", fetch: fetcher as unknown as typeof fetch });
    expect(fetcher).toHaveBeenCalledWith("https://p.supabase.co/auth/v1/settings", { headers: { apikey: "pk" }, signal: expect.any(AbortSignal) });
    expect(settings).toEqual({ providers: ["apple", "azure", "google"], email: true, phone: false, signUpDisabled: true, autoConfirm: false });
  });

  it("throws on a failed request", async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response("nope", { status: 401 })));
    await expect(fetchAuthSettings({ url: "https://p.supabase.co", publishableKey: "pk", fetch: fetcher as unknown as typeof fetch })).rejects.toThrow("401");
  });

  it("refuses a secret key without sending it", async () => {
    const fetcher = vi.fn();
    await expect(
      fetchAuthSettings({ url: "https://p.supabase.co", publishableKey: "sb_secret_abc", fetch: fetcher as unknown as typeof fetch }),
    ).rejects.toThrow("secret key");
    expect(fetcher).not.toHaveBeenCalled();
  });

  /** A fetch that answers only when its signal aborts, as the real one does. */
  const hanging = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      }),
  );

  it("gives up after 5 seconds, on a plain timer (no AbortSignal.timeout or any)", async () => {
    vi.useFakeTimers();
    try {
      const settings = fetchAuthSettings({ url: "https://p.supabase.co", publishableKey: "pk", fetch: hanging as unknown as typeof fetch });
      const failed = expect(settings).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(4999);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await failed;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears its timer once the answer comes", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ external: {} }))));
      await fetchAuthSettings({ url: "https://p.supabase.co", publishableKey: "pk", fetch: fetcher as unknown as typeof fetch });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when the caller's signal aborts", async () => {
    const controller = new AbortController();
    const settings = fetchAuthSettings({ url: "https://p.supabase.co", publishableKey: "pk", fetch: hanging as unknown as typeof fetch, signal: controller.signal });
    controller.abort();
    await expect(settings).rejects.toMatchObject({ name: "AbortError" });
  });
});
