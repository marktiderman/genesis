// @feat:account
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { completeOAuthRedirect, redirectParams, signInWithApple, type AppleAuthenticationLike, type SignInClient } from "../native";
import { deleteMyAccount, SupabaseQueryError } from "../index";

const session = { access_token: "at", refresh_token: "rt", user: { id: "u1" } };

function fakeClient(overrides: Partial<Record<"exchange" | "idToken", unknown>> = {}) {
  const exchangeCodeForSession = vi.fn(async (_code: string) => overrides.exchange ?? { data: { session, user: session.user }, error: null });
  const signInWithIdToken = vi.fn(async (_creds: { provider: string; token: string; nonce?: string }) =>
    overrides.idToken ?? { data: { session, user: session.user }, error: null },
  );
  return { client: { auth: { exchangeCodeForSession, signInWithIdToken } } as unknown as SignInClient, exchangeCodeForSession, signInWithIdToken };
}

function fakeApple(opts: { available?: boolean; reject?: unknown; credential?: Partial<Awaited<ReturnType<AppleAuthenticationLike["signInAsync"]>>> } = {}) {
  const signInAsync = vi.fn(async (_o: { requestedScopes?: number[]; nonce?: string }) => {
    if (opts.reject) throw opts.reject;
    return { identityToken: "apple-jwt", authorizationCode: "apple-auth-code", fullName: { givenName: "Ada", familyName: "Lovelace" }, email: "ada@privaterelay.appleid.com", ...opts.credential };
  });
  const apple: AppleAuthenticationLike = {
    isAvailableAsync: async () => opts.available ?? true,
    signInAsync,
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  };
  return { apple, signInAsync };
}

const sha256 = async (s: string) => createHash("sha256").update(s).digest("hex");

describe("completeOAuthRedirect", () => {
  it("exchanges the redirect's code for a session", async () => {
    const { client, exchangeCodeForSession } = fakeClient();
    const result = await completeOAuthRedirect(client, "myapp://auth/callback?code=abc%20123&state=x");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc 123", undefined);
    expect(result.session).toBe(session);
    expect(result.redirectType).toBeNull();
  });

  it("passes sb_flow_id so the exchange uses that flow's verifier", async () => {
    const { client, exchangeCodeForSession } = fakeClient();
    await completeOAuthRedirect(client, "myapp://auth/callback?code=c1&sb_flow_id=flow-42");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("c1", { flowId: "flow-42" });
  });

  it("returns the redirect type, so a password-recovery link can be told apart", async () => {
    const { client } = fakeClient({ exchange: { data: { session, user: session.user, redirectType: "recovery" }, error: null } });
    expect((await completeOAuthRedirect(client, "myapp://cb?code=c")).redirectType).toBe("recovery");
  });

  it("returns the provider's error with fixed copy, keeps its text only as providerMessage, and makes no request", async () => {
    const { client, exchangeCodeForSession } = fakeClient();
    const result = await completeOAuthRedirect(client, "myapp://auth/callback#error=access_denied&error_description=Your+account+is+locked.+Call+us");
    expect(result.error?.code).toBe("access_denied");
    expect(result.error?.message).toBe("Sign-in was canceled or not allowed.");
    expect(result.error?.providerMessage).toBe("Your account is locked. Call us");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    const unknown = await completeOAuthRedirect(client, "myapp://cb?error=made_up&error_description=Click+evil.example");
    expect(unknown.error?.message).toBe("Sign-in didn't complete. Try again.");
  });

  it("reads keys that shadow Object.prototype names", () => {
    expect(redirectParams("myapp://cb?constructor=x&toString=y&code=1#code=2")).toMatchObject({ constructor: "x", toString: "y", code: "1" });
  });

  it("is an error, not a throw, when there's no code or the exchange fails", async () => {
    expect((await completeOAuthRedirect(fakeClient().client, "myapp://auth/callback")).error?.code).toBe("missing_code");
    const failing = fakeClient({ exchange: { data: { session: null, user: null }, error: { message: "bad verifier", code: "bad_code_verifier" } } });
    expect((await completeOAuthRedirect(failing.client, "myapp://cb?code=c")).error?.code).toBe("bad_code_verifier");
  });

  it("accepts a real SupabaseClient", () => {
    const real = createClient("http://localhost:54321", "publishable");
    expectTypeOf(real);
    function expectTypeOf(_c: SignInClient) {}
  });
});

