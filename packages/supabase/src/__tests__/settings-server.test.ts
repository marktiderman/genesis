// @feat:settings-screen
import { describe, expect, it, vi } from "vitest";
import { catalogueManifest, defineSettings, settingsCatalogue } from "@marktiderman/genesis-config/settings";
import { createSettingsClient, type SettingsState } from "@marktiderman/genesis-config/settings-protocol";
import { createSettingsHandler, upgradeDistance, type SettingsHostClient } from "../settings-server";

const TENANT = "00000000-0000-4000-9000-00000000000a";
const OTHER_TENANT = "00000000-0000-4000-9000-00000000000b";
const ORIGIN = "https://app.example.test";

const manifest = catalogueManifest(
  settingsCatalogue([
    defineSettings("demo", {
      theme: { type: "string", default: "light", options: ["light", "dark"], summary: "The app's theme." },
      retention: { type: "number", default: 90, min: 7, max: 365, integer: true },
      region: { type: "string", default: "us", applies: "build" },
      banner: { type: "boolean", default: true, scope: "tenant" },
      shake: { type: "boolean", default: true, scope: "person" },
      webhook: { type: "string", default: null, needs: "secret:DEMO_WEBHOOK", store: "vault" },
      github: { type: "string", default: null, needs: "secret:DEMO_GITHUB" },
    }),
  ]),
);

type Who = "admin" | "tenantAdmin" | "person";
const TOKENS: Record<string, { id: string; who: Who }> = {
  "t-admin": { id: "u-admin", who: "admin" },
  "t-ta": { id: "u-ta", who: "tenantAdmin" },
  "t-p": { id: "u-p", who: "person" },
};

interface Db {
  database: Record<string, { value: unknown; locked: boolean }>;
  tenant: Record<string, unknown>;
  person: Record<string, unknown>;
  vault: Record<string, string>;
  rotations: Array<{ name: string; at: string }>;
  proposals: Array<{ id: number; key: string; value: unknown; locked: boolean; reason: string | null; by: string; status: string }>;
  audit: Array<Record<string, unknown>>;
  reportedAt: string | null;
  catalogue: Record<string, unknown>;
  packages: Record<string, string>;
  /** An RPC answers with this error once. */
  failNext?: { fn: string; error: { message: string; code: string } };
}

function freshDb(): Db {
  return {
    database: { "demo.retention": { value: 3, locked: false }, "demo.theme": { value: "dark", locked: true } },
    tenant: { "demo.banner": false },
    person: { "demo.shake": false },
    vault: {},
    rotations: [{ name: "DEMO_WEBHOOK", at: "2026-11-01T00:00:00Z" }],
    proposals: [],
    audit: [
      { seq: "v:0000000000000000003", at: "2026-11-03T00:00:00Z", kind: "secret", layer: null, subject: "DEMO_WEBHOOK", old_value: null, new_value: null, old_locked: null, new_locked: null, cleared: false, actor: "u-admin", actor_email: "admin@example.test" },
      { seq: "d:0000000000000000002", at: "2026-11-02T00:00:00Z", kind: "setting", layer: "database", subject: "demo.retention", old_value: 90, new_value: null, old_locked: false, new_locked: null, cleared: true, actor: "u-admin", actor_email: "admin@example.test" },
      { seq: "d:0000000000000000001", at: "2026-11-01T00:00:00Z", kind: "setting", layer: "database", subject: "demo.retention", old_value: null, new_value: 90, old_locked: null, new_locked: true, cleared: false, actor: "u-admin", actor_email: "admin@example.test" },
    ],
    reportedAt: "2026-11-19T00:00:00Z",
    catalogue: manifest as unknown as Record<string, unknown>,
    packages: { "@marktiderman/genesis-config": "0.11.1" },
  };
}

