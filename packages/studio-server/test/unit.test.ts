import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { isDataWriteError } from "@marktiderman/genesis-core/schema";
import { byResource, createStudioHandler, databaseDecides, jwtAuth, jwtVerifier, switchToUser, studioSetupSql, supabaseAuth, supabaseStudio, type StudioDatabase } from "../src/index";
import { triggerAdvances, withoutSettings, type CatalogTrigger } from "../src/catalog";
import { createStudioProvider, createSupabaseStudioProvider } from "../src/client";

const SECRET = "unit-test-secret-with-at-least-32-chars!!";

function request(token?: string): Request {
  return new Request("http://studio.test", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function sign(claims: Record<string, unknown>, secret = SECRET, exp = "5m") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

describe("jwtAuth", () => {
  const auth = jwtAuth({ secret: SECRET, audience: "authenticated" });

  it("accepts a valid token and returns its claims", async () => {
    const claims = await auth(request(await sign({ sub: "u-1", aud: "authenticated", role: "authenticated" })));
    expect(claims).toMatchObject({ sub: "u-1", role: "authenticated" });
  });

  it("rejects a missing, forged, expired, wrong-audience or subject-less token", async () => {
    expect(await auth(request())).toBeNull();
    expect(await auth(request(await sign({ sub: "u", aud: "authenticated" }, "another-secret-with-at-least-32-chars!")))).toBeNull();
    expect(await auth(request(await sign({ sub: "u", aud: "authenticated" }, SECRET, "-1m")))).toBeNull();
    expect(await auth(request(await sign({ sub: "u", aud: "anon" })))).toBeNull();
    expect(await auth(request(await sign({ aud: "authenticated" })))).toBeNull();
  });

  it("rejects an unsigned token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "u", aud: "authenticated" })).toString("base64url");
    expect(await auth(request(`${header}.${body}.`))).toBeNull();
  });

  it("rejects a token that never expires", async () => {
    const forever = await new SignJWT({ sub: "u", aud: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(SECRET));
    expect(await auth(request(forever))).toBeNull();
  });

  it("needs exactly one key source, and an audience", () => {
    expect(() => jwtAuth({ audience: "a" })).toThrow(/exactly one/);
    expect(() => jwtAuth({ secret: SECRET, jwksUrl: "https://x.test/jwks", audience: "a" })).toThrow(/exactly one/);
    expect(() => jwtAuth({ secret: SECRET, audience: [] })).toThrow(/audience/);
  });
});

describe("createStudioHandler login check", () => {
  it("retries a login check that failed, instead of staying off until a restart", async () => {
    let attempts = 0;
    const database: StudioDatabase = {
      async inspectLogin() {
        attempts += 1;
        if (attempts === 1) throw new Error("database unreachable");
        return { name: "studio_login", superuser: false, bypassRls: false, inherit: false };
      },
      async asUser() {
        return { resources: [] } as never;
      },
      async end() {},
    };
    const handler = createStudioHandler({
      database,
      auth: jwtAuth({ secret: SECRET, audience: "authenticated" }),
      authorize: () => false,
    });
    const post = async () =>
      handler(
        new Request("http://studio.test", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${await sign({ sub: "u", aud: "authenticated" })}`,
          },
          body: JSON.stringify({ op: "resources" }),
        }),
      );
    expect((await post()).status).toBe(500);
    expect((await post()).status).toBe(200);
    expect(attempts).toBe(2);
  });

  it("keeps a refusal when a slower check of the same login finds nothing", async () => {
    // Two first requests each check the login, both at once. Each check is held
    // open until released, so the order they finish in is the test's to choose.
    type Login = Awaited<ReturnType<StudioDatabase["inspectLogin"]>>;
    const pending: Array<(login: Login) => void> = [];
    // Resolves when the next check reaches the database. Each request signs and
    // verifies a token first, so under load the second can overtake the first;
    // waiting for each arrival in turn keeps pending[0] the first request's.
    let arrived = () => {};
    const nextArrival = () => new Promise<void>((resolve) => (arrived = resolve));
    const database: StudioDatabase = {
      inspectLogin: () =>
        new Promise<Login>((resolve) => {
          pending.push(resolve);
          arrived();
        }),
      async asUser() {
        return { resources: [] } as never;
      },
      async end() {},
    };
    const handler = createStudioHandler({
      database,
      auth: jwtAuth({ secret: SECRET, audience: "authenticated" }),
      authorize: () => false,
    });
    const post = async () =>
      handler(
        new Request("http://studio.test", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${await sign({ sub: "u", aud: "authenticated" })}`,
          },
          body: JSON.stringify({ op: "resources" }),
        }),
      );
    let arrival = nextArrival();
    const first = post();
    await arrival;
    arrival = nextArrival();
    const second = post();
    await arrival;
    expect(pending).toHaveLength(2);
    // The unsafe answer comes back first, then the safe one.
    pending[0]!({ name: "studio_login", superuser: true, bypassRls: false, inherit: false });
    expect((await first).status).toBe(500);
    pending[1]!({ name: "studio_login", superuser: false, bypassRls: false, inherit: false });
    expect((await second).status).toBe(500);
    // Every request after that is refused, without checking again.
    expect((await post()).status).toBe(500);
    expect(pending).toHaveLength(2);
  });
});

