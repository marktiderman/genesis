// @feat:connect
import { beforeEach, describe, expect, it, vi } from "vitest";
import { base64url, fromBase64 } from "../encoding";
import {
  clearAccessTokenCache,
  ConnectError,
  createConnector,
  isSafeReturnOrigin,
  type ConnectedAccount,
  type ConnectLogEvent,
  type ConnectorConfig,
} from "../oauth";
import {
  googleProvider,
  GOOGLE_SCOPES,
  type OAuthProvider,
} from "../providers";
import { createSecrets } from "../secrets";

const KEY = Buffer.from("k".repeat(32)).toString("base64");
const STATE_SECRET = Buffer.from("s".repeat(32)).toString("base64");
const CLIENT_SECRET = "client-secret-value";
const REFRESH = "1//refresh-token-value";
const ACCESS = "ya29.access-token-value";
const CODE = "4/auth-code-value";
const SECRETS_IN_PLAY = [
  KEY,
  STATE_SECRET,
  CLIENT_SECRET,
  REFRESH,
  ACCESS,
  CODE,
];

type Call = { url: string; init: RequestInit; body: URLSearchParams };

function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(
    async (url: string | URL | Request, init: RequestInit = {}) => {
      const call = {
        url: String(url),
        init,
        body: new URLSearchParams(String(init.body ?? "")),
      };
      calls.push(call);
      return handler(call);
    },
  );
  return { fetch: fn as unknown as typeof fetch, calls };
}

const tokenOk = (extra: Record<string, unknown> = {}) =>
  Response.json({
    access_token: ACCESS,
    refresh_token: REFRESH,
    expires_in: 3599,
    scope: GOOGLE_SCOPES.driveFile,
    token_type: "Bearer",
    ...extra,
  });

