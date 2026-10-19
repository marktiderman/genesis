import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { isDataWriteError } from "@marktiderman/genesis-core/schema";
import { byResource, jwtAuth, studioSetupSql } from "../src/index";
import { triggerAdvances, type CatalogTrigger } from "../src/catalog";
import { createStudioProvider } from "../src/client";

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

  it("needs exactly one key source", () => {
    expect(() => jwtAuth({})).toThrow(/exactly one/);
    expect(() => jwtAuth({ secret: SECRET, jwksUrl: "https://x.test/jwks" })).toThrow(/exactly one/);
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
  const authorize = byResource({
    "public.clients": { read: true, update: ["notes"] },
    "public.quiz": { read: { except: ["answer_key"] } },
  });
  const ctx = (resource: string, action: "read" | "update") =>
    authorize({ request: request(), claims: { sub: "u" }, resource, action });

  it("denies anything not listed, and leaves a listed table read-only without update", () => {
    expect(ctx("public.other", "read")).toBe(false);
    expect(ctx("constructor", "read")).toBe(false);
    expect(ctx("public.quiz", "update")).toBe(false);
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