describe("triggerAdvances", () => {
  const base: CatalogTrigger = {
    name: "t",
    functionName: "moddatetime",
    language: "c",
    source: "moddatetime",
    forEachRow: true,
    before: true,
    onUpdate: true,
    onInsert: false,
    onDelete: false,
    columnSpecific: false,
    conditional: false,
    args: ["updated_at"],
  };

  it("trusts moddatetime on the same column", () => {
    expect(triggerAdvances(base, "updated_at")).toBe(true);
    expect(triggerAdvances(base, "modified_at")).toBe(false);
  });

  it("trusts a PL/pgSQL body that assigns NEW.column", () => {
    const plpgsql = { ...base, functionName: "touch", language: "plpgsql", args: [] };
    expect(triggerAdvances({ ...plpgsql, source: "begin NEW.updated_at := now(); return NEW; end" }, "updated_at")).toBe(true);
    expect(triggerAdvances({ ...plpgsql, source: 'begin new."version" = old.version + 1; return new; end' }, "version")).toBe(true);
    expect(triggerAdvances({ ...plpgsql, source: "begin new.updated_at_extra := now(); return new; end" }, "updated_at")).toBe(false);
  });

  it("distrusts a trigger that doesn't fire on every update", () => {
    expect(triggerAdvances({ ...base, before: false }, "updated_at")).toBe(false);
    expect(triggerAdvances({ ...base, forEachRow: false }, "updated_at")).toBe(false);
    expect(triggerAdvances({ ...base, onUpdate: false }, "updated_at")).toBe(false);
    expect(triggerAdvances({ ...base, columnSpecific: true }, "updated_at")).toBe(false);
    expect(triggerAdvances({ ...base, conditional: true }, "updated_at")).toBe(false);
  });
});

describe("byResource", () => {
  const authorize = byResource(
    {
      "public.clients": { read: true, update: ["notes"] },
      "public.quiz": { read: { except: ["answer_key"] } },
    },
    { who: (claims) => claims.app_metadata === "staff" },
  );
  const ctx = (resource: string, action: "read" | "update", claims: Record<string, unknown> = { app_metadata: "staff" }) =>
    authorize({ request: request(), claims: { sub: "u", ...claims }, resource, action });

  it("denies everyone `who` doesn't admit, and requires `who`", () => {
    expect(ctx("public.clients", "read", { app_metadata: "customer" })).toBe(false);
    expect(() => byResource({}, undefined as never)).toThrow(/needs `who`/);
  });

  it("denies anything not listed, and leaves a listed table read-only without update", () => {
    expect(ctx("public.other", "read")).toBe(false);
    expect(ctx("constructor", "read")).toBe(false);
    expect(ctx("public.quiz", "update")).toBe(false);
  });

  it("allows row actions by name, and comments, only when listed", () => {
    const rules = byResource(
      { "public.a": { read: true, actions: ["approve"], comment: true }, "public.b": { read: true, actions: true } },
      { who: () => true },
    );
    const run = (resource: string, rowAction?: string) =>
      rules({ request: request(), claims: { sub: "u" }, resource, action: "run", ...(rowAction ? { rowAction } : {}) });
    expect(run("public.a", "approve")).toBe(true);
    expect(run("public.a", "reject")).toBe(false);
    expect(run("public.a")).toBe(false);
    expect(run("public.b", "anything")).toBe(true);
    expect(rules({ request: request(), claims: { sub: "u" }, resource: "public.a", action: "comment" })).toBe(true);
    expect(rules({ request: request(), claims: { sub: "u" }, resource: "public.b", action: "comment" })).toBe(false);
  });

  it("narrows columns", () => {
    expect(ctx("public.clients", "read")).toBe(true);
    expect(ctx("public.clients", "update")).toEqual({ allow: true, columns: ["notes"] });
    expect(ctx("public.quiz", "read")).toEqual({ allow: true, exceptColumns: ["answer_key"] });
  });
});