function setup(
  overrides: Partial<ConnectorConfig> = {},
  handler: (call: Call) => Response | Promise<Response> = () => tokenOk(),
) {
  const http = fakeFetch(handler);
  const stored: ConnectedAccount[] = [];
  const logs: ConnectLogEvent[] = [];
  let clock = Date.parse("2026-10-26T12:00:00Z");
  const secrets = createSecrets(KEY, { purpose: "google-refresh-token" });
  const connector = createConnector({
    provider: googleProvider,
    clientId: "client-id",
    clientSecret: CLIENT_SECRET,
    stateSecret: STATE_SECRET,
    secrets,
    callbackPath: "/api/connect/google/callback",
    scopes: [GOOGLE_SCOPES.driveFile],
    fetch: http.fetch,
    now: () => clock,
    randomId: () => "grant-1",
    store: (account) => {
      stored.push(account);
      return { grant: account.id };
    },
    log: (event) => logs.push(event),
    ...overrides,
  });
  return {
    connector,
    secrets,
    http,
    stored,
    logs,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const cookiePair = (setCookie: string) => setCookie.split(";")[0]!;

/** Starts on `startUrl`, then comes back to the callback (on `callbackOrigin`) with what Google would send. */
async function roundTrip(
  t: ReturnType<typeof setup>,
  options: {
    startUrl?: string;
    callbackOrigin?: string;
    query?: (state: string) => Record<string, string>;
    cookie?: (pair: string) => string;
    scopes?: string[];
  } = {},
) {
  const startUrl =
    options.startUrl ?? "https://app.example.com/api/connect/google/start";
  const started = await t.connector.start(
    new Request(startUrl, { method: "POST" }),
    {
      subject: "user-1",
      intent: "sheets",
      returnTo: "/settings/integrations?tab=google",
      data: { formId: "form-9" },
      ...(options.scopes ? { scopes: options.scopes } : {}),
    },
  );
  const authorize = new URL(started.url);
  const state = authorize.searchParams.get("state")!;
  const callbackOrigin = options.callbackOrigin ?? new URL(startUrl).origin;
  const callbackUrl = new URL("/api/connect/google/callback", callbackOrigin);
  for (const [k, v] of Object.entries(
    options.query?.(state) ?? { state, code: CODE },
  ))
    callbackUrl.searchParams.set(k, v);
  const pair = cookiePair(started.setCookie);
  const response = await t.connector.callback(
    new Request(callbackUrl, {
      headers: {
        cookie: options.cookie ? options.cookie(pair) : `other=1; ${pair}`,
      },
    }),
  );
  const location = new URL(response.headers.get("location")!);
  return {
    started,
    authorize,
    state,
    response,
    location,
    result: location.searchParams.get("connect"),
  };
}

function expectNoSecrets(...texts: unknown[]) {
  const all = JSON.stringify(texts);
  for (const secret of SECRETS_IN_PLAY) expect(all).not.toContain(secret);
}

beforeEach(() => clearAccessTokenCache());

describe("start", () => {
  it("builds Google's sign-in URL with PKCE S256, offline access and a signed state, and sets the verifier cookie", async () => {
    const t = setup();
    const { started, authorize } = await roundTrip(t);
    expect(authorize.origin + authorize.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    const p = authorize.searchParams;
    expect(p.get("client_id")).toBe("client-id");
    expect(p.get("redirect_uri")).toBe(
      "https://app.example.com/api/connect/google/callback",
    );
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe(GOOGLE_SCOPES.driveFile);
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("code_challenge_method")).toBe("S256");
    const [nonceAndVerifier] = cookiePair(started.setCookie)
      .split("=")
      .slice(1);
    const verifier = nonceAndVerifier!.split(".")[1]!;
    const challenge = base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    expect(p.get("code_challenge")).toBe(challenge);
    expect(started.setCookie).toMatch(
      /^genesis_connect_google=[\w-]+\.[\w-]+; Path=\/api\/connect\/google\/callback; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/,
    );
    // No secret anywhere in the URL.
    expect(started.url).not.toContain(CLIENT_SECRET);
    expect(started.url).not.toContain(verifier);
    expectNoSecrets(started.url);
  });

  it("answers as a redirect or as JSON, both with the cookie and no-store", async () => {
    const t = setup();
    const started = await t.connector.start(
      new Request("https://app.example.com/start"),
      { subject: "u", returnTo: "/" },
    );
    const redirect = started.redirect();
    expect(redirect.status).toBe(303);
    expect(redirect.headers.get("location")).toBe(started.url);
    expect(redirect.headers.get("set-cookie")).toBe(started.setCookie);
    const json = started.json();
    expect(await json.json()).toEqual({ url: started.url });
    expect(json.headers.get("set-cookie")).toBe(started.setCookie);
    expect(json.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a missing subject, a full-URL returnTo, no scopes, reserved params and oversized data", async () => {
    const t = setup({ scopes: [] });
    const req = new Request("https://app.example.com/start");
    const base = { subject: "u", returnTo: "/", scopes: ["a"] };
    for (const bad of [
      { ...base, subject: " " },
      { ...base, returnTo: "https://evil.example/" },
      { ...base, returnTo: "//evil.example/" },
      { ...base, returnTo: "/\\evil.example" },
      { ...base, returnTo: "settings" },
      { ...base, scopes: [] },
      { ...base, scopes: ["has space"] },
      { ...base, params: { redirect_uri: "https://evil.example/" } },
      { ...base, data: { blob: "x".repeat(3000) } },
    ]) {
      await expect(t.connector.start(req, bad)).rejects.toBeInstanceOf(
        ConnectError,
      );
    }
    // Extra params that aren't the flow's own pass through.
    const ok = await t.connector.start(req, {
      ...base,
      params: { login_hint: "a@example.com" },
    });
    expect(new URL(ok.url).searchParams.get("login_hint")).toBe(
      "a@example.com",
    );
  });
});

describe("callback", () => {
  it("connects: exchanges the code with PKCE, seals the refresh token, stores it and goes back with connected", async () => {
    const t = setup();
    const { response, location, result, started } = await roundTrip(t);
    expect(result).toBe("connected");
    expect(response.status).toBe(303);
    expect(location.origin + location.pathname).toBe(
      "https://app.example.com/settings/integrations",
    );
    expect(location.searchParams.get("tab")).toBe("google");
    expect(location.searchParams.get("grant")).toBe("grant-1");
    // The cookie is cleared on the way back.
    expect(response.headers.get("set-cookie")).toMatch(
      /^genesis_connect_google=; .*Max-Age=0/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");

    const [exchange] = t.http.calls;
    expect(exchange!.url).toBe("https://oauth2.googleapis.com/token");
    expect(exchange!.init.redirect).toBe("error");
    expect(exchange!.body.get("grant_type")).toBe("authorization_code");
    expect(exchange!.body.get("code")).toBe(CODE);
    expect(exchange!.body.get("code_verifier")).toBe(
      cookiePair(started.setCookie).split(".")[1],
    );
    expect(exchange!.body.get("redirect_uri")).toBe(
      "https://app.example.com/api/connect/google/callback",
    );

    const [account] = t.stored;
    expect(account).toMatchObject({
      id: "grant-1",
      aad: "google-grant:grant-1",
      accessToken: ACCESS,
      expiresIn: 3599,
      scope: GOOGLE_SCOPES.driveFile,
      scopes: [GOOGLE_SCOPES.driveFile],
      subject: "user-1",
      intent: "sheets",
      returnTo: "/settings/integrations?tab=google",
      data: { formId: "form-9" },
    });
    expect(account!.sealedRefreshToken.startsWith("v2.k1.")).toBe(true);
    expect(account!.sealedRefreshToken).not.toContain(REFRESH);
    expect(
      await t.secrets.open(account!.sealedRefreshToken, account!.aad),
    ).toBe(REFRESH);
    expectNoSecrets(location.toString(), t.logs);
  });

  it("sends a forged or tampered state back as expired, to the fallback path", async () => {
    const t = setup();
    const { location, result } = await roundTrip(t, {
      query: (state) => {
        const [body, mac] = state.split(".");
        const raw = JSON.parse(new TextDecoder().decode(fromBase64(body!)));
        raw.s = "someone-else";
        return {
          state: `${base64url(JSON.stringify(raw))}.${mac}`,
          code: CODE,
        };
      },
    });
    expect(result).toBe("expired");
    expect(location.pathname).toBe("/");
    expect(t.stored).toHaveLength(0);
    expect(t.http.calls).toHaveLength(0);
  });

  it("refuses a state signed with another secret, a missing state and a malformed one", async () => {
    const t = setup();
    const other = setup({
      stateSecret: Buffer.from("o".repeat(32)).toString("base64"),
    });
    const foreign = await other.connector.start(
      new Request("https://app.example.com/s"),
      { subject: "u", returnTo: "/" },
    );
    const foreignState = new URL(foreign.url).searchParams.get("state")!;
    for (const state of [foreignState, "", "abc", "a.b.c"]) {
      const response = await t.connector.callback(
        new Request(
          `https://app.example.com/api/connect/google/callback?state=${encodeURIComponent(state)}&code=x`,
        ),
      );
      expect(
        new URL(response.headers.get("location")!).searchParams.get("connect"),
      ).toBe("expired");
    }
  });

  it("sends an expired state back as expired", async () => {
    const t = setup();
    const { result } = await roundTrip(t, {
      query: (state) => {
        t.tick(601_000);
        return { state, code: CODE };
      },
    });
    expect(result).toBe("expired");
    expect(t.http.calls).toHaveLength(0);
  });

  it("never finishes in another browser: no cookie, or a cookie for another attempt, is browser", async () => {
    const t = setup();
    expect((await roundTrip(t, { cookie: () => "" })).result).toBe("browser");
    const other = await t.connector.start(
      new Request("https://app.example.com/s"),
      { subject: "u2", returnTo: "/" },
    );
    const mismatch = await roundTrip(t, {
      cookie: () => cookiePair(other.setCookie),
    });
    expect(mismatch.result).toBe("browser");
    // Back to where the attempt started, since the state is good.
    expect(mismatch.location.pathname).toBe("/settings/integrations");
    expect(t.http.calls).toHaveLength(0);
    // A stale cookie next to the right one still finishes.
    const both = await roundTrip(t, {
      cookie: (pair) => `${cookiePair(other.setCookie)}; ${pair}`,
    });
    expect(both.result).toBe("connected");
  });

  it("maps a refusal at the provider to denied, and other provider errors to failed", async () => {
    const t = setup();
    expect(
      (
        await roundTrip(t, {
          query: (state) => ({ state, error: "access_denied" }),
        })
      ).result,
    ).toBe("denied");
    expect((await roundTrip(t, { query: (state) => ({ state }) })).result).toBe(
      "denied",
    );
    expect(
      (
        await roundTrip(t, {
          query: (state) => ({ state, error: "server_error" }),
        })
      ).result,
    ).toBe("failed");
    expect(t.http.calls).toHaveLength(0);
  });

  it("goes back with scope when a scope asked for was not granted, and stores nothing", async () => {
    const t = setup({}, () => tokenOk({ scope: "openid" }));
    const { result } = await roundTrip(t, {
      scopes: [GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.calendarEvents],
    });
    expect(result).toBe("scope");
    expect(t.stored).toHaveLength(0);
  });

  it("accepts extra granted scopes, and a missing scope field as the scopes asked for", async () => {
    const extra = setup({}, () =>
      tokenOk({ scope: `openid ${GOOGLE_SCOPES.driveFile}` }),
    );
    expect((await roundTrip(extra)).result).toBe("connected");
    const missing = setup({}, () => tokenOk({ scope: undefined }));
    expect((await roundTrip(missing)).result).toBe("connected");
    expect(missing.stored[0]!.scopes).toEqual([GOOGLE_SCOPES.driveFile]);
  });

  it("fails when the token endpoint refuses, throws, sends no refresh token, or store throws, without leaking anything", async () => {
    const refused = setup({}, () =>
      Response.json(
        { error: "invalid_grant", error_description: `code ${CODE} bad` },
        { status: 400 },
      ),
    );
    expect((await roundTrip(refused)).result).toBe("failed");
    expect(refused.logs.at(-1)).toEqual({
      step: "callback",
      result: "failed",
      detail: "token endpoint answered 400 (invalid_grant)",
    });
    expectNoSecrets(refused.logs);

    const network = setup({}, () => {
      throw new TypeError(`fetch failed for ${CLIENT_SECRET}`);
    });
    expect((await roundTrip(network)).result).toBe("failed");
    expectNoSecrets(network.logs);

    const noRefresh = setup({}, () => tokenOk({ refresh_token: undefined }));
    expect((await roundTrip(noRefresh)).result).toBe("failed");
    const optional = setup({ requireRefreshToken: false }, () =>
      tokenOk({ refresh_token: undefined }),
    );
    expect((await roundTrip(optional)).result).toBe("connected");
    expect(optional.stored[0]!.sealedRefreshToken).toBe("");

    const storeThrows = setup({
      store: () => {
        throw new Error(`db down ${REFRESH}`);
      },
    });
    const failed = await roundTrip(storeThrows);
    expect(failed.result).toBe("failed");
    expectNoSecrets(storeThrows.logs, failed.location.toString());
  });

  it("does not let store override the result parameter", async () => {
    const t = setup({ store: () => ({ connect: "failed", grant: "g" }) });
    const { location } = await roundTrip(t);
    expect(location.searchParams.getAll("connect")).toEqual(["connected"]);
  });
});

describe("one pinned callback origin for many addresses", () => {
  const pinned = {
    redirectOrigin: "https://app.example.com",
    sharedDomain: "example.com",
  };

  it("starts on a team address, finishes on the pinned origin, returns to the team address", async () => {
    const t = setup(pinned);
    const { authorize, started, location, result } = await roundTrip(t, {
      startUrl: "https://team.example.com/api/connect/google/start",
      callbackOrigin: "https://app.example.com",
    });
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/connect/google/callback",
    );
    expect(started.setCookie).toContain("; Domain=example.com");
    expect(result).toBe("connected");
    expect(location.origin).toBe("https://team.example.com");
    expect(t.http.calls[0]!.body.get("redirect_uri")).toBe(
      "https://app.example.com/api/connect/google/callback",
    );
  });

  it("refuses to start on an address the cookie can't reach the pinned callback from", async () => {
    const t = setup(pinned);
    await expect(
      t.connector.start(new Request("https://preview.vercel.app/start"), {
        subject: "u",
        returnTo: "/",
      }),
    ).rejects.toMatchObject({
      code: "config",
    });
    // Without a shared domain, only the pinned origin itself can start.
    const only = setup({ redirectOrigin: "https://app.example.com" });
    await expect(
      only.connector.start(new Request("https://team.example.com/start"), {
        subject: "u",
        returnTo: "/",
      }),
    ).rejects.toBeInstanceOf(ConnectError);
    const ok = await only.connector.start(
      new Request("https://app.example.com/start"),
      { subject: "u", returnTo: "/" },
    );
    expect(ok.setCookie).not.toContain("Domain=");
  });

  it("returns only to exact https origins on the shared domain", () => {
    expect(isSafeReturnOrigin("https://team.example.com", "example.com")).toBe(
      true,
    );
    expect(isSafeReturnOrigin("https://example.com", "example.com")).toBe(true);
    expect(isSafeReturnOrigin("http://team.example.com", "example.com")).toBe(
      false,
    );
    expect(isSafeReturnOrigin("https://evil-example.com", "example.com")).toBe(
      false,
    );
    expect(
      isSafeReturnOrigin("https://example.com.evil.net", "example.com"),
    ).toBe(false);
    expect(
      isSafeReturnOrigin("https://team.example.com/path", "example.com"),
    ).toBe(false);
    expect(
      isSafeReturnOrigin("https://user@team.example.com", "example.com"),
    ).toBe(false);
    expect(isSafeReturnOrigin("not a url", "example.com")).toBe(false);
  });

  it("goes back to the callback's own origin when the state's origin is not safe", async () => {
    // Signed by this connector, so only reachable if the app itself started on an http address.
    const t = setup(pinned);
    const { location } = await roundTrip(t, {
      startUrl: "http://team.example.com/api/connect/google/start",
      callbackOrigin: "https://app.example.com",
      cookie: (pair) => pair,
    });
    expect(location.origin).toBe("https://app.example.com");
  });

  it("checks its config at boot", () => {
    const bad: Partial<ConnectorConfig>[] = [
      { redirectOrigin: "https://app.example.com/path" },
      { redirectOrigin: "http://app.example.com" },
      { redirectOrigin: "not a url" },
      { sharedDomain: "com" },
      { sharedDomain: "vercel.app" },
      { redirectOrigin: "https://app.other.com", sharedDomain: "example.com" },
      { stateSecret: "short" },
      { clientSecret: "" },
      { callbackPath: "https://app.example.com/cb" },
      { cookieName: "bad name" },
      { cookiePath: "/elsewhere" },
      { cookiePath: "/api; Domain=evil.example" },
      { stateTtlSeconds: 10 },
    ];
    for (const overrides of bad)
      expect(() => setup(overrides)).toThrow(ConnectError);
    try {
      setup({ stateSecret: "short" });
    } catch (error) {
      expect((error as Error).message).not.toContain("short");
    }
    expect(() =>
      setup({ redirectOrigin: "http://localhost:3000" }),
    ).not.toThrow();
  });
});

describe("accessToken, refresh and revoke", () => {
  async function connected(
    handler: (call: Call) => Response | Promise<Response>,
  ) {
    const t = setup({}, (call) =>
      call.body.get("grant_type") === "authorization_code"
        ? tokenOk()
        : handler(call),
    );
    await roundTrip(t);
    const account = t.stored[0]!;
    t.http.calls.length = 0;
    return { t, account };
  }

  it("refreshes, caches until a minute before expiry, then refreshes again", async () => {
    let n = 0;
    const { t, account } = await connected(() =>
      Response.json({ access_token: `fresh-${++n}`, expires_in: 3600 }),
    );
    expect(
      await t.connector.accessToken(account.sealedRefreshToken, account.aad),
    ).toBe("fresh-1");
    expect(
      await t.connector.accessToken(account.sealedRefreshToken, account.aad),
    ).toBe("fresh-1");
    expect(t.http.calls).toHaveLength(1);
    const call = t.http.calls[0]!;
    expect(call.init.redirect).toBe("error");
    expect(call.body.get("grant_type")).toBe("refresh_token");
    expect(call.body.get("refresh_token")).toBe(REFRESH);
    expect(call.body.get("client_secret")).toBe(CLIENT_SECRET);
    t.tick(3_541_000);
    expect(
      await t.connector.accessToken(account.sealedRefreshToken, account.aad),
    ).toBe("fresh-2");
  });

  it("says revoked on invalid_grant, unavailable (retryable) on 5xx and 429, failed otherwise, never echoing tokens", async () => {
    const cases: [Response, string, boolean][] = [
      [
        Response.json(
          { error: "invalid_grant", error_description: REFRESH },
          { status: 400 },
        ),
        "revoked",
        false,
      ],
      [new Response("busy", { status: 503 }), "unavailable", true],
      [
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "30" },
        }),
        "unavailable",
        true,
      ],
      [
        Response.json({ error: "invalid_client" }, { status: 401 }),
        "failed",
        false,
      ],
    ];
    for (const [response, code, retryable] of cases) {
      const { t, account } = await connected(() => response);
      const error = (await t.connector
        .refresh(account.sealedRefreshToken, account.aad)
        .catch((e: unknown) => e)) as ConnectError;
      expect(error).toBeInstanceOf(ConnectError);
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      if (response.status === 429) expect(error.retryAfterSeconds).toBe(30);
      expectNoSecrets(error.message, t.logs);
    }
    const { t, account } = await connected(() => {
      throw new TypeError(`network ${REFRESH}`);
    });
    const error = (await t.connector
      .accessToken(account.sealedRefreshToken, account.aad)
      .catch((e: unknown) => e)) as ConnectError;
    expect(error.code).toBe("unavailable");
    expectNoSecrets(error.message);
  });

  it("hands back a rotated refresh token sealed to the same row", async () => {
    const { t, account } = await connected(() =>
      Response.json({
        access_token: "a2",
        expires_in: 3600,
        refresh_token: "1//rotated",
      }),
    );
    const onRotate = vi.fn();
    const fresh = await t.connector.refresh(
      account.sealedRefreshToken,
      account.aad,
      { onRotate },
    );
    expect(fresh.sealedRefreshToken).toBeDefined();
    expect(onRotate).toHaveBeenCalledWith(fresh.sealedRefreshToken);
    expect(await t.secrets.open(fresh.sealedRefreshToken!, account.aad)).toBe(
      "1//rotated",
    );
  });

  it("will not open a refresh token against another row", async () => {
    const { t, account } = await connected(() => tokenOk());
    await expect(
      t.connector.accessToken(account.sealedRefreshToken, "google-grant:other"),
    ).rejects.toMatchObject({ code: "decrypt" });
    expect(t.http.calls).toHaveLength(0);
  });

  it("refreshes after a key rotation, and reseal moves the row to the new key", async () => {
    const { t, account } = await connected(() =>
      Response.json({ access_token: "after-rotation", expires_in: 3600 }),
    );
    const newKey = Buffer.from("n".repeat(32)).toString("base64");
    const rotatedSecrets = createSecrets(
      { active: "k2", keys: { k1: KEY, k2: newKey } },
      { purpose: "google-refresh-token" },
    );
    const rotated = setup({ secrets: rotatedSecrets }, () =>
      Response.json({ access_token: "after-rotation", expires_in: 3600 }),
    );
    expect(rotatedSecrets.needsRotation(account.sealedRefreshToken)).toBe(true);
    expect(
      await rotated.connector.accessToken(
        account.sealedRefreshToken,
        account.aad,
      ),
    ).toBe("after-rotation");
    const resealed = await rotatedSecrets.reseal(
      account.sealedRefreshToken,
      account.aad,
    );
    expect(resealed.startsWith("v2.k2.")).toBe(true);
    clearAccessTokenCache();
    expect(await rotated.connector.accessToken(resealed, account.aad)).toBe(
      "after-rotation",
    );
    void t;
  });

  it("revokes at Google, forgets the cached token, and treats already-invalid as gone", async () => {
    let revokeStatus = 200;
    const { t, account } = await connected((call) =>
      call.url === googleProvider.revokeUrl
        ? revokeStatus === 200
          ? new Response("", { status: 200 })
          : Response.json({ error: "invalid_token" }, { status: revokeStatus })
        : Response.json({
            access_token: `a-${t.http.calls.length}`,
            expires_in: 3600,
          }),
    );
    await t.connector.accessToken(account.sealedRefreshToken, account.aad);
    expect(
      await t.connector.revoke(account.sealedRefreshToken, account.aad),
    ).toBe(true);
    const revoke = t.http.calls.find(
      (c) => c.url === googleProvider.revokeUrl,
    )!;
    expect(revoke.init.redirect).toBe("error");
    expect(revoke.body.get("token")).toBe(REFRESH);
    expect(revoke.body.get("client_secret")).toBeNull();
    // The cache was cleared, so the next access token is fetched.
    const before = t.http.calls.length;
    await t.connector.accessToken(account.sealedRefreshToken, account.aad);
    expect(t.http.calls.length).toBe(before + 1);
    revokeStatus = 400;
    expect(
      await t.connector.revoke(account.sealedRefreshToken, account.aad),
    ).toBe(true);
  });

  it("reports false when revoking can't be done", async () => {
    const { t, account } = await connected(
      () => new Response("down", { status: 503 }),
    );
    expect(
      await t.connector.revoke(account.sealedRefreshToken, account.aad),
    ).toBe(false);
    const noRevoke: OAuthProvider = {
      ...googleProvider,
      id: "plain",
      revokeUrl: undefined,
    };
    const plain = setup({ provider: noRevoke });
    expect(
      await plain.connector.revoke(account.sealedRefreshToken, account.aad),
    ).toBe(false);
  });
});