/** A stand-in for the database: each RPC as the migrations define it, for the signed-in caller. */
function fakeSupabase(db: Db) {
  const calls: Array<{ fn: string; args: Record<string, unknown>; token: string }> = [];
  const createClient = vi.fn((_url: string, _key: string, token: string): SettingsHostClient => {
    const me = TOKENS[token];
    const ok = (data: unknown) => Promise.resolve({ data, error: null });
    const refuse = (message: string, code = "42501") => Promise.resolve({ data: null, error: { message, code } });
    return {
      auth: { getUser: async (jwt: string) => (TOKENS[jwt] ? { data: { user: { id: TOKENS[jwt]!.id } }, error: null } : { data: { user: null }, error: new Error("bad jwt") }) },
      rpc: (fn: string, args: Record<string, unknown> = {}) => {
        calls.push({ fn, args, token });
        if (db.failNext?.fn === fn) {
          const { error } = db.failNext;
          db.failNext = undefined;
          return Promise.resolve({ data: null, error });
        }
        const admin = me?.who === "admin";
        const tenantAdmin = me?.who === "tenantAdmin" && args.tenant === TENANT;
        switch (fn) {
          case "genesis_settings_viewer": {
            const scope = admin ? null : tenantAdmin ? "tenant" : "person";
            const catalogue = Object.fromEntries(Object.entries(db.catalogue).filter(([, e]) => scope === null || (e as { scope: string }).scope === scope));
            return ok({ platformAdmin: admin, tenantAdmin, preset: "max", reportedAt: db.reportedAt, catalogue, packages: admin ? db.packages : {} });
          }
          case "genesis_settings_layers":
            if (args.tenant && args.tenant !== TENANT && !admin) return refuse("genesis_settings_layers: only the tenant's members can read its settings");
            return ok({
              preset: "max",
              file: { "demo.region": "eu" },
              database: db.database,
              tenant: args.tenant === TENANT ? Object.fromEntries(Object.entries(db.tenant).map(([k, value]) => [k, { value }])) : {},
              person: Object.fromEntries(Object.entries(db.person).map(([k, value]) => [k, { value }])),
              reportedAt: db.reportedAt,
            });
          case "set_genesis_setting":
            if (!admin) return refuse("set_genesis_setting: only platform admins can change settings");
            db.database[args.key as string] = { value: args.value, locked: args.locked === true };
            return ok(null);
          case "clear_genesis_setting":
            if (!admin) return refuse("clear_genesis_setting: only platform admins can change settings");
            delete db.database[args.key as string];
            return ok(null);
          case "set_genesis_tenant_setting":
            if (!(me?.who === "tenantAdmin" && args.tenant === TENANT)) return refuse("set_genesis_tenant_setting: only the tenant's admins can change its settings");
            db.tenant[args.key as string] = args.value;
            return ok(null);
          case "set_genesis_person_setting":
            db.person[args.key as string] = args.value;
            return ok(null);
          case "genesis_vault_secret_status":
            if (!admin) return refuse("genesis_vault_secret_status: only platform admins read secret status");
            return ok(["DEMO_WEBHOOK"].map((name) => ({ name, is_set: name in db.vault, last_rotated: db.rotations.filter((r) => r.name === name).at(-1)?.at ?? null })));
          case "set_genesis_vault_secret":
            if (!admin) return refuse("set_genesis_vault_secret: only platform admins set secrets");
            db.vault[args.name as string] = args.value as string;
            db.rotations.push({ name: args.name as string, at: "2026-11-20T00:00:00Z" });
            return ok(null);
          case "genesis_settings_audit": {
            const rows = db.audit.filter((r) => !args.before_seq || `${r.at}|${r.seq}` < `${args.before_at}|${args.before_seq}`);
            return ok(rows.slice(0, args.max_rows as number));
          }
          case "genesis_setting_proposals":
            return ok(
              db.proposals
                .filter((p) => (admin && p.status === "pending") || p.by === me?.id)
                .map((p) => ({ id: p.id, key: p.key, value: p.value, locked: p.locked, reason: p.reason, proposed_by: p.by, proposed_by_email: admin ? `${p.by}@example.test` : null, proposed_at: "2026-11-20T00:00:00Z", status: p.status, decided_by: null, decided_at: null })),
            );
          case "propose_genesis_setting": {
            const id = db.proposals.length + 1;
            db.proposals.push({ id, key: args.key as string, value: args.value, locked: args.locked as boolean, reason: args.reason as string | null, by: me!.id, status: "pending" });
            return ok(id);
          }
          case "decide_genesis_setting_proposal": {
            if (!admin) return refuse("decide_genesis_setting_proposal: only platform admins decide proposals");
            const p = db.proposals.find((x) => x.id === args.proposal);
            if (!p) return refuse(`decide_genesis_setting_proposal: no proposal ${String(args.proposal)}`, "P0002");
            p.status = args.approve ? "approved" : "declined";
            if (args.approve) db.database[p.key] = { value: p.value, locked: p.locked };
            return ok(null);
          }
        }
        return refuse(`no function ${fn}`, "PGRST202");
      },
    };
  });
  return { createClient, calls };
}