describe("signInWithApple", () => {
  it("asks for name and email with the hashed nonce, and gives Supabase the raw one", async () => {
    const { client, signInWithIdToken } = fakeClient();
    const { apple, signInAsync } = fakeApple();
    const result = await signInWithApple(client, apple, { digest: sha256, randomNonce: () => "raw-nonce" });
    expect(signInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: await sha256("raw-nonce") });
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "apple-jwt", nonce: "raw-nonce" });
    expect(result.session).toBe(session);
    expect(result.error).toBeUndefined();
    if (result.session) {
      expect(result.fullName).toBe("Ada Lovelace");
      expect(result.email).toBe("ada@privaterelay.appleid.com");
      expect(result.authorizationCode).toBe("apple-auth-code");
    }
  });

  it("refuses a digest that isn't lowercase hex SHA-256, before opening Apple's sheet", async () => {
    const { apple, signInAsync } = fakeApple();
    const base64 = async (s: string) => createHash("sha256").update(s).digest("base64");
    expect((await signInWithApple(fakeClient().client, apple, { digest: base64 })).error?.code).toBe("bad_digest");
    expect(signInAsync).not.toHaveBeenCalled();
  });

  it("keeps the name Apple shared when Supabase then refuses", async () => {
    const refused = fakeClient({ idToken: { data: { session: null, user: null }, error: { message: "nope", code: "bad_jwt" } } });
    const result = await signInWithApple(refused.client, fakeApple().apple, { digest: sha256 });
    expect(result.error && result.fullName).toBe("Ada Lovelace");
  });

  it("returns a null name on later sign-ins, when Apple sends none", async () => {
    const { apple } = fakeApple({ credential: { fullName: { givenName: null, familyName: null }, email: null } });
    const result = await signInWithApple(fakeClient().client, apple, { digest: sha256 });
    expect(result.session && result.fullName).toBeNull();
  });

  it("treats closing Apple's sheet as canceled, not an error", async () => {
    const { client, signInWithIdToken } = fakeClient();
    const { apple } = fakeApple({ reject: Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }) });
    expect(await signInWithApple(client, apple, { digest: sha256 })).toEqual({ canceled: true });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("returns typed errors for an unavailable device, a missing token and a refused sign-in", async () => {
    expect((await signInWithApple(fakeClient().client, fakeApple({ available: false }).apple, { digest: sha256 })).error?.code).toBe("apple_unavailable");
    expect((await signInWithApple(fakeClient().client, fakeApple({ credential: { identityToken: null } }).apple, { digest: sha256 })).error?.code).toBe("apple_no_token");
    expect((await signInWithApple(fakeClient().client, fakeApple({ reject: new Error("boom") }).apple, { digest: sha256 })).error?.code).toBe("apple_failed");
    const refused = fakeClient({ idToken: { data: { session: null, user: null }, error: { message: "Nonces mismatch", code: "bad_jwt" } } });
    const result = await signInWithApple(refused.client, fakeApple().apple, { digest: sha256 });
    expect(result.error?.code).toBe("bad_jwt");
  });

  it("makes a 64-character hex nonce by default", async () => {
    const { client, signInWithIdToken } = fakeClient();
    await signInWithApple(client, fakeApple().apple, { digest: sha256 });
    expect(signInWithIdToken.mock.calls[0]![0].nonce).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("deleteMyAccount", () => {
  it("calls the RPC, then signs this device out", async () => {
    const calls: string[] = [];
    const client = {
      rpc: vi.fn(async (fn: string) => (calls.push(`rpc:${fn}`), { data: null, error: null })),
      auth: { signOut: vi.fn(async (o?: { scope?: string }) => void calls.push(`signOut:${o?.scope}`)) },
    };
    await deleteMyAccount(client);
    expect(calls).toEqual(["rpc:delete_my_account", "signOut:local"]);
  });

  it("throws the database's refusal and keeps the session", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { message: "delete_my_account: not signed in", code: "42501" } }),
      auth: { signOut: vi.fn(async () => {}) },
    };
    const err = await deleteMyAccount(client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SupabaseQueryError);
    expect((err as SupabaseQueryError).code).toBe("42501");
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("accepts a real SupabaseClient", () => {
    const real = createClient("http://localhost:54321", "publishable");
    void (() => deleteMyAccount(real));
  });
});