describe("studioSetupSql", () => {
  it("makes the audit log writable only through the definer function", () => {
    const sql = studioSetupSql();
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toMatch(/revoke all on genesis_studio\.audit_log from "authenticated"/);
    expect(sql).toMatch(/current_setting\('request\.jwt\.claims', true\)/);
    expect(sql).not.toMatch(/p_actor|p_caller/);
  });

  it("quotes a custom role", () => {
    expect(studioSetupSql({ role: 'odd"role' })).toContain('"odd""role"');
  });
});

describe("createStudioProvider", () => {
  function fakeFetch(status: number, body: unknown, seen: Request[] = []) {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(new URL(String(input), "https://app.test"), init));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  }

  it("fails as unauthenticated without calling the server when nobody is signed in", async () => {
    const seen: Request[] = [];
    const provider = createStudioProvider({ url: "/api/studio", getAccessToken: () => null, fetch: fakeFetch(200, {}, seen) });
    const error = await provider.listResources().catch((e: unknown) => e);
    expect(isDataWriteError(error) && error.outcome).toBe("unauthenticated");
    expect(seen).toHaveLength(0);
  });

  it("sends the bearer token and the protocol version", async () => {
    const seen: Request[] = [];
    const provider = createStudioProvider({
      url: "https://app.test/api/studio",
      getAccessToken: async () => "tok",
      fetch: fakeFetch(200, { resources: [] }, seen),
    });
    await provider.listResources();
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer tok");
    expect(await seen[0]!.json()).toEqual({ v: 1, op: "resources" });
  });

  it("raises a conflict with the current row", async () => {
    const provider = createStudioProvider({
      url: "/api/studio",
      getAccessToken: () => "tok",
      fetch: fakeFetch(409, {
        error: { outcome: "conflict", message: "changed", current: { notes: "theirs" }, currentVersion: "v2" },
      }),
    });
    const error = await provider.describe("public.clients").catch((e: unknown) => e);
    expect(isDataWriteError(error)).toBe(true);
    expect(error).toMatchObject({ outcome: "conflict", current: { notes: "theirs" }, currentVersion: "v2" });
  });

  it("maps not_found to gone and bad_request to invalid", async () => {
    for (const [wire, outcome] of [
      ["not_found", "gone"],
      ["bad_request", "invalid"],
    ] as const) {
      const provider = createStudioProvider({
        url: "/api/studio",
        getAccessToken: () => "tok",
        fetch: fakeFetch(400, { error: { outcome: wire, message: "x" } }),
      });
      const error = await provider.listResources().catch((e: unknown) => e);
      expect(error).toMatchObject({ outcome });
    }
  });

  it("puts the exact version token in the version field of each row", async () => {
    let call = 0;
    const responses = [
      { schema: { name: "public.t", key: "id", fields: [], access: { read: true, update: true }, version: { field: "updated_at", kind: "timestamp" } } },
      { rows: [{ values: { id: 1, updated_at: "2026-01-01 00:00:00.123456+00" }, version: "2026-01-01 00:00:00.123456+00" }], total: 1 },
    ];
    const provider = createStudioProvider({
      url: "/api/studio",
      getAccessToken: () => "tok",
      fetch: (async () => new Response(JSON.stringify(responses[call++]), { status: 200 })) as typeof fetch,
    });
    const list = await provider.getList("public.t", {});
    expect(list.data[0]).toMatchObject({ id: 1, updated_at: "2026-01-01 00:00:00.123456+00" });
  });
});