function setup(over: Partial<Db> = {}, options: { fetch?: Parameters<typeof createSettingsHandler>[0]["fetch"]; onError?: (e: unknown) => void } = {}) {
  const db = { ...freshDb(), ...over };
  const supabase = fakeSupabase(db);
  const fetchFn = options.fetch ?? vi.fn(async (url: string) => ({ ok: true, json: async () => ({ version: url.includes("genesis-config") ? "0.13.0" : "1.0.0" }) }));
  const handler = createSettingsHandler({
    supabaseUrl: "https://project.supabase.test",
    supabaseKey: "publishable-key",
    app: { name: "Acme" },
    createClient: supabase.createClient,
    fetch: fetchFn,
    ...(options.onError ? { onError: options.onError } : {}),
  });
  const send = async (token: string | null, body: Record<string, unknown>, init: { origin?: string | null; method?: string; contentType?: string } = {}) => {
    const headers: Record<string, string> = { "content-type": init.contentType ?? "application/json" };
    if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await handler(new Request(`${ORIGIN}/api/genesis/settings`, { method: init.method ?? "POST", headers, ...(init.method === "GET" ? {} : { body: JSON.stringify({ v: 1, ...body }) }) }));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: { code: string; message: string } } };
  };
  return { db, send, calls: supabase.calls, createClient: supabase.createClient, fetchFn };
}

describe("createSettingsHandler: requests", () => {
  it("answers its own site only", async () => {
    const { send, createClient } = setup();
    expect((await send("t-admin", { op: "state" }, { origin: "https://evil.example.test" })).status).toBe(403);
    expect((await send("t-admin", { op: "state" }, { origin: null })).body.error?.code).toBe("forbidden");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses anything but an authenticated JSON POST in the protocol's version", async () => {
    const { send } = setup();
    expect((await send("t-admin", {}, { method: "GET" })).status).toBe(405);
    expect((await send("t-admin", { op: "state" }, { contentType: "text/plain" })).status).toBe(415);
    expect((await send(null, { op: "state" })).body.error?.code).toBe("unauthenticated");
    expect((await send("t-forged", { op: "state" })).status).toBe(401);
    expect((await send("t-admin", { op: "state", v: 2 })).body.error?.code).toBe("version");
  });

  it("answers an op it doesn't know with unsupported, as the protocol asks", async () => {
    const { send } = setup();
    expect(await send("t-admin", { op: "teleport" })).toMatchObject({ status: 501, body: { error: { code: "unsupported" } } });
  });

  it("talks to the database as the caller, with the publishable key", async () => {
    const { send, createClient } = setup();
    await send("t-p", { op: "state" });
    expect(createClient).toHaveBeenCalledWith("https://project.supabase.test", "publishable-key", "t-p");
  });
});

