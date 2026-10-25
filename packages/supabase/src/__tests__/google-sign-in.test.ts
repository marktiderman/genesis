// @feat:account
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { signInWithGoogle, type GoogleSignInLike, type SignInClient } from "../native";

const session = { access_token: "at", refresh_token: "rt", user: { id: "u1" } };
const sha256 = async (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (s: string) => Buffer.from(s).toString("base64url");
/** An unsigned JWT with these claims: the helper only reads `nonce`; Supabase checks the signature. */
const jwt = (claims: Record<string, unknown>) => `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(claims))}.sig`;

function fakeClient(idToken?: unknown) {
  const signInWithIdToken = vi.fn(async (_c: { provider: string; token: string; nonce?: string }) => idToken ?? { data: { session, user: session.user }, error: null });
  return { client: { auth: { exchangeCodeForSession: vi.fn(), signInWithIdToken } } as unknown as SignInClient, signInWithIdToken };
}

/** Universal sign-in that puts the nonce it is given into the token, as Google does. */
function fakeGoogle(opts: { response?: Awaited<ReturnType<GoogleSignInLike["authenticate"]>>; reject?: unknown; tokenNonce?: (given?: string) => string | undefined } = {}) {
  const authenticate = vi.fn(async (params?: { nonce?: string }) => {
    if (opts.reject) throw opts.reject;
    if (opts.response) return opts.response;
    const nonce = opts.tokenNonce ? opts.tokenNonce(params?.nonce) : params?.nonce;
    return { user: { idToken: jwt({ sub: "g1", aud: "web-client", ...(nonce === undefined ? {} : { nonce }) }), user: { email: "ada@example.com", name: " Ada Lovelace " } }, error: null, isCancelled: false };
  });
  return { google: { authenticate } satisfies GoogleSignInLike, authenticate };
}

describe("signInWithGoogle", () => {
  it("gives Google the SHA-256 of the nonce and Supabase the raw nonce, as Supabase's guide says", async () => {
    const { client, signInWithIdToken } = fakeClient();
    const { google, authenticate } = fakeGoogle();
    const result = await signInWithGoogle(client, google, { digest: sha256, randomNonce: () => "raw-nonce" });
    expect(authenticate).toHaveBeenCalledWith({ nonce: await sha256("raw-nonce") });
    const token = signInWithIdToken.mock.calls[0]![0].token;
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "google", token, nonce: "raw-nonce" });
    expect(result.session).toBe(session);
    if (result.session) {
      expect(result.fullName).toBe("Ada Lovelace");
      expect(result.email).toBe("ada@example.com");
    }
  });

  it("makes a fresh 64-character hex nonce for each sign-in by default", async () => {
    const { client, signInWithIdToken } = fakeClient();
    const { google } = fakeGoogle();
    await signInWithGoogle(client, google, { digest: sha256 });
    await signInWithGoogle(client, google, { digest: sha256 });
    const [a, b] = signInWithIdToken.mock.calls.map((c) => c[0].nonce);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("never sends Supabase a token without this sign-in's nonce (a module that ignores it, or a replayed token)", async () => {
    for (const tokenNonce of [() => undefined, () => "someone-elses-hash", (given?: string) => given?.toUpperCase()]) {
      const { client, signInWithIdToken } = fakeClient();
      const result = await signInWithGoogle(client, fakeGoogle({ tokenNonce }).google, { digest: sha256 });
      expect(result.error?.code).toBe("google_nonce_missing");
      expect(signInWithIdToken).not.toHaveBeenCalled();
    }
    const { client, signInWithIdToken } = fakeClient();
    const garbage = fakeGoogle({ response: { user: { idToken: "not-a-jwt" }, error: null } });
    expect((await signInWithGoogle(client, garbage.google, { digest: sha256 })).error?.code).toBe("google_nonce_missing");
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("refuses a digest that isn't lowercase hex SHA-256, before opening Google's sheet", async () => {
    const { google, authenticate } = fakeGoogle();
    const base64 = async (s: string) => createHash("sha256").update(s).digest("base64");
    expect((await signInWithGoogle(fakeClient().client, google, { digest: base64 })).error?.code).toBe("bad_digest");
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("treats closing Google's sheet as canceled, and returns typed errors otherwise", async () => {
    const { client, signInWithIdToken } = fakeClient();
    expect(await signInWithGoogle(client, fakeGoogle({ response: { user: null, error: null, isCancelled: true } }).google, { digest: sha256 })).toEqual({ canceled: true });
    expect((await signInWithGoogle(client, fakeGoogle({ response: { user: null, error: { code: "PLAY_SERVICES_NOT_AVAILABLE", message: "no play services" } } }).google, { digest: sha256 })).error?.code).toBe("google_failed");
    expect((await signInWithGoogle(client, fakeGoogle({ reject: new Error("boom") }).google, { digest: sha256 })).error?.code).toBe("google_failed");
    expect((await signInWithGoogle(client, fakeGoogle({ response: { user: { idToken: null }, error: null } }).google, { digest: sha256 })).error?.code).toBe("google_no_token");
    expect(signInWithIdToken).not.toHaveBeenCalled();
    const refused = fakeClient({ data: { session: null, user: null }, error: { message: "Nonces mismatch", code: "bad_jwt" } });
    expect((await signInWithGoogle(refused.client, fakeGoogle().google, { digest: sha256 })).error?.code).toBe("bad_jwt");
  });

  it("reads a nonce from a token whose payload has non-ASCII text", async () => {
    const { client, signInWithIdToken } = fakeClient();
    const google: GoogleSignInLike = {
      authenticate: async (p) => ({ user: { idToken: jwt({ name: "Zoë Ångström 🙂", nonce: p?.nonce }) }, error: null }),
    };
    expect((await signInWithGoogle(client, google, { digest: sha256 })).session).toBe(session);
    expect(signInWithIdToken).toHaveBeenCalled();
  });
});