describe("backoffDelay", () => {
  it("doubles from the base, stays within the jitter band, and caps", async () => {
    const { backoffDelay } = await import("../src/outbox");
    expect(backoffDelay(1, 1000, 60_000, 0)).toBe(1000);
    expect(backoffDelay(3, 1000, 60_000, 0)).toBe(4000);
    expect(backoffDelay(20, 1000, 60_000, 0)).toBe(60_000);
    expect(backoffDelay(2, 1000, 60_000, 0.25, () => 0)).toBe(1500);
    expect(backoffDelay(2, 1000, 60_000, 0.25, () => 1)).toBe(2500);
  });

  it("spreads the default 10 attempts over about a day", async () => {
    const { backoffDelay } = await import("../src/outbox");
    let total = 0;
    for (let attempt = 1; attempt < 10; attempt++) total += backoffDelay(attempt, 180_000, 12 * 3600_000, 0);
    expect(total / 3600_000).toBeGreaterThan(20);
    expect(total / 3600_000).toBeLessThan(30);
  });
});

describe("createStudioProvider writes", () => {
  it("sends create, delete with its version, and history", async () => {
    const sent: any[] = [];
    const replies: Record<string, unknown> = {
      describe: { schema: { name: "public.t", key: "id", fields: [], access: { read: true, update: true }, version: { field: "v", kind: "integer" } } },
      create: { row: { values: { id: 9 }, version: "1" }, id: 9 },
      delete: {},
      history: { entries: [{ id: "a" }] },
    };
    const provider = createStudioProvider({
      url: "/api/studio",
      getAccessToken: () => "tok",
      fetch: (async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        sent.push(body);
        return new Response(JSON.stringify(replies[body.op]), { status: 200 });
      }) as typeof fetch,
    });
    const created = await provider.create("public.t", { data: { name: "x" } as never });
    expect(created.data).toMatchObject({ id: 9, v: "1" });
    await provider.deleteOne("public.t", { id: 9, expectedVersion: "1" });
    expect(await provider.history("public.t", { id: 9 })).toEqual([{ id: "a" }]);
    expect(sent.map((b) => b.op)).toEqual(["describe", "create", "delete", "history"]);
    expect(sent[2]).toMatchObject({ id: 9, expectedVersion: "1" });
    expect((await provider.capabilities()).multiSort).toBe(true);
  });
});

describe("comment settings", () => {
  it("keeps @genesis settings out of descriptions", () => {
    expect(withoutSettings('People in a program. @genesis {"label": "Clients"}')).toBe("People in a program.");
    expect(withoutSettings('@genesis {"label": "Clients"}')).toBeNull();
    expect(withoutSettings("Plain.")).toBe("Plain.");
    expect(withoutSettings(null)).toBeNull();
  });
});

describe("databaseDecides", () => {
  const ask = (authorize: ReturnType<typeof databaseDecides>, resource: string, action: "read" | "update" | "delete" | "comment", claims: Record<string, unknown> = {}) =>
    authorize({ request: request(), claims: { sub: "u", ...claims }, resource, action });

  it("allows everything for signed-in users, leaving the rest to the database", () => {
    const authorize = databaseDecides();
    for (const action of ["read", "update", "delete", "comment"] as const) expect(ask(authorize, "public.any", action)).toBe(true);
    expect(ask(authorize, "public.any", "read", { is_anonymous: true })).toBe(false);
    expect(authorize({ request: request(), claims: {} as never, resource: "public.any", action: "read" })).toBe(false);
  });

  it("narrows by who, except and per-table rules", () => {
    const authorize = databaseDecides({
      who: (claims) => claims.app_metadata === "staff",
      except: ["public.secrets"],
      rules: { "public.quiz": { read: { except: ["answer_key"] } } },
    });
    expect(ask(authorize, "public.any", "read")).toBe(false);
    const staff = { app_metadata: "staff" };
    expect(ask(authorize, "public.any", "update", staff)).toBe(true);
    expect(ask(authorize, "public.secrets", "read", staff)).toBe(false);
    expect(ask(authorize, "public.quiz", "read", staff)).toEqual({ allow: true, exceptColumns: ["answer_key"] });
    expect(ask(authorize, "public.quiz", "update", staff)).toBe(false);
  });

  it("builds a Supabase handler with no other setup", () => {
    const handler = supabaseStudio({ url: "https://example.supabase.co", database: "postgres://user:pw@127.0.0.1:1/db" });
    expect(typeof handler).toBe("function");
    void handler.close();
  });
});