describe("createSettingsHandler: state", () => {
  it("gives a platform admin every key, the health, secrets, upgrades, history and proposals", async () => {
    const { send } = setup();
    const { status, body } = await send("t-admin", { op: "state", audit: { limit: 2 } });
    expect(status).toBe(200);
    const state = body as unknown as SettingsState;
    expect(state.viewer).toEqual({ scope: "platform" });
    expect(state.app).toMatchObject({ name: "Acme", host: "app" });
    expect(state.catalogue.map((d) => d.key)).toEqual(["demo.banner", "demo.github", "demo.region", "demo.retention", "demo.shake", "demo.theme", "demo.webhook"]);
    expect(state.capabilities).toMatchObject({ writeDatabase: true, writeFiles: false, setSecrets: { vault: true }, proposeChanges: false });
    expect(state.resolved.values["demo.region"]).toBe("eu");
    expect(state.resolved.sources["demo.theme"]).toEqual({ layer: "database", lockedBy: "database" });
    // demo.retention = 3 is under its minimum: a finding, with a fix that clears it from the database layer.
    const bad = state.findings.find((f) => f.subject === "demo.retention")!;
    expect(bad).toMatchObject({ rule: "setting-type", level: "error", fix: { id: "database.clear:demo.retention", kind: "auto", databaseOnly: true } });
    expect(state.findings.find((f) => f.rule === "secret-missing")).toMatchObject({ subject: "DEMO_WEBHOOK", fix: { kind: "manual" } });
    expect(state.secrets).toEqual([
      { name: "DEMO_GITHUB", store: "edge", status: "unknown", neededBy: ["demo.github"] },
      { name: "DEMO_WEBHOOK", store: "vault", status: "missing", lastRotated: "2026-11-01T00:00:00Z", neededBy: ["demo.webhook"] },
    ]);
    expect(state.upgrades?.packages).toEqual([{ name: "@marktiderman/genesis-config", current: "0.11.1", latest: "0.13.0", distance: "minor" }]);
    expect(state.audit?.entries).toHaveLength(2);
    expect(state.audit?.next).toBe("2026-11-02T00:00:00Z|d:0000000000000000002");
    expect(state.proposals).toEqual([]);
  });

  it("says when the manifest was never written, or can't describe a key", async () => {
    const stale = { ...(manifest as Record<string, unknown>), "demo.old": { type: "boolean", applies: "runtime", scope: "app" } };
    const { send } = setup({ reportedAt: null, catalogue: stale });
    const state = (await send("t-admin", { op: "state" })).body as unknown as SettingsState;
    expect(state.findings.map((f) => f.rule)).toEqual(expect.arrayContaining(["settings-manifest-missing", "settings-manifest-stale"]));
    expect(state.catalogue.map((d) => d.key)).not.toContain("demo.old");
  });

  it("gives a tenant admin their tenant's keys only, and nothing of the platform's", async () => {
    const { send } = setup();
    const state = (await send("t-ta", { op: "state", tenant: TENANT })).body as unknown as SettingsState;
    expect(state.viewer).toEqual({ scope: "tenant", tenant: TENANT });
    expect(state.catalogue.map((d) => d.key)).toEqual(["demo.banner"]);
    expect(state.resolved.values).toEqual({ "demo.banner": false });
    expect(state.layers).toEqual({ tenant: { "demo.banner": { value: false } } });
    expect(state).toMatchObject({ findings: [], secrets: [], capabilities: { writeDatabase: true, setSecrets: false, proposeChanges: true } });
    expect(state.upgrades).toBeUndefined();
  });

  it("gives anyone else their own person keys", async () => {
    const { send } = setup();
    const state = (await send("t-p", { op: "state" })).body as unknown as SettingsState;
    expect(state.viewer).toEqual({ scope: "person" });
    expect(state.catalogue.map((d) => d.key)).toEqual(["demo.shake"]);
    expect(state.layers).toEqual({ person: { "demo.shake": { value: false } } });
  });

  it("is refused a tenant the caller can't read", async () => {
    const { send } = setup();
    expect((await send("t-p", { op: "state", tenant: OTHER_TENANT })).body.error?.code).toBe("forbidden");
    expect((await send("t-p", { op: "state", tenant: "not-a-uuid" })).status).toBe(400);
  });
});

