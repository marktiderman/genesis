import type { AuthFormClient } from "@marktiderman/genesis-ui/patterns";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthFormClient, fetchAuthSettings, type AuthFormSupabase, type AuthFormSupabaseClient } from "../auth-form-client";

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

  it("discovers providers only with the project URL and key", async () => {
    expect(createAuthFormClient(fakeSupabase()).providers).toBeUndefined();
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ external: { google: true, email: true } }))));
    const client = createAuthFormClient(fakeSupabase(), { url: "https://p.supabase.co", publishableKey: "pk", fetch: fetcher as typeof fetch });
    expect(await client.providers!()).toEqual(["google"]);
  });
});

describe("fetchAuthSettings", () => {
  it("reads the providers turned on, leaving out email, phone, anonymous and SAML", async () => {
    const fetcher = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            external: { apple: true, github: false, google: true, email: true, phone: false, anonymous_users: true, saml: true, azure: true },
            disable_signup: true,
            mailer_autoconfirm: false,
          }),
        ),
      ),
    );
    const settings = await fetchAuthSettings({ url: "https://p.supabase.co/", publishableKey: "pk", fetch: fetcher as unknown as typeof fetch });
    expect(fetcher).toHaveBeenCalledWith("https://p.supabase.co/auth/v1/settings", { headers: { apikey: "pk" } });
    expect(settings).toEqual({ providers: ["apple", "azure", "google"], email: true, phone: false, signUpDisabled: true, autoConfirm: false });
  });

  it("throws on a failed request", async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response("nope", { status: 401 })));
    await expect(fetchAuthSettings({ url: "https://p.supabase.co", publishableKey: "pk", fetch: fetcher as unknown as typeof fetch })).rejects.toThrow("401");
  });
});

describe("AuthFormSupabaseClient", () => {
  it("is the AuthFormClient genesis-ui's AuthForm takes", () => {
    expectTypeOf<AuthFormSupabaseClient>().toExtend<AuthFormClient>();
  });
});