describe("createSupabaseStudioProvider", () => {
  function fakeSupabase() {
    let session: { access_token: string; user: { id: string } } | null = { access_token: "tok-1", user: { id: "u1" } };
    const listeners: Array<(event: string, s: typeof session) => void> = [];
    return {
      client: {
        auth: {
          getSession: async () => ({ data: { session } }),
          onAuthStateChange: (cb: (event: string, s: typeof session) => void) => {
            listeners.push(cb);
            return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(cb), 1) } } };
          },
        },
      },
      signIn(id: string, token: string) {
        session = { access_token: token, user: { id } };
        for (const l of [...listeners]) l("SIGNED_IN", session);
      },
      signOut() {
        session = null;
        for (const l of [...listeners]) l("SIGNED_OUT", null);
      },
    };
  }

  it("sends the current session's token, and reports each user change once", async () => {
    const supa = fakeSupabase();
    const seen: string[] = [];
    const provider = createSupabaseStudioProvider(supa.client, {
      fetch: (async (_url: string, init: RequestInit) => {
        seen.push((init.headers as Record<string, string>).authorization ?? "");
        return new Response(JSON.stringify({ resources: [] }), { status: 200 });
      }) as typeof fetch,
    });
    await provider.listResources();
    supa.signIn("u2", "tok-2");
    await provider.listResources();
    expect(seen).toEqual(["Bearer tok-1", "Bearer tok-2"]);

    const users: Array<string | null> = [];
    const stop = provider.session.subscribe((id) => users.push(id));
    await new Promise((r) => setTimeout(r, 0));
    supa.signIn("u2", "tok-3"); // same user, new token: no change to report
    supa.signOut();
    stop();
    supa.signIn("u3", "tok-4");
    expect(users).toEqual(["u2", null]);
    await expect(provider.listResources()).resolves.toEqual([]);
  });
});