describe("createSettingsHandler: writes", () => {
  it("writes the database layer for a platform admin, through set_genesis_setting", async () => {
    const { send, db, calls } = setup();
    expect((await send("t-admin", { op: "setValue", key: "demo.retention", value: 30, locked: true, layer: "database" })).body).toEqual({ ok: true });
    expect(calls.find((c) => c.fn === "set_genesis_setting")).toMatchObject({ args: { key: "demo.retention", value: 30, locked: true }, token: "t-admin" });
    expect(db.database["demo.retention"]).toEqual({ value: 30, locked: true });
    expect((await send("t-admin", { op: "clearValue", key: "demo.retention", layer: "database" })).body).toEqual({ ok: true });
    expect(db.database["demo.retention"]).toBeUndefined();
  });

  it("refuses the platform scope to anyone else before asking the database", async () => {
    const { send, calls } = setup();
    expect(await send("t-ta", { op: "setValue", key: "demo.banner", value: true, layer: "database", tenant: TENANT })).toMatchObject({ status: 403, body: { error: { code: "forbidden" } } });
    expect(calls.some((c) => c.fn === "set_genesis_setting")).toBe(false);
  });

  it("writes a tenant's layer for its admin, and a person's own layer", async () => {
    const { send, db } = setup();
    expect((await send("t-ta", { op: "setValue", key: "demo.banner", value: true, layer: "tenant", tenant: TENANT })).status).toBe(200);
    expect(db.tenant["demo.banner"]).toBe(true);
    expect((await send("t-p", { op: "setValue", key: "demo.shake", value: true, layer: "person" })).status).toBe(200);
    expect(db.person["demo.shake"]).toBe(true);
    // A key outside the caller's slice isn't theirs to write.
    expect((await send("t-ta", { op: "setValue", key: "demo.theme", value: "light", layer: "tenant", tenant: TENANT })).status).toBe(404);
  });

  it("says the file layer belongs to the repository", async () => {
    const { send } = setup();
    const { status, body } = await send("t-admin", { op: "setValue", key: "demo.region", value: "us", layer: "file" });
    expect(status).toBe(501);
    expect(body.error).toMatchObject({ code: "unsupported", message: expect.stringMatching(/genesis setup|CLI|pull request/) });
  });

  it("passes the database's refusals on as the protocol's errors", async () => {
    const { send, db } = setup();
    db.failNext = { fn: "set_genesis_setting", error: { message: "set_genesis_setting: demo.theme is locked by genesis.config.json: change it there", code: "22023" } };
    expect((await send("t-admin", { op: "setValue", key: "demo.theme", value: "light", layer: "database" })).body.error).toEqual({ code: "locked", message: "demo.theme is locked by genesis.config.json: change it there" });
    db.failNext = { fn: "set_genesis_setting", error: { message: "set_genesis_setting: demo.retention must be at least 7", code: "22023" } };
    expect((await send("t-admin", { op: "setValue", key: "demo.retention", value: 1, layer: "database" })).body.error?.code).toBe("bad_request");
  });
});

