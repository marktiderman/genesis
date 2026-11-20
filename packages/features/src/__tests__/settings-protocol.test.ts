// @feat:settings-screen
import { describe, expect, it, vi } from "vitest";
import {
  APP_HOST_CAPABILITIES,
  NO_SETTINGS_CAPABILITIES,
  SETTINGS_PROTOCOL_VERSION,
  SettingsProtocolError,
  auditValuesVisible,
  canSetSecret,
  createSettingsClient,
  intersectCapabilities,
  preferredWriteLayer,
  safeHref,
  secretNames,
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

const MIN_STATE = {
  app: { name: "Acme", host: "app", preset: "max" },
  catalogue: [],
  resolved: { preset: "max", values: {}, sources: {}, problems: [] },
  layers: {},
  findings: [],
  secrets: [],
  capabilities: { writeFiles: false, writeDatabase: true, setSecrets: false, runCli: false, agent: false },
};

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
    expect((init as unknown as { credentials: string }).credentials).toBe("omit");
    expect((init as unknown as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
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
    const fetchFn = vi.fn(async () => reply(200, { ...MIN_STATE, entries: [], packages: [] }));
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

  it("reads and writes the tenant and person layers in the same shape, naming the tenant only when given", async () => {
    const tenantLayer = { "support.messenger": { value: false } };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { ...MIN_STATE, layers: { tenant: tenantLayer, person: {} } }))
      .mockResolvedValue(reply(200, { ok: true }));
    const client = createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" });
    expect((await client.state({ tenant: "tenant-a" })).layers.tenant).toEqual(tenantLayer);
    await client.setValue({ key: "support.messenger", value: false, layer: "tenant", tenant: "tenant-a" });
    await client.clearValue({ key: "support.messenger", layer: "tenant", tenant: "tenant-a" });
    await client.setValue({ key: "support.shakeToReport", value: false, layer: "person" });
    await client.clearValue({ key: "support.shakeToReport", layer: "person" });
    const bodies = fetchFn.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body));
    expect(bodies).toEqual([
      { v: 1, op: "state", tenant: "tenant-a" },
      { v: 1, op: "setValue", key: "support.messenger", value: false, layer: "tenant", tenant: "tenant-a" },
      { v: 1, op: "clearValue", key: "support.messenger", layer: "tenant", tenant: "tenant-a" },
      { v: 1, op: "setValue", key: "support.shakeToReport", value: false, layer: "person" },
      { v: 1, op: "clearValue", key: "support.shakeToReport", layer: "person" },
    ]);
  });

  it("turns a 200 the screen can't draw into an error, not a crash", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { plan: { fixId: "a", hash: "h", files: "nope", commands: [], secrets: [] } }))
      .mockResolvedValueOnce(reply(200, { result: null }))
      .mockResolvedValueOnce(reply(200, { packages: [null] }))
      .mockResolvedValueOnce(reply(200, { ...MIN_STATE, catalogue: [{ key: 1 }] }));
    const client = createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" });
    await expect(client.plan("a")).rejects.toThrow("The settings host's answer to plan is missing the plan's files.");
    await expect(client.apply("a", "h")).rejects.toThrow("The settings host's answer to apply is missing result.");
    await expect(client.upgrades()).rejects.toThrow("The settings host's answer to upgrades is missing packages.");
    await expect(client.state()).rejects.toThrow(/missing a catalogue entry's key and type/);
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
    expect(intersectCapabilities(ALL, APP_HOST_CAPABILITIES)).toEqual({ ...NO_SETTINGS_CAPABILITIES, writeDatabase: true, setSecrets: { vault: true } });
    expect(intersectCapabilities(APP_HOST_CAPABILITIES, ALL)).toEqual({ ...NO_SETTINGS_CAPABILITIES, writeDatabase: true, setSecrets: { vault: true } });
    expect(intersectCapabilities(ALL)).toEqual(ALL);
  });

  it("doesn't narrow on a key the prop leaves out; only false narrows", () => {
    expect(intersectCapabilities(ALL, {})).toEqual(ALL);
    expect(intersectCapabilities(ALL, { runCli: false })).toEqual({ ...ALL, runCli: false });
    expect(intersectCapabilities({ ...ALL, proposeChanges: undefined }, {}).proposeChanges).toBe(false);
  });

  it("offers the app host's Vault only when the host itself reports it", () => {
    const host = { ...NO_SETTINGS_CAPABILITIES, writeDatabase: true };
    expect(canSetSecret(intersectCapabilities(host, APP_HOST_CAPABILITIES), "vault")).toBe(false);
    const vaultHost = { ...host, setSecrets: { vault: true, edge: true } };
    const caps = intersectCapabilities(vaultHost, APP_HOST_CAPABILITIES);
    expect(canSetSecret(caps, "vault")).toBe(true);
    expect(canSetSecret(caps, "edge")).toBe(false);
    expect(canSetSecret({ setSecrets: true }, "ci")).toBe(true);
  });

  it("answers false when no store is left, and true when every store is", () => {
    const vaultOnly = { ...ALL, setSecrets: { vault: true } };
    expect(intersectCapabilities(vaultOnly, { setSecrets: { edge: true } }).setSecrets).toBe(false);
    expect(intersectCapabilities(ALL, { setSecrets: { vault: true, edge: true, "server-env": true, ci: true } }).setSecrets).toBe(true);
    expect(intersectCapabilities(ALL, { setSecrets: { vault: true } }).setSecrets).toEqual({ vault: true });
  });
});