describe("CORS, for a studio hosted on another origin", () => {
  const db: StudioDatabase = {
    asUser: async () => ({ resources: [] }) as never,
    inspectLogin: async () => ({ name: "studio_login", superuser: false, bypassRls: false }),
    end: async () => {},
  } as unknown as StudioDatabase;
  const handler = createStudioHandler({
    database: db,
    auth: async () => ({ sub: "u", role: "authenticated" }),
    authorize: () => true,
    allowedOrigins: ["https://app.example.com"],
  });

  it("answers the preflight for listed origins only, and tags responses for them", async () => {
    const ok = await handler(new Request("https://fn.example.com/studio", { method: "OPTIONS", headers: { origin: "https://app.example.com" } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(ok.headers.get("access-control-allow-headers")).toMatch(/authorization/);
    const other = await handler(new Request("https://fn.example.com/studio", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(other.status).toBe(403);
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    const post = await handler(
      new Request("https://fn.example.com/studio", {
        method: "POST",
        headers: { origin: "https://app.example.com", "content-type": "application/json" },
        body: JSON.stringify({ op: "resources" }),
      }),
    );
    expect(post.status).toBe(200);
    expect(post.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });
});

describe("supabaseAuth issuers", () => {
  const secret = "unit-test-secret-with-at-least-32-chars!!";
  const token = (iss: string) =>
    new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer(iss)
      .setAudience("authenticated")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(secret));
  const req = async (iss: string) => new Request("http://x", { headers: { authorization: `Bearer ${await token(iss)}` } });

  it("only accepts the project's own issuer", async () => {
    const auth = supabaseAuth({ url: "https://abc.supabase.co", jwtSecret: secret });
    expect(await auth(await req("https://abc.supabase.co/auth/v1"))).toMatchObject({ sub: "u1" });
    expect(await auth(await req("https://other.supabase.co/auth/v1"))).toBeNull();
    expect(await auth(await req("http://127.0.0.1:54321/auth/v1"))).toBeNull();
  });

  it("accepts the browser's localhost issuer inside the local stack", async () => {
    const auth = supabaseAuth({ url: "http://kong:8000", jwtSecret: secret });
    expect(await auth(await req("http://127.0.0.1:54321/auth/v1"))).toMatchObject({ sub: "u1" });
    expect(await auth(await req("http://kong:8000/auth/v1"))).toMatchObject({ sub: "u1" });
    expect(await auth(await req("https://abc.supabase.co/auth/v1"))).toBeNull();
  });
});

describe("jwtVerifier", () => {
  const verify = jwtVerifier({ secret: SECRET, audience: "authenticated" });

  it("checks a raw token by jwtAuth's rules", async () => {
    expect(await verify(await sign({ sub: "u-1", aud: "authenticated" }))).toMatchObject({ sub: "u-1" });
    expect(await verify(await sign({ sub: "u", aud: "anon" }))).toBeNull();
    expect(await verify(await sign({ sub: "u", aud: "authenticated" }, SECRET, "-1m"))).toBeNull();
    expect(await verify("")).toBeNull();
  });
});

describe("switchToUser", () => {
  const identity = { role: "authenticated", claims: { sub: "u-1", role: "authenticated", email: "a@b.test" } };

  /** A tagged query that records each statement as parameterised text. */
  function recorder() {
    const calls: { text: string; values: unknown[] }[] = [];
    const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, ""), values });
      return [];
    };
    return { calls, query };
  }

  it("sets every setting as a parameter, then checks current_user", async () => {
    const { calls, query } = recorder();
    await switchToUser(query, identity, { headers: { "x-app": "gamify" }, statementTimeoutMs: 5000 });
    expect(calls[0]!.text).toContain("set_config('role', $1::text, true)");
    expect(calls[0]!.text).toContain("set_config('request.headers', $6::text, true)");
    expect(calls[0]!.values).toEqual([
      "authenticated",
      JSON.stringify(identity.claims),
      "u-1",
      "authenticated",
      "a@b.test",
      JSON.stringify({ "x-app": "gamify" }),
      "",
      "",
      "{}",
      "5000",
      "authenticated",
      "off",
    ]);
    expect(calls[1]!.text).toMatch(/^do \$check\$/);
    expect(calls[1]!.values).toEqual([]);
  });

  it("refuses a role outside allowRoles, and a token whose role differs", async () => {
    const { query, calls } = recorder();
    await expect(switchToUser(query, { role: "service_role", claims: { sub: "u" } })).rejects.toThrow(/allowRoles/);
    await expect(switchToUser(query, { role: "postgres", claims: {} })).rejects.toThrow(/allowRoles/);
    await expect(
      switchToUser(query, { role: "authenticated", claims: { sub: "u", role: "service_role" } }),
    ).rejects.toThrow(/token's role/);
    await expect(switchToUser(query, { role: "staff", claims: { role: "staff" } }, { allowRoles: ["staff"] })).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it("refuses a statement timeout that would turn it off", async () => {
    const { query } = recorder();
    for (const ms of [0, -1, Number.NaN]) {
      await expect(switchToUser(query, identity, { statementTimeoutMs: ms })).rejects.toThrow(/at least 1/);
    }
  });

  it("refuses credential or badly named headers, and a missing role", async () => {
    const { query, calls } = recorder();
    for (const name of ["authorization", "cookie", "apikey", "x-api-key", "x-auth-token", "x-access-token", "x-session-id", "x-csrf-token"]) {
      await expect(switchToUser(query, identity, { headers: { [name]: "x" } })).rejects.toThrow(/credential/);
    }
    await expect(switchToUser(query, identity, { headers: { "X-App": "x" } })).rejects.toThrow(/lower-case/);
    await expect(switchToUser(query, { role: "", claims: {} })).rejects.toThrow(/role/);
    expect(calls).toHaveLength(0);
  });
});