describe("another provider as a plain object", () => {
  it("uses its endpoints, HTTP Basic client auth and its own scope separator", async () => {
    const provider: OAuthProvider = {
      id: "acme",
      authorizeUrl: "https://auth.acme.test/authorize",
      tokenUrl: "https://auth.acme.test/token",
      tokenAuth: "client_secret_basic",
      scopeSeparator: ",",
      defaultScopes: ["read", "write"],
    };
    const t = setup({ provider, scopes: undefined }, () =>
      Response.json({
        access_token: ACCESS,
        refresh_token: REFRESH,
        scope: "read,write",
      }),
    );
    const { authorize, result, started } = await roundTrip(t);
    expect(authorize.origin).toBe("https://auth.acme.test");
    expect(authorize.searchParams.get("scope")).toBe("read,write");
    expect(authorize.searchParams.get("access_type")).toBeNull();
    expect(started.setCookie.startsWith("genesis_connect_acme=")).toBe(true);
    expect(result).toBe("connected");
    const call = t.http.calls[0]!;
    expect((call.init.headers as Record<string, string>)["authorization"]).toBe(
      `Basic ${btoa(`client-id:${CLIENT_SECRET}`)}`,
    );
    expect(call.body.get("client_secret")).toBeNull();
    expect(t.stored[0]!.aad).toBe("acme-grant:grant-1");
  });
});
