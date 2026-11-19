import { describe, expect, it, vi } from "vitest";
import {
  APP_HOST_CAPABILITIES,
  NO_SETTINGS_CAPABILITIES,
  SETTINGS_PROTOCOL_VERSION,
  SettingsProtocolError,
  createSettingsClient,
  intersectCapabilities,
  settingFileSnippet,
  settingWritability,
  type SettingsCapabilities,
} from "../settings-protocol";

function reply(status: number, body: unknown, type = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": type }),
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const ALL: SettingsCapabilities = { writeFiles: true, writeDatabase: true, setSecrets: true, runCli: true, agent: true, proposeChanges: true };

describe("createSettingsClient", () => {
  it("posts { v, op, … } as JSON with the bearer token, and returns the body", async () => {
    const fetchFn = vi.fn(async () => reply(200, { ok: true }));
    const client = createSettingsClient(fetchFn, { baseUrl: "/api/genesis/settings", token: "t0k" });
    await client.setValue({ key: "support.retentionDays", value: 30, layer: "database", locked: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe("/api/genesis/settings");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer t0k");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ v: SETTINGS_PROTOCOL_VERSION, op: "setValue", key: "support.retentionDays", value: 30, layer: "database", locked: true });
  });

  it("unwraps plan and apply, and passes the plan's hash as expect", async () => {
    const plan = { fixId: "agents.guide", summary: "s", hash: "h1", files: [], commands: [], secrets: [] };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { plan }))
      .mockResolvedValueOnce(reply(200, { result: { fixId: "agents.guide", verified: true } }));
    const client = createSettingsClient(fetchFn, { baseUrl: "/x", token: () => "t" });
    expect(await client.plan("agents.guide")).toEqual(plan);
    expect(await client.apply("agents.guide", "h1")).toEqual({ fixId: "agents.guide", verified: true });
    expect(JSON.parse((fetchFn.mock.calls[1] as [string, { body: string }])[1].body)).toEqual({ v: 1, op: "apply", fixId: "agents.guide", expect: "h1" });
  });

  it("sends state's audit limit and audit's cursor only when given", async () => {
    const fetchFn = vi.fn(async () => reply(200, { entries: [] }));
    const client = createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" });
    await client.state();
    await client.state({ auditLimit: 10 });
    await client.audit({ cursor: "c2", limit: 5 });
    await client.upgrades({ refresh: true });
    const bodies = fetchFn.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body));
    expect(bodies).toEqual([
      { v: 1, op: "state" },
      { v: 1, op: "state", audit: { limit: 10 } },
      { v: 1, op: "audit", cursor: "c2", limit: 5 },
      { v: 1, op: "upgrades", refresh: true },
    ]);
  });

  it("throws the host's error code and message", async () => {
    const fetchFn = vi.fn(async () => reply(409, { error: { code: "stale_plan", message: "The plan changed.", details: { hash: "h2" } } }));
    const client = createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" });
    const error = await client.apply("f", "h1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SettingsProtocolError);
    expect(error).toMatchObject({ code: "stale_plan", message: "The plan changed.", status: 409, details: { hash: "h2" } });
  });

  it("maps a status to a code when the error body has none it knows", async () => {
    const fetchFn = vi.fn(async () => reply(403, { error: { code: "nope", message: "Platform admins only." } }));
    const error = await createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" }).state().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "forbidden", message: "Platform admins only." });
  });

  it("refuses a response that isn't JSON (a login page, a proxy's HTML)", async () => {
    const fetchFn = vi.fn(async () => reply(200, "<html>Sign in</html>", "text/html"));
    const error = await createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" }).state().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SettingsProtocolError);
    expect((error as SettingsProtocolError).message).toMatch(/without JSON/);
  });

  it("refuses JSON it can't parse and a body that isn't an object", async () => {
    const bad = createSettingsClient(vi.fn(async () => reply(200, "{nope")), { baseUrl: "/x", token: "t" });
    await expect(bad.state()).rejects.toThrow(/couldn't read/);
    const scalar = createSettingsClient(vi.fn(async () => reply(200, "42")), { baseUrl: "/x", token: "t" });
    await expect(scalar.state()).rejects.toThrow(/other than an object/);
  });

  it("sends nothing without a token", async () => {
    const fetchFn = vi.fn();
    const error = await createSettingsClient(fetchFn, { baseUrl: "/x", token: () => null }).state().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "unauthenticated" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports a host it can't reach", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" }).state()).rejects.toMatchObject({ code: "error", message: expect.stringMatching(/couldn't be reached \(Failed to fetch\)/) });
  });
});

describe("intersectCapabilities", () => {
  it("narrows and never widens", () => {
    expect(intersectCapabilities(ALL, APP_HOST_CAPABILITIES)).toEqual({ ...NO_SETTINGS_CAPABILITIES, writeDatabase: true });
    expect(intersectCapabilities(APP_HOST_CAPABILITIES, ALL)).toEqual({ ...NO_SETTINGS_CAPABILITIES, writeDatabase: true });
    expect(intersectCapabilities(ALL)).toEqual(ALL);
  });
});

describe("settingWritability", () => {
  const runtime = { applies: "runtime" as const };
  const build = { applies: "build" as const };

  it("lets the app host write runtime keys in the database layer only", () => {
    expect(settingWritability(runtime, { }, APP_HOST_CAPABILITIES)).toEqual({ layers: ["database"], refused: { file: "capability" } });
  });

  it("keeps build keys out of the database layer, so the app host can't write them", () => {
    expect(settingWritability(build, {}, APP_HOST_CAPABILITIES)).toEqual({ layers: [], refused: { file: "capability", database: "build" } });
    expect(settingWritability(build, {}, ALL)).toEqual({ layers: ["file"], refused: { database: "build" } });
  });

  it("refuses a layer above the one that locked the key, and allows the lock's own layer", () => {
    expect(settingWritability(runtime, { lockedBy: "file" }, ALL)).toEqual({ layers: ["file"], refused: { database: "locked" } });
    expect(settingWritability(runtime, { lockedBy: "database" }, ALL)).toEqual({ layers: ["file", "database"], refused: {} });
  });
});

describe("settingFileSnippet", () => {
  it("writes the value, or the locked wrapper", () => {
    expect(JSON.parse(settingFileSnippet("app.region", "eu"))).toEqual({ settings: { "app.region": "eu" } });
    expect(JSON.parse(settingFileSnippet("app.region", "eu", true))).toEqual({ settings: { "app.region": { value: "eu", locked: true } } });
  });
});
