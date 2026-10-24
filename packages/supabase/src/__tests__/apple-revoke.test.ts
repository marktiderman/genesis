// @feat:apple-token-revocation
import { describe, expect, it, vi } from "vitest";
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  appleClientSecret,
  base64url,
  decodeJwtPayload,
  exchangeAuthorizationCode,
  readAppleConfig,
  revokeRefreshToken,
  type AppleConfig,
} from "../../functions/genesis-apple-revoke/apple.ts";
import { handle, type CallerUser, type DueRevocation, type HandlerDeps, type TokenStore } from "../../functions/genesis-apple-revoke/handler.ts";
import { deleteMyAccount, storeAppleToken } from "../index";

// A throwaway P-256 key, made per run: the tests sign with it and verify with its public half.
const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----`;

const env: Record<string, string> = {
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), // as `supabase secrets set` often receives it
  APPLE_CLIENT_IDS: "com.example.app, com.example.app.dev",
};
const config = readAppleConfig((n) => env[n]).config as AppleConfig;

const decodeSegment = (s: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
const fakeIdToken = (claims: Record<string, unknown>) => `${base64url(JSON.stringify({ alg: "RS256" }))}.${base64url(JSON.stringify(claims))}.sig`;

async function verifies(jwt: string): Promise<boolean> {
  const [h, p, s] = jwt.split(".") as [string, string, string];
  const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, sig, new TextEncoder().encode(`${h}.${p}`));
}

type Call = { url: string; init: RequestInit; form: Record<string, string> };
function mockFetch(...responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, form: Object.fromEntries(new URLSearchParams(String(init?.body ?? ""))) });
    const next = responses.shift() ?? new Response(null, { status: 200 });
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}
const appleJson = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const tokenResponse = (sub = "apple-sub-1", aud = "com.example.app") =>
  appleJson(200, { access_token: "at", token_type: "Bearer", expires_in: 3600, refresh_token: "apple-refresh-token", id_token: fakeIdToken({ iss: "https://appleid.apple.com", aud, sub }) });

describe("readAppleConfig", () => {
  it("names what's missing, never a value", () => {
    const { problems } = readAppleConfig((n) => (n === "APPLE_KEY_ID" ? "short" : undefined));
    expect(problems).toHaveLength(4);
    expect(problems!.join(" ")).not.toContain("short");
  });

  it("accepts a PEM with escaped newlines and trims the client ids", () => {
    expect(config.privateKey).toContain("\n");
    expect(config.clientIds).toEqual(["com.example.app", "com.example.app.dev"]);
  });
});

describe("appleClientSecret", () => {
  it("is an ES256 JWT with Apple's header and claims, signed with the key", async () => {
    const now = Date.UTC(2026, 9, 24);
    const jwt = await appleClientSecret(config, "com.example.app", { now });
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(decodeSegment(h)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(decodeSegment(p)).toEqual({ iss: "TEAM123456", iat: now / 1000, exp: now / 1000 + 300, aud: "https://appleid.apple.com", sub: "com.example.app" });
    expect(jwt).not.toMatch(/[=+/]/); // base64url, unpadded
    expect(atob(s.replace(/-/g, "+").replace(/_/g, "/")).length).toBe(64); // r‖s, as JWS wants, not DER
    expect(await verifies(jwt)).toBe(true);
  });

  it("never asks for more than Apple's six-month maximum", async () => {
    const claims = decodeJwtPayload(await appleClientSecret(config, "com.example.app", { now: 0, ttlSeconds: 10 ** 9 }))!;
    expect(claims.exp).toBe(15_777_000);
  });

  it("refuses a key that isn't a P-256 PKCS#8 key", async () => {
    await expect(appleClientSecret({ ...config, privateKey: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" }, "com.example.app")).rejects.toThrow();
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts the code to /auth/token as a form, with a client secret for that client id and no redirect_uri", async () => {
    const { fetch, calls } = mockFetch(tokenResponse());
    const result = await exchangeAuthorizationCode(config, "com.example.app", "the-code", fetch);
    expect(result).toEqual({ ok: true, refreshToken: "apple-refresh-token", appleUserId: "apple-sub-1" });
    const [call] = calls;
    expect(call!.url).toBe(APPLE_TOKEN_URL);
    expect(call!.init.method).toBe("POST");
    expect((call!.init.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.keys(call!.form).sort()).toEqual(["client_id", "client_secret", "code", "grant_type"]);
    expect(call!.form).toMatchObject({ client_id: "com.example.app", code: "the-code", grant_type: "authorization_code" });
    expect(decodeJwtPayload(call!.form.client_secret!)!.sub).toBe("com.example.app");
    expect(await verifies(call!.form.client_secret!)).toBe(true);
  });

  it("returns Apple's error code, and only a code from Apple's list", async () => {
    expect(await exchangeAuthorizationCode(config, "com.example.app", "c", mockFetch(appleJson(400, { error: "invalid_grant" })).fetch)).toEqual({ ok: false, error: "invalid_grant", status: 400 });
    expect(await exchangeAuthorizationCode(config, "com.example.app", "c", mockFetch(appleJson(400, { error: "<script>" })).fetch)).toMatchObject({ error: "unknown" });
    expect(await exchangeAuthorizationCode(config, "com.example.app", "c", mockFetch(new TypeError("offline")).fetch)).toEqual({ ok: false, error: "network" });
  });

  it("refuses a response whose id token isn't Apple's, for this client", async () => {
    const wrongAud = await exchangeAuthorizationCode(config, "com.example.app", "c", mockFetch(tokenResponse("s", "com.other.app")).fetch);
    expect(wrongAud).toMatchObject({ ok: false, error: "bad_response" });
    const noRefresh = appleJson(200, { id_token: fakeIdToken({ iss: "https://appleid.apple.com", aud: "com.example.app", sub: "s" }) });
    expect(await exchangeAuthorizationCode(config, "com.example.app", "c", mockFetch(noRefresh).fetch)).toMatchObject({ ok: false, error: "bad_response" });
  });
});

describe("revokeRefreshToken", () => {
  it("posts the token to /auth/revoke with token_type_hint=refresh_token; 200 is done", async () => {
    const { fetch, calls } = mockFetch(new Response(null, { status: 200 }));
    expect(await revokeRefreshToken(config, "com.example.app.dev", "rt", fetch)).toEqual({ ok: true });
    expect(calls[0]!.url).toBe(APPLE_REVOKE_URL);
    expect(Object.keys(calls[0]!.form).sort()).toEqual(["client_id", "client_secret", "token", "token_type_hint"]);
    expect(calls[0]!.form).toMatchObject({ client_id: "com.example.app.dev", token: "rt", token_type_hint: "refresh_token" });
    expect(decodeJwtPayload(calls[0]!.form.client_secret!)!.sub).toBe("com.example.app.dev");
  });

  it("anything but 200 is a failure to retry", async () => {
    expect(await revokeRefreshToken(config, "com.example.app", "rt", mockFetch(appleJson(400, { error: "invalid_client" })).fetch)).toEqual({ ok: false, error: "invalid_client", status: 400 });
    expect(await revokeRefreshToken(config, "com.example.app", "rt", mockFetch(new Response("", { status: 503 })).fetch)).toEqual({ ok: false, error: "unknown", status: 503 });
  });
});

describe("the Edge Function's handler", () => {
  function setup(options: { user?: CallerUser | null; save?: "stored" | "queued"; due?: DueRevocation[]; apple?: Array<Response | Error>; env?: Record<string, string> } = {}) {
    const logs: string[] = [];
    const due = [...(options.due ?? [])];
    const store = {
      save: vi.fn(async () => options.save ?? "stored"),
      claim: vi.fn(async () => due.splice(0)),
      done: vi.fn(async () => {}),
      failed: vi.fn(async () => {}),
    } satisfies TokenStore;
    const user = options.user === undefined ? { id: "user-1", appleUserIds: ["apple-sub-1"] } : options.user;
    const getUser = vi.fn(async (t: string) => (t === "good-access-token" ? user : null));
    const apple = mockFetch(...(options.apple ?? []));
    const deps: HandlerDeps = { env: (n) => (options.env ?? env)[n], fetch: apple.fetch, getUser, store, log: (m) => logs.push(m) };
    const call = (body: unknown, token: string | null = "good-access-token") =>
      handle(new Request("https://x.supabase.co/functions/v1/genesis-apple-revoke", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }), deps);
    return { call, store, getUser, logs, appleCalls: apple.calls };
  }
  const secrets = ["apple-refresh-token", "rt-queued", "BEGIN PRIVATE KEY", "good-access-token"];
  const leaks = (text: string) => secrets.filter((s) => text.includes(s));

  it("store: exchanges the code and keeps the token against the caller, returning no token", async () => {
    const t = setup({ apple: [tokenResponse()] });
    const res = await t.call({ action: "store", code: "the-code", clientId: "com.example.app" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(t.store.save).toHaveBeenCalledWith("user-1", "com.example.app", "apple-refresh-token");
    expect(leaks(text + t.logs.join("\n"))).toEqual([]);
  });

  it("store: defaults to the first client id", async () => {
    const t = setup({ apple: [tokenResponse()] });
    await t.call({ action: "store", code: "the-code" });
    expect(t.appleCalls[0]!.form.client_id).toBe("com.example.app");
  });

  it("store: refuses without a signed-in caller, before calling Apple", async () => {
    for (const token of [null, "forged"]) {
      const t = setup();
      expect((await t.call({ action: "store", code: "c" }, token)).status).toBe(401);
      expect(t.appleCalls).toHaveLength(0);
    }
  });

  it("store: refuses a client id outside APPLE_CLIENT_IDS, a malformed code, and a login with no Apple identity", async () => {
    expect(await (await setup().call({ action: "store", code: "c", clientId: "com.evil.app" })).json()).toEqual({ error: "unknown_client" });
    expect((await setup().call({ action: "store", code: "a b" })).status).toBe(400);
    expect((await setup({ user: { id: "u", appleUserIds: [] } }).call({ action: "store", code: "c" })).status).toBe(403);
  });

  it("store: a code from another Apple account is refused, and the token it minted is revoked, not kept", async () => {
    const t = setup({ apple: [tokenResponse("someone-else"), new Response(null, { status: 200 })] });
    const res = await t.call({ action: "store", code: "c" });
    expect(res.status).toBe(403);
    expect(t.store.save).not.toHaveBeenCalled();
    expect(t.appleCalls[1]!.url).toBe(APPLE_REVOKE_URL);
    expect(t.appleCalls[1]!.form.token).toBe("apple-refresh-token");
  });

  it("store: Apple's refusal comes back as a code, not Apple's body", async () => {
    const t = setup({ apple: [appleJson(400, { error: "invalid_grant", error_description: "spoof me" })] });
    const res = await t.call({ action: "store", code: "c" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "exchange_failed", apple: "invalid_grant" });
  });

  it("store: if the login went while the code was exchanged, the queued token is revoked at once", async () => {
    const t = setup({ save: "queued", apple: [tokenResponse()], due: [{ id: 7, client_id: "com.example.app", refresh_token: "rt-queued", attempts: 1 }] });
    expect((await t.call({ action: "store", code: "c" })).status).toBe(200);
    expect(t.appleCalls[1]!.form.token).toBe("rt-queued");
    expect(t.store.done).toHaveBeenCalledWith(7);
  });

  it("revoke: works through the queue without a caller, keeps failures for a retry, and answers only ok", async () => {
    const t = setup({
      due: [
        { id: 1, client_id: "com.example.app", refresh_token: "rt-queued", attempts: 1 },
        { id: 2, client_id: "com.example.app.dev", refresh_token: "rt-queued", attempts: 3 },
      ],
      apple: [new Response(null, { status: 200 }), appleJson(400, { error: "invalid_client" })],
    });
    const res = await t.call({ action: "revoke" }, null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(t.getUser).not.toHaveBeenCalled();
    expect(t.store.done).toHaveBeenCalledWith(1);
    expect(t.store.failed).toHaveBeenCalledWith(2, "invalid_client (HTTP 400)");
    expect(t.logs.join("\n")).toContain("revocation 2 for com.example.app.dev failed (attempt 3): invalid_client");
    expect(leaks(t.logs.join("\n"))).toEqual([]);
  });

  it("is loud when a secret is missing, by name only, and touches nothing", async () => {
    const t = setup({ env: { ...env, APPLE_TEAM_ID: "" } });
    const res = await t.call({ action: "revoke" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "not_configured" });
    expect(t.logs[0]).toContain("APPLE_TEAM_ID");
    expect(t.store.claim).not.toHaveBeenCalled();
    expect(leaks(t.logs.join("\n"))).toEqual([]);
  });

  it("refuses other methods, bodies and actions", async () => {
    const t = setup();
    expect((await t.call({ action: "drop_tables" })).status).toBe(400);
    expect((await t.call("x".repeat(5000))).status).toBe(400);
  });
});

describe("app helpers", () => {
  const fakeClient = (invokeResult: { data: unknown; error: unknown } | Error = { data: { ok: true }, error: null }) => {
    const order: string[] = [];
    const invoke = vi.fn(async (name: string, _o?: unknown) => {
      order.push(`invoke:${name}`);
      if (invokeResult instanceof Error) throw invokeResult;
      return invokeResult;
    });
    const rpc = vi.fn(async (fn: string) => {
      order.push(`rpc:${fn}`);
      return { data: null, error: null };
    });
    const signOut = vi.fn(async () => {
      order.push("signOut");
      return {};
    });
    return { client: { rpc, auth: { signOut }, functions: { invoke } }, invoke, order };
  };

  it("storeAppleToken sends the code to the function and never throws", async () => {
    const { client, invoke } = fakeClient();
    expect(await storeAppleToken(client, { authorizationCode: "code", clientId: "com.example.app" })).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("genesis-apple-revoke", { body: { action: "store", code: "code", clientId: "com.example.app" } });
    expect(await storeAppleToken(fakeClient({ data: null, error: new Error("404") }).client, { authorizationCode: "c" })).toMatchObject({ ok: false });
    expect(await storeAppleToken(fakeClient(new Error("offline")).client, { authorizationCode: "c" })).toMatchObject({ ok: false });
  });

  it("deleteMyAccount with revokeAppleTokens asks for the revocation after the delete, before signing out", async () => {
    const { client, order, invoke } = fakeClient();
    await deleteMyAccount(client, { revokeAppleTokens: true });
    expect(order).toEqual(["rpc:delete_my_account", "invoke:genesis-apple-revoke", "signOut"]);
    expect(invoke).toHaveBeenCalledWith("genesis-apple-revoke", { body: { action: "revoke" } });
  });

  it("a failed revocation request never fails the deletion", async () => {
    const { client, order } = fakeClient(new Error("offline"));
    await expect(deleteMyAccount(client, { revokeAppleTokens: "my-revoke" })).resolves.toBeUndefined();
    expect(order).toEqual(["rpc:delete_my_account", "invoke:my-revoke", "signOut"]);
  });

  it("without the option it calls no function", async () => {
    const { client, invoke } = fakeClient();
    await deleteMyAccount(client);
    expect(invoke).not.toHaveBeenCalled();
  });
});
