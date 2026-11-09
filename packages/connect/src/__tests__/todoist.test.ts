// @feat:connect
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccessTokenCache,
  createConnector,
  type ConnectedAccount,
  type SharedGrant,
} from "../oauth";
import { TODOIST_SCOPES, todoistProvider } from "../providers";
import { createSecrets } from "../secrets";
import { verifyWebhookSignature } from "../webhooks";

const KEY = Buffer.from("k".repeat(32)).toString("base64");
const STATE_SECRET = Buffer.from("s".repeat(32)).toString("base64");
const CLIENT_SECRET = "todoist-client-secret";
const CALLBACK = "/api/connect/todoist/callback";

type Call = { url: string; init: RequestInit; body: URLSearchParams };

function setup(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init, body: new URLSearchParams(String(init.body ?? "")) };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof globalThis.fetch;
  const stored: ConnectedAccount[] = [];
  let clock = Date.parse("2026-11-09T12:00:00Z");
  const secrets = createSecrets(KEY, { purpose: "todoist-refresh-token" });
  const connector = createConnector({
    provider: todoistProvider,
    clientId: "todoist-client",
    clientSecret: CLIENT_SECRET,
    stateSecret: STATE_SECRET,
    secrets,
    callbackPath: CALLBACK,
    scopes: [TODOIST_SCOPES.dataReadWrite, TODOIST_SCOPES.dataDelete],
    fetch,
    now: () => clock,
    randomId: () => "grant-1",
    store: (account) => {
      stored.push(account);
    },
  });
  return { connector, secrets, calls, stored, now: () => clock, tick: (ms: number) => (clock += ms) };
}

const granted = (extra: Record<string, unknown> = {}) =>
  Response.json({
    access_token: "access-1",
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "refresh-1",
    scope: "data:read_write,data:delete",
    ...extra,
  });

async function connect(t: ReturnType<typeof setup>) {
  const started = await t.connector.start(new Request("https://app.example.com/start", { method: "POST" }), {
    subject: "user-1",
    returnTo: "/settings",
  });
  const authorize = new URL(started.url);
  const back = new URL(CALLBACK, "https://app.example.com");
  back.searchParams.set("state", authorize.searchParams.get("state")!);
  back.searchParams.set("code", "the-code");
  const response = await t.connector.callback(
    new Request(back, { headers: { cookie: started.setCookie.split(";")[0]! } }),
  );
  return { authorize, location: new URL(response.headers.get("location")!) };
}

beforeEach(() => clearAccessTokenCache());

describe("todoistProvider", () => {
  it("asks for comma-joined scopes, trades the code with the secret in the body, and keeps the rotating refresh token", async () => {
    const t = setup(() => granted());
    const { authorize, location } = await connect(t);
    expect(authorize.origin + authorize.pathname).toBe("https://app.todoist.com/oauth/authorize");
    expect(authorize.searchParams.get("scope")).toBe("data:read_write,data:delete");
    expect(authorize.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("connect")).toBe("connected");
    const exchange = t.calls[0]!;
    expect(exchange.url).toBe("https://api.todoist.com/oauth/access_token");
    expect(exchange.body.get("client_secret")).toBe(CLIENT_SECRET);
    expect(exchange.body.get("code")).toBe("the-code");
    const account = t.stored[0]!;
    expect(account.scopes).toEqual(["data:read_write", "data:delete"]);
    expect(await t.secrets.open(account.sealedRefreshToken, account.aad)).toBe("refresh-1");
  });

  it("turns the connection down when a scope was not granted", async () => {
    const t = setup(() => granted({ scope: "data:read_write" }));
    const { location } = await connect(t);
    expect(location.searchParams.get("connect")).toBe("scope");
    expect(t.stored).toHaveLength(0);
  });

  it("revokes with RFC 7009 and HTTP Basic client auth, not the secret in the body", async () => {
    const t = setup((call) => (call.url.endsWith("/api/v1/revoke") ? new Response("null") : granted()));
    await connect(t);
    const account = t.stored[0]!;
    expect(await t.connector.revoke(account.sealedRefreshToken, account.aad)).toBe(true);
    const revoke = t.calls.at(-1)!;
    expect(revoke.url).toBe("https://api.todoist.com/api/v1/revoke");
    expect(revoke.init.method).toBe("POST");
    const headers = revoke.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe(`Basic ${btoa(`todoist-client:${CLIENT_SECRET}`)}`);
    expect(revoke.body.get("client_secret")).toBeNull();
    expect(revoke.body.get("token")).toBe("refresh-1");
  });
});