describe("createSettingsHandler: plan and apply", () => {
  it("plans clearing a bad database value, and applies only that plan", async () => {
    const { send, db } = setup();
    const planned = await send("t-admin", { op: "plan", fixId: "database.clear:demo.retention" });
    const plan = planned.body.plan as { hash: string; layers: string[]; files: unknown[] };
    expect(plan).toMatchObject({ layers: ["database"], files: [], commands: [], secrets: [] });
    expect(plan.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await send("t-admin", { op: "apply", fixId: "database.clear:demo.retention", expect: "0".repeat(64) })).body.error?.code).toBe("stale_plan");
    expect(db.database["demo.retention"]).toBeDefined();
    const applied = await send("t-admin", { op: "apply", fixId: "database.clear:demo.retention", expect: plan.hash });
    expect(applied.body.result).toMatchObject({ verified: true });
    expect(db.database["demo.retention"]).toBeUndefined();
    expect((await send("t-admin", { op: "apply", fixId: "database.clear:demo.retention", expect: plan.hash })).body.error?.code).toBe("stale_plan");
  });

  it("refuses a plan for a value that has nothing wrong, a fix it doesn't have, or a non-admin", async () => {
    const { send } = setup();
    expect((await send("t-admin", { op: "plan", fixId: "database.clear:demo.theme" })).status).toBe(404);
    expect((await send("t-admin", { op: "plan", fixId: "upgrade.release" })).status).toBe(404);
    expect((await send("t-p", { op: "plan", fixId: "database.clear:demo.retention" })).status).toBe(403);
  });
});

describe("createSettingsHandler: Vault secrets", () => {
  it("sets a declared Vault secret for a platform admin, never answering with the value", async () => {
    const { send, db, calls } = setup();
    const res = await send("t-admin", { op: "setSecret", name: "DEMO_WEBHOOK", store: "vault", value: "s3cr3t-value-123" });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(db.vault.DEMO_WEBHOOK).toBe("s3cr3t-value-123");
    expect(calls.filter((c) => JSON.stringify(c.args).includes("s3cr3t-value-123")).map((c) => c.fn)).toEqual(["set_genesis_vault_secret"]);
    const state = (await send("t-admin", { op: "state" })).body as unknown as SettingsState;
    expect(state.secrets.find((s) => s.name === "DEMO_WEBHOOK")).toMatchObject({ status: "set", lastRotated: "2026-11-20T00:00:00Z" });
    expect(JSON.stringify(state)).not.toContain("s3cr3t-value-123");
  });

  it("refuses a non-admin, another store, an undeclared name and an empty value", async () => {
    const { send, calls } = setup();
    expect((await send("t-ta", { op: "setSecret", name: "DEMO_WEBHOOK", store: "vault", value: "x-value", tenant: TENANT })).status).toBe(403);
    expect((await send("t-admin", { op: "setSecret", name: "DEMO_GITHUB", store: "vault", value: "x-value" })).status).toBe(400);
    expect((await send("t-admin", { op: "setSecret", name: "NOT_DECLARED", store: "vault", value: "x-value" })).status).toBe(400);
    expect((await send("t-admin", { op: "setSecret", name: "DEMO_WEBHOOK", store: "vault", value: "   " })).status).toBe(400);
    expect(calls.some((c) => c.fn === "set_genesis_vault_secret")).toBe(false);
  });

  it("keeps the value out of an error and out of onError", async () => {
    const onError = vi.fn();
    const { send, db } = setup({}, { onError });
    db.failNext = { fn: "set_genesis_vault_secret", error: { message: "set_genesis_vault_secret: rejected leaky-value-77", code: "22023" } };
    const res = await send("t-admin", { op: "setSecret", name: "DEMO_WEBHOOK", store: "vault", value: "leaky-value-77" });
    expect(JSON.stringify(res.body)).not.toContain("leaky-value-77");
    db.failNext = { fn: "set_genesis_vault_secret", error: { message: "connection lost while sending leaky-value-78", code: "08006" } };
    const failed = await send("t-admin", { op: "setSecret", name: "DEMO_WEBHOOK", store: "vault", value: "leaky-value-78" });
    expect(failed.body.error).toEqual({ code: "error", message: "The settings host failed." });
    expect(JSON.stringify(onError.mock.calls)).not.toContain("leaky-value-78");
  });
});