describe("the client's state check and timeout", () => {
  it("refuses a state with a missing array or capabilities, and fills a missing layers", async () => {
    const broken = createSettingsClient(vi.fn(async () => reply(200, { ...MIN_STATE, secrets: undefined })), { baseUrl: "/x", token: "t" });
    await expect(broken.state()).rejects.toMatchObject({ code: "error", message: expect.stringMatching(/missing secrets/) });
    const noCaps = createSettingsClient(vi.fn(async () => reply(200, { ...MIN_STATE, capabilities: true })), { baseUrl: "/x", token: "t" });
    await expect(noCaps.state()).rejects.toThrow(/missing capabilities/);
    const ok = await createSettingsClient(vi.fn(async () => reply(200, { ...MIN_STATE, layers: undefined })), { baseUrl: "/x", token: "t" }).state();
    expect(ok.layers).toEqual({});
  });

  it("gives up after timeoutMs and aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const fetchFn = vi.fn((_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise<never>((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    });
    const client = createSettingsClient(fetchFn as never, { baseUrl: "/x", token: "t", timeoutMs: 20, messages: { timedOut: (s) => `slow (${s}s)` } });
    await expect(client.state()).rejects.toMatchObject({ code: "error", message: "slow (0s)" });
    expect(signal?.aborted).toBe(true);
  });

  it("sends setSecret for the Vault, write-only", async () => {
    const fetchFn = vi.fn(async () => reply(200, { ok: true }));
    await createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" }).setSecret!({ name: "CRON_SECRET", store: "vault", value: "s3cr3t" });
    expect(JSON.parse((fetchFn.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({ v: 1, op: "setSecret", name: "CRON_SECRET", store: "vault", value: "s3cr3t" });
  });
});

describe("audit redaction", () => {
  const catalogue = [{ key: "support.retentionDays" }, { key: "support.githubRepo", secret: { name: "GITHUB_TOKEN", store: "edge" as const } }];
  const names = secretNames(catalogue, [{ name: "RESEND_API_KEY" }]);

  it("shows values only for a set or clear of a catalogue key that needs no secret", () => {
    expect(auditValuesVisible({ action: "set", subject: "support.retentionDays" }, catalogue, names)).toBe(true);
    expect(auditValuesVisible({ action: "clear", subject: "support.retentionDays" }, catalogue, names)).toBe(true);
  });

  it("hides values for a secret's name, a key that needs a secret, a fix, and anything unknown", () => {
    expect(auditValuesVisible({ action: "set", subject: "RESEND_API_KEY" }, catalogue, names)).toBe(false);
    expect(auditValuesVisible({ action: "set", subject: "GITHUB_TOKEN" }, catalogue, names)).toBe(false);
    expect(auditValuesVisible({ action: "set", subject: "support.githubRepo" }, catalogue, names)).toBe(false);
    expect(auditValuesVisible({ action: "fix", subject: "support.retentionDays" }, catalogue, names)).toBe(false);
    expect(auditValuesVisible({ action: "set", subject: "app.unknown" }, catalogue, names)).toBe(false);
  });
});

describe("safeHref", () => {
  it("allows http, https and same-site paths only", () => {
    for (const ok of ["https://github.com/o/r", "http://localhost:4400/step", "/admin/genesis", "./x", "../y", "#a", "?q=1"]) expect(safeHref(ok)).toBe(ok);
    for (const bad of ["/\t/evil.test", "/\n/evil.test", "/\r/evil.test", "/a\u0000b", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.test/x", "/\\evil.test", "vbscript:x", "", undefined]) expect(safeHref(bad)).toBeUndefined();
  });
});

describe("preferredWriteLayer", () => {
  it("defaults to the file layer, else the database", () => {
    expect(preferredWriteLayer({ layers: ["file", "database"] })).toBe("file");
    expect(preferredWriteLayer({ layers: ["database"] })).toBe("database");
    expect(preferredWriteLayer({ layers: [] })).toBeUndefined();
    expect(preferredWriteLayer({ layers: ["file", "database"] }, { layer: "database" })).toBe("database");
    expect(preferredWriteLayer({ layers: ["file", "database"] }, { layer: "default" })).toBe("file");
    expect(preferredWriteLayer({ layers: ["file"] }, { layer: "database" })).toBe("file");
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
  it("gives a tenant admin or a person their own layer, for keys of their scope only", () => {
    const tenantKey = { applies: "runtime" as const, scope: "tenant" as const };
    const tenant = { scope: "tenant" as const, tenant: "t-1" };
    expect(settingWritability(tenantKey, {}, APP_HOST_CAPABILITIES, tenant)).toEqual({ layers: ["tenant"], refused: {} });
    expect(settingWritability({ applies: "runtime", scope: "app" }, {}, APP_HOST_CAPABILITIES, tenant)).toEqual({ layers: [], refused: { tenant: "scope" } });
    expect(settingWritability(tenantKey, { lockedBy: "database" }, APP_HOST_CAPABILITIES, tenant)).toEqual({ layers: [], refused: { tenant: "locked" } });
    expect(settingWritability(tenantKey, {}, NO_SETTINGS_CAPABILITIES, tenant)).toEqual({ layers: [], refused: { tenant: "capability" } });
    expect(settingWritability({ applies: "runtime", scope: "person" }, {}, APP_HOST_CAPABILITIES, { scope: "person" })).toEqual({ layers: ["person"], refused: {} });
    // A platform admin writes the app's own layers, as without a viewer.
    expect(settingWritability(tenantKey, {}, APP_HOST_CAPABILITIES, { scope: "platform" })).toEqual({ layers: ["database"], refused: { file: "capability" } });
  });
});

describe("proposals on the wire", () => {
  it("sends a proposal with its reason, takes a stored id, and decides one", async () => {
    const fetchFn = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { op: string };
      return reply(200, body.op === "propose" ? { id: "12" } : { ok: true });
    });
    const client = createSettingsClient(fetchFn, { baseUrl: "/x", token: "t" });
    expect(await client.propose({ key: "demo.seats", value: 40, reason: "We hired" })).toEqual({ id: "12" });
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body)).toEqual({ v: SETTINGS_PROTOCOL_VERSION, op: "propose", key: "demo.seats", value: 40, reason: "We hired" });
    await client.decideProposal!({ id: "12", approve: false });
    expect(JSON.parse(fetchFn.mock.calls[1]![1].body)).toEqual({ v: SETTINGS_PROTOCOL_VERSION, op: "decideProposal", id: "12", approve: false });
    await client.decideProposal!({ id: "12", approve: true, layer: "tenant" });
    expect(JSON.parse(fetchFn.mock.calls[2]![1].body)).toEqual({ v: SETTINGS_PROTOCOL_VERSION, op: "decideProposal", id: "12", approve: true, layer: "tenant" });
  });

  it("refuses a proposal answer with neither a snippet nor an id", async () => {
    const client = createSettingsClient(async () => reply(200, {}), { baseUrl: "/x", token: "t" });
    await expect(client.propose({ key: "a.b", value: 1 })).rejects.toThrow(/snippet or id/);
  });
});

describe("settingFileSnippet", () => {
  it("writes the value, or the locked wrapper", () => {
    expect(JSON.parse(settingFileSnippet("app.region", "eu"))).toEqual({ settings: { "app.region": "eu" } });
    expect(JSON.parse(settingFileSnippet("app.region", "eu", true))).toEqual({ settings: { "app.region": { value: "eu", locked: true } } });
  });
});