describe("accessToken with a shared grant", () => {
  /** The grant as a database would keep it, with a lock that queues callers like a row lock. */
  function store(sealed: string) {
    const row = { sealed, access: null as { sealed: string; expiresAt: number } | null };
    let queue = Promise.resolve();
    const events: string[] = [];
    const grant: SharedGrant = {
      lock: (run) => {
        const next = queue.then(async () => {
          events.push("lock");
          try {
            return await run();
          } finally {
            events.push("unlock");
          }
        });
        queue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      },
      current: async () => {
        events.push("current");
        return row.sealed;
      },
      readAccessToken: async () => row.access,
      writeAccessToken: async (s, expiresAt) => {
        row.access = { sealed: s, expiresAt };
      },
    };
    const onRotate = async (s: string) => {
      events.push("rotate");
      row.sealed = s;
    };
    return { row, grant, onRotate, events };
  }

  it("refreshes once inside the lock, stores the rotation before letting go, and shares the access token", async () => {
    let n = 0;
    const t = setup((call) =>
      call.body.get("grant_type") === "refresh_token"
        ? Response.json({ access_token: `access-${++n + 1}`, expires_in: 3600, refresh_token: `refresh-${n + 1}` })
        : granted(),
    );
    await connect(t);
    const account = t.stored[0]!;
    const db = store(account.sealedRefreshToken);
    const options = { grant: db.grant, onRotate: db.onRotate };
    const [a, b] = await Promise.all([
      t.connector.accessToken(account.sealedRefreshToken, account.aad, options),
      t.connector.accessToken(account.sealedRefreshToken, account.aad, options),
    ]);
    expect(a).toBe("access-2");
    expect(b).toBe("access-2");
    expect(t.calls.filter((c) => c.body.get("grant_type") === "refresh_token")).toHaveLength(1);
    expect(db.events).toEqual(["lock", "current", "rotate", "unlock"]);
    expect(await t.secrets.open(db.row.sealed, account.aad)).toBe("refresh-2");
    // The access token is kept sealed, bound to the grant.
    expect(db.row.access!.sealed).not.toContain("access-2");
    expect(await t.secrets.open(db.row.access!.sealed, `${account.aad}:access`)).toBe("access-2");

    // Another instance (no memory cache) uses the stored access token: no refresh.
    clearAccessTokenCache();
    expect(await t.connector.accessToken(account.sealedRefreshToken, account.aad, options)).toBe("access-2");
    expect(t.calls.filter((c) => c.body.get("grant_type") === "refresh_token")).toHaveLength(1);
  });

  it("refreshes from the grant's current token, never the stale one it was handed", async () => {
    let n = 0;
    const t = setup((call) =>
      call.body.get("grant_type") === "refresh_token"
        ? Response.json({ access_token: `access-${++n + 1}`, expires_in: 3600, refresh_token: `refresh-${n + 1}` })
        : granted(),
    );
    await connect(t);
    const account = t.stored[0]!;
    const stale = account.sealedRefreshToken;
    const db = store(stale);
    const options = { grant: db.grant, onRotate: db.onRotate };
    await t.connector.accessToken(stale, account.aad, options);
    // An hour on, another instance still holds the first (now used) token.
    t.tick(3_600_000);
    clearAccessTokenCache();
    expect(await t.connector.accessToken(stale, account.aad, options)).toBe("access-3");
    const refreshes = t.calls.filter((c) => c.body.get("grant_type") === "refresh_token");
    expect(refreshes.map((c) => c.body.get("refresh_token"))).toEqual(["refresh-1", "refresh-2"]);
  });

  it("a waiter takes the token the holder stored instead of refreshing again", async () => {
    const t = setup((call) =>
      call.body.get("grant_type") === "refresh_token"
        ? Response.json({ access_token: "access-2", expires_in: 3600, refresh_token: "refresh-2" })
        : granted(),
    );
    await connect(t);
    const account = t.stored[0]!;
    const db = store(account.sealedRefreshToken);
    const options = { grant: db.grant, onRotate: db.onRotate };
    const first = t.connector.accessToken(account.sealedRefreshToken, account.aad, options);
    // A second instance: its own memory, the same database.
    clearAccessTokenCache();
    const other = createConnector({
      provider: todoistProvider,
      clientId: "todoist-client",
      clientSecret: CLIENT_SECRET,
      stateSecret: STATE_SECRET,
      secrets: t.secrets,
      callbackPath: CALLBACK,
      fetch: (async () => {
        throw new Error("the second instance must not refresh");
      }) as unknown as typeof fetch,
      store: () => undefined,
      // The test's clock, not the wall's: the stored token's expiry is on it.
      now: t.now,
    });
    await first;
    clearAccessTokenCache();
    expect(await other.accessToken(account.sealedRefreshToken, account.aad, options)).toBe("access-2");
  });

  it("needs onRotate with a rotating provider, as without a shared grant", async () => {
    const t = setup((call) =>
      call.body.get("grant_type") === "refresh_token"
        ? Response.json({ access_token: "access-2", expires_in: 3600, refresh_token: "refresh-2" })
        : granted(),
    );
    await connect(t);
    const account = t.stored[0]!;
    const db = store(account.sealedRefreshToken);
    await expect(
      t.connector.accessToken(account.sealedRefreshToken, account.aad, { grant: db.grant }),
    ).rejects.toMatchObject({ code: "usage" });
    expect(db.events).toEqual(["lock", "current", "unlock"]);
    // Refused before the refresh, so the stored token is still the one Todoist expects.
    expect(t.calls.filter((c) => c.body.get("grant_type") === "refresh_token")).toHaveLength(0);
    // Without a grant too.
    await expect(t.connector.accessToken(account.sealedRefreshToken, account.aad)).rejects.toMatchObject({ code: "usage" });
    expect(t.calls.filter((c) => c.body.get("grant_type") === "refresh_token")).toHaveLength(0);
  });

  it("refresh refuses grant: it would refresh outside the lock", async () => {
    const t = setup(() => granted());
    await connect(t);
    const account = t.stored[0]!;
    const db = store(account.sealedRefreshToken);
    await expect(
      t.connector.refresh(account.sealedRefreshToken, account.aad, { grant: db.grant, onRotate: db.onRotate }),
    ).rejects.toMatchObject({ code: "usage" });
    expect(t.calls.filter((c) => c.body.get("grant_type") === "refresh_token")).toHaveLength(0);
  });

  it("forget with the grant drops the shared copy too, so a refused token isn't handed back", async () => {
    let n = 0;
    const t = setup((call) =>
      call.body.get("grant_type") === "refresh_token"
        ? Response.json({ access_token: `access-${++n + 1}`, expires_in: 3600, refresh_token: `refresh-${n + 1}` })
        : granted(),
    );
    await connect(t);
    const account = t.stored[0]!;
    const db = store(account.sealedRefreshToken);
    const options = { grant: db.grant, onRotate: db.onRotate };
    expect(await t.connector.accessToken(account.sealedRefreshToken, account.aad, options)).toBe("access-2");
    // Todoist refuses access-2 (a 401): forget it here and in the shared row.
    await t.connector.forget(db.row.sealed, account.aad, { grant: db.grant });
    expect(await t.connector.accessToken(db.row.sealed, account.aad, options)).toBe("access-3");
    expect(t.calls.filter((c) => c.body.get("grant_type") === "refresh_token")).toHaveLength(2);
  });
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event_name: "item:added", user_id: "1" });
  const sign = (secret: string, payload: string, encoding: "base64" | "hex" = "base64") =>
    createHmac("sha256", secret).update(payload).digest(encoding);

  it("accepts the HMAC of the raw body (base64, Todoist's header)", async () => {
    expect(
      await verifyWebhookSignature({ secret: CLIENT_SECRET, payload: body, signature: sign(CLIENT_SECRET, body) }),
    ).toBe(true);
    expect(
      await verifyWebhookSignature({
        secret: CLIENT_SECRET,
        payload: new TextEncoder().encode(body),
        signature: sign(CLIENT_SECRET, body),
      }),
    ).toBe(true);
  });

  it("refuses another secret, a changed body, and a missing or empty signature", async () => {
    for (const [secret, payload, signature] of [
      [CLIENT_SECRET, body, sign("other", body)],
      [CLIENT_SECRET, `${body} `, sign(CLIENT_SECRET, body)],
      [CLIENT_SECRET, body, null],
      [CLIENT_SECRET, body, ""],
      ["", body, sign("", body)],
      [CLIENT_SECRET, body, "not-base64!"],
    ] as const) {
      expect(await verifyWebhookSignature({ secret, payload, signature })).toBe(false);
    }
  });

  it("reads hex signatures behind a prefix (GitHub's sha256=)", async () => {
    const signature = `sha256=${sign("s", body, "hex")}`;
    expect(await verifyWebhookSignature({ secret: "s", payload: body, signature, encoding: "hex", prefix: "sha256=" })).toBe(
      true,
    );
    expect(await verifyWebhookSignature({ secret: "s", payload: body, signature: signature.slice(7), encoding: "hex", prefix: "sha256=" })).toBe(
      false,
    );
  });
});

describe("forget and rotation warnings", () => {
  it("forget drops this process's cached access token, so the next call refreshes", async () => {
    let n = 0;
    const t = setup((call) =>
      call.body.get("grant_type") === "refresh_token"
        ? Response.json({ access_token: `access-${++n + 1}`, expires_in: 3600, refresh_token: "refresh-1" })
        : granted(),
    );
    await connect(t);
    const account = t.stored[0]!;
    const onRotate = vi.fn();
    expect(await t.connector.accessToken(account.sealedRefreshToken, account.aad, { onRotate })).toBe("access-2");
    expect(await t.connector.accessToken(account.sealedRefreshToken, account.aad, { onRotate })).toBe("access-2");
    await t.connector.forget(account.sealedRefreshToken, account.aad);
    expect(await t.connector.accessToken(account.sealedRefreshToken, account.aad, { onRotate })).toBe("access-3");
  });
});