describe("createSettingsHandler: proposals", () => {
  it("stores a proposal with why, which a platform admin approves", async () => {
    const { send, db } = setup();
    const proposed = await send("t-ta", { op: "propose", key: "demo.banner", value: true, reason: "We run a promotion", tenant: TENANT });
    expect(proposed.body).toEqual({ id: "1" });
    expect(db.proposals[0]).toMatchObject({ key: "demo.banner", value: true, reason: "We run a promotion", by: "u-ta" });
    expect((await send("t-ta", { op: "decideProposal", id: "1", approve: true, tenant: TENANT })).status).toBe(403);
    const state = (await send("t-admin", { op: "state" })).body as unknown as SettingsState;
    expect(state.proposals).toEqual([{ id: "1", key: "demo.banner", value: true, reason: "We run a promotion", proposedBy: "u-ta@example.test", proposedAt: "2026-11-20T00:00:00Z", status: "pending" }]);
    expect((await send("t-admin", { op: "decideProposal", id: "1", approve: true })).body).toEqual({ ok: true });
    expect(db.database["demo.banner"]).toEqual({ value: true, locked: false });
    expect((await send("t-admin", { op: "decideProposal", id: "9", approve: false })).body.error?.code).toBe("not_found");
  });
});

describe("createSettingsHandler: audit", () => {
  it("pages the history with a cursor; a secret shows its name only, a cleared value as cleared", async () => {
    const { send } = setup();
    const first = (await send("t-admin", { op: "audit", limit: 2 })).body as { entries: Array<Record<string, unknown>>; next?: string };
    expect(first.entries.map((e) => e.action)).toEqual(["secret", "clear"]);
    expect(first.entries[0]).not.toHaveProperty("after");
    expect(first.entries[0]).toMatchObject({ actor: "admin@example.test", subject: "DEMO_WEBHOOK" });
    expect(first.entries[1]).toMatchObject({ layer: "database", before: 90 });
    const second = (await send("t-admin", { op: "audit", limit: 2, cursor: first.next })).body as { entries: Array<Record<string, unknown>>; next?: string };
    expect(second.entries).toEqual([expect.objectContaining({ action: "set", after: 90, locked: true })]);
    expect(second.next).toBeUndefined();
    expect((await send("t-admin", { op: "audit", cursor: "garbage" })).status).toBe(400);
  });

  it("asks for the tenant's history for a tenant admin", async () => {
    const { send, calls } = setup();
    await send("t-ta", { op: "audit", tenant: TENANT });
    expect(calls.find((c) => c.fn === "genesis_settings_audit")?.args).toMatchObject({ tenant: TENANT });
  });
});

describe("createSettingsHandler: the screen's client", () => {
  it("speaks the protocol with createSettingsClient", async () => {
    const { db } = setup();
    const supabase = fakeSupabase(db);
    const handler = createSettingsHandler({ supabaseUrl: "u", supabaseKey: "k", app: { name: "Acme" }, createClient: supabase.createClient, fetch: async () => ({ ok: false, json: async () => ({}) }) });
    const client = createSettingsClient(
      (input, init) => handler(new Request(new URL(input, ORIGIN), { method: init.method, headers: { ...init.headers, origin: ORIGIN }, body: init.body })),
      { baseUrl: "/api/genesis/settings", token: "t-admin" },
    );
    const state = await client.state();
    expect(state.upgrades?.packages[0]).toMatchObject({ distance: "unknown" });
    await client.decideProposal!({ id: String((await client.propose({ key: "demo.theme", value: "light", reason: "brand" })).id), approve: false });
    expect(db.proposals[0]!.status).toBe("declined");
  });
});

describe("upgradeDistance", () => {
  it("compares plain versions", () => {
    expect(upgradeDistance("1.2.3", "1.2.3")).toBe("current");
    expect(upgradeDistance("1.2.3", "1.2.4")).toBe("patch");
    expect(upgradeDistance("^1.2.3", "1.3.0")).toBe("minor");
    expect(upgradeDistance("1.2.3", "2.0.0")).toBe("major");
    expect(upgradeDistance("2.0.0", "1.9.9")).toBe("current");
    expect(upgradeDistance("workspace:*", "1.0.0")).toBe("unknown");
  });
});
