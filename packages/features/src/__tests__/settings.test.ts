/** @feat:settings-core */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as entry from "../settings-entry";
import {
  SettingsError,
  defineFeatures,
  defineSettings,
  featureOn,
  isLockedEntry,
  resolveSettings,
  settingValueProblem,
  settingsCatalogue,
  settingsGateContext,
  settingsLayerFromFile,
  settingsLayerFromRows,
  settingsSecrets,
  withSettings,
  SCOPE_LAYERS,
  APP_LOCK_LAYERS,
  type SettingsLayers,
} from "../index";

const support = defineSettings("support", {
  messenger: { type: "boolean", default: { max: true, standard: true, min: false }, scope: "tenant", feature: "support-messenger" },
  inbox: { type: "boolean", default: true },
  agentDesk: { type: "boolean", default: { max: true, standard: true, min: false }, requires: ["support.inbox"] },
  diagnostics: { type: "boolean", default: { max: true, standard: true, min: true } },
  dumpOnShake: { type: "boolean", default: true, requires: ["support.diagnostics"] },
  shakeToReport: { type: "boolean", default: true, scope: "person" },
  shake: { type: "object", default: { thresholdG: 2.3, jolts: 2 } },
  githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN" },
  sentryDsn: { type: "string", default: null, applies: "build" },
  dumpRetentionDays: { type: "number", default: 90, min: 7, max: 365 },
  channel: { type: "string", default: "chat", options: ["chat", "email"], flag: "support-channel" },
  languages: { type: "list", default: ["en"], options: ["en", "nl", "de"], min: 1, max: 2 },
});
const devtools = defineSettings("devtools", {
  screen: { type: "boolean", default: { max: true, standard: true, min: true }, applies: "build" },
  vaultKey: { type: "string", default: null, needs: "secret:SUPPORT_WEBHOOK_SECRET", store: "vault" },
});
const catalogue = settingsCatalogue([support, devtools]);

const resolve = (layers: SettingsLayers = {}) => resolveSettings(catalogue, layers);
const kinds = (layers: SettingsLayers) => resolve(layers).problems.map((p) => `${p.kind} ${p.layer} ${p.key}`);

describe("defineSettings", () => {
  it("folds the namespace into each key and fills scope, applies and per-preset defaults", () => {
    const def = support.keys["support.messenger"];
    expect(def).toMatchObject({ key: "support.messenger", namespace: "support", type: "boolean", scope: "tenant", applies: "runtime", byPreset: true, feature: "support-messenger" });
    expect(def.defaults).toEqual({ max: true, standard: true, min: false });
    expect(support.keys["support.inbox"]).toMatchObject({ scope: "app", applies: "runtime", byPreset: false, defaults: { max: true, standard: true, min: true } });
    expect(Object.isFrozen(def)).toBe(true);
  });

  it("keeps a secret by name and store, never a value, defaulting the store to edge", () => {
    expect(support.keys["support.githubRepo"].secret).toEqual({ name: "GITHUB_TOKEN", store: "edge" });
    expect(devtools.keys["devtools.vaultKey"].secret).toEqual({ name: "SUPPORT_WEBHOOK_SECRET", store: "vault" });
    expect(settingsSecrets(catalogue)).toEqual([
      { key: "support.githubRepo", name: "GITHUB_TOKEN", store: "edge" },
      { key: "devtools.vaultKey", name: "SUPPORT_WEBHOOK_SECRET", store: "vault" },
    ]);
  });

  it("keeps a key's setup step", () => {
    expect(defineSettings("x", { repo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", setup: "github.issues" } }).keys["x.repo"].setup).toBe("github.issues");
  });

  it.each([
    ["a bad namespace", () => defineSettings("Support", { a: { type: "boolean", default: true } }), /valid namespace/],
    ["no keys", () => defineSettings("x", {}), /at least one key/],
    ["a bad key name", () => defineSettings("x", { "a.b": { type: "boolean", default: true } }), /valid key name/],
    ["an unknown field", () => defineSettings("x", { a: { type: "boolean", default: true, lock: true } as never }), /unknown field "lock"/],
    ["an unknown type", () => defineSettings("x", { a: { type: "date", default: null } as never }), /type "date"/],
    ["no default", () => defineSettings("x", { a: { type: "boolean" } as never }), /needs a default/],
    ["a default of the wrong type", () => defineSettings("x", { a: { type: "number", default: "90" as never } }), /default must be a number/],
    ["a default out of bounds", () => defineSettings("x", { a: { type: "number", default: 3, min: 7 } }), /default must be at least 7/],
    ["a preset default out of bounds", () => defineSettings("x", { a: { type: "number", default: { max: 9, standard: 8, min: 1 }, min: 7 } }), /default for min must be at least 7/],
    ["a default not in options", () => defineSettings("x", { a: { type: "string", default: "sms", options: ["chat"] } }), /must be one of "chat"/],
    ["min above max", () => defineSettings("x", { a: { type: "number", default: 5, min: 9, max: 1 } }), /min above max/],
    ["bounds on a boolean", () => defineSettings("x", { a: { type: "boolean", default: true, min: 1 } }), /only a number or a list/],
    ["options on an object", () => defineSettings("x", { a: { type: "object", default: {}, options: ["a"] } }), /doesn't take/],
    ["a build key with a tenant scope", () => defineSettings("x", { a: { type: "boolean", default: true, applies: "build", scope: "tenant" } }), /can't have a tenant scope/],
    ["a bad scope", () => defineSettings("x", { a: { type: "boolean", default: true, scope: "org" as never } }), /scope "org"/],
    ["requires that isn't a full key", () => defineSettings("x", { a: { type: "boolean", default: true, requires: ["inbox"] } }), /full key/],
    ["requires itself", () => defineSettings("x", { a: { type: "boolean", default: true, requires: ["x.a"] } }), /requires itself/],
    ["a secret value instead of a name", () => defineSettings("x", { a: { type: "string", default: null, needs: "secret:ghp_abc123" as never } }), /NAME in capitals/],
    ["needs without the secret: prefix", () => defineSettings("x", { a: { type: "string", default: null, needs: "GITHUB_TOKEN" as never } }), /secret:NAME/],
    ["a bad store", () => defineSettings("x", { a: { type: "string", default: null, needs: "secret:A", store: "disk" as never } }), /store "disk"/],
    ["a store without needs", () => defineSettings("x", { a: { type: "string", default: null, store: "vault" } }), /no needs/],
    ["a feature link on a non-boolean", () => defineSettings("x", { a: { type: "string", default: null, feature: "chat" } }), /must be a boolean/],
    ["a bad setup step id", () => defineSettings("x", { a: { type: "string", default: null, setup: "GitHub Issues" } }), /step id/],
  ])("refuses %s", (_, define, message) => {
    expect(define).toThrow(SettingsError);
    expect(define).toThrow(message);
  });

  it("allows null as a default and a list's length bounds", () => {
    expect(() => defineSettings("x", { a: { type: "list", default: ["a", "b"], min: 1, max: 2 } })).not.toThrow();
    expect(() => defineSettings("x", { a: { type: "list", default: ["a", "b", "c"], max: 2 } })).toThrow(/at most 2 items/);
  });
});

describe("settingsCatalogue", () => {
  it("merges every package's keys", () => {
    expect(Object.keys(catalogue.keys)).toHaveLength(14);
  });

  it("refuses a namespace or key declared twice, and requires on a key nobody declares", () => {
    expect(() => settingsCatalogue([support, support])).toThrow(/namespace "support" is declared twice/);
    const other = defineSettings("other", { a: { type: "boolean", default: true, requires: ["support.nope"] } });
    expect(() => settingsCatalogue([support, other])).toThrow(/requires support.nope, which no package declares/);
    // Requires across packages is fine when both are in.
    const cross = defineSettings("cross", { a: { type: "boolean", default: true, requires: ["support.inbox"] } });
    expect(() => settingsCatalogue([support, cross])).not.toThrow();
  });
});

describe("resolveSettings: precedence", () => {
  it("gives every key its default with zero config, on the max preset", () => {
    const r = resolve();
    expect(r.preset).toBe("max");
    expect(r.values["support.messenger"]).toBe(true);
    expect(r.values["support.dumpRetentionDays"]).toBe(90);
    expect(r.values["support.githubRepo"]).toBeNull();
    expect(r.sources["support.messenger"]).toEqual({ layer: "preset" });
    expect(r.sources["support.dumpRetentionDays"]).toEqual({ layer: "default" });
    expect(r.problems).toEqual([]);
  });

  it("resolves the preset as its own layer: only keys with a per-preset default move", () => {
    const min = resolve({ preset: "min" });
    expect(min.values["support.messenger"]).toBe(false);
    expect(min.values["support.agentDesk"]).toBe(false);
    expect(min.values["support.diagnostics"]).toBe(true);
    expect(min.values["support.inbox"]).toBe(true);
    expect(min.sources["support.inbox"]).toEqual({ layer: "default" });
    expect(resolve({ preset: "standard" }).values["support.messenger"]).toBe(true);
  });

  it("lets the file override the preset, the database the file, then tenant and person for their scopes", () => {
    const layers: SettingsLayers = {
      preset: "min",
      file: { "support.messenger": { value: true }, "support.dumpRetentionDays": { value: 30 } },
      database: { "support.dumpRetentionDays": { value: 60 }, "support.messenger": { value: false } },
      tenant: { "support.messenger": { value: true } },
      person: { "support.shakeToReport": { value: false } },
    };
    const r = resolve(layers);
    expect(r.values["support.dumpRetentionDays"]).toBe(60);
    expect(r.sources["support.dumpRetentionDays"]).toEqual({ layer: "database" });
    expect(r.values["support.messenger"]).toBe(true);
    expect(r.sources["support.messenger"]).toEqual({ layer: "tenant" });
    expect(r.values["support.shakeToReport"]).toBe(false);
    expect(r.sources["support.shakeToReport"]).toEqual({ layer: "person" });
    expect(r.problems).toEqual([]);
  });

  it("applies each layer in order whatever order the object lists them", () => {
    const r = resolve({ database: { "support.dumpRetentionDays": { value: 60 } }, file: { "support.dumpRetentionDays": { value: 30 } } });
    expect(r.values["support.dumpRetentionDays"]).toBe(60);
  });

  it("can set a value back to null (not set) in a later layer", () => {
    const r = resolve({ file: { "support.githubRepo": { value: "acme/app" } }, database: { "support.githubRepo": { value: null } } });
    expect(r.values["support.githubRepo"]).toBeNull();
    expect(r.sources["support.githubRepo"]).toEqual({ layer: "database" });
  });

  it("reports an unknown preset and resolves on max, never throwing", () => {
    const r = resolve({ preset: "huge" as never });
    expect(r.preset).toBe("max");
    expect(r.values["support.messenger"]).toBe(true);
    expect(r.problems).toEqual([expect.objectContaining({ kind: "preset", key: "preset", layer: "preset" })]);
  });
});

describe("resolveSettings: locks", () => {
  it("stops every later layer once a layer locks the value", () => {
    const r = resolve({
      file: { "support.diagnostics": { value: true, locked: true } },
      database: { "support.diagnostics": { value: false } },
    });
    expect(r.values["support.diagnostics"]).toBe(true);
    expect(r.sources["support.diagnostics"]).toEqual({ layer: "file", lockedBy: "file" });
    expect(r.problems).toEqual([expect.objectContaining({ kind: "locked", layer: "database", key: "support.diagnostics", message: expect.stringContaining("locked by the file layer") })]);
  });

  it("holds a database lock against tenant and person", () => {
    const r = resolve({
      database: { "support.messenger": { value: true, locked: true }, "support.shakeToReport": { value: true, locked: true } },
      tenant: { "support.messenger": { value: false } },
      person: { "support.shakeToReport": { value: false } },
    });
    expect(r.values["support.messenger"]).toBe(true);
    expect(r.values["support.shakeToReport"]).toBe(true);
    expect(kinds({ database: { "support.messenger": { value: true, locked: true } }, tenant: { "support.messenger": { value: false } } })).toEqual(["locked tenant support.messenger"]);
  });

  it("doesn't count the same value again as an override attempt", () => {
    const r = resolve({ file: { "support.inbox": { value: true, locked: true } }, database: { "support.inbox": { value: true } } });
    expect(r.problems).toEqual([]);
    expect(r.sources["support.inbox"]).toEqual({ layer: "file", lockedBy: "file" });
    const object = resolve({ file: { "support.shake": { value: { thresholdG: 3, jolts: 2 }, locked: true } }, database: { "support.shake": { value: { jolts: 2, thresholdG: 3 } } } });
    expect(object.problems).toEqual([]);
  });

  it("keeps the first lock: a later lock can't take it over", () => {
    const r = resolve({ file: { "support.inbox": { value: true, locked: true } }, database: { "support.inbox": { value: false, locked: true } } });
    expect(r.values["support.inbox"]).toBe(true);
    expect(r.sources["support.inbox"]?.lockedBy).toBe("file");
  });

  it("records a tenant's lock on a tenant key", () => {
    // A tenant lock on a tenant key: there is no later layer that may set it anyway.
    const r = resolve({ tenant: { "support.messenger": { value: false, locked: true } } });
    expect(r.sources["support.messenger"]).toEqual({ layer: "tenant", lockedBy: "tenant" });
  });

  it("treats locked: false as no lock", () => {
    const r = resolve({ file: { "support.inbox": { value: false, locked: false } }, database: { "support.inbox": { value: true } } });
    expect(r.values["support.inbox"]).toBe(true);
  });
});

describe("resolveSettings: scopes and build keys", () => {
  it("ignores a tenant entry for a key not declared scope tenant, and a person entry for one not scope person", () => {
    const layers: SettingsLayers = {
      tenant: { "support.dumpRetentionDays": { value: 30 }, "support.shakeToReport": { value: false } },
      person: { "support.messenger": { value: false }, "support.inbox": { value: false } },
    };
    const r = resolve(layers);
    expect(r.values["support.dumpRetentionDays"]).toBe(90);
    expect(r.values["support.shakeToReport"]).toBe(true);
    expect(r.values["support.messenger"]).toBe(true);
    expect(kinds(layers)).toEqual(["scope tenant support.dumpRetentionDays", "scope tenant support.shakeToReport", "scope person support.messenger", "scope person support.inbox"]);
  });

  it("lets the app layers (file, database) set keys of every scope", () => {
    const r = resolve({ file: { "support.shakeToReport": { value: false } }, database: { "support.messenger": { value: false } } });
    expect(r.values["support.shakeToReport"]).toBe(false);
    expect(r.values["support.messenger"]).toBe(false);
    expect(r.problems).toEqual([]);
  });

  it("lets only the file set a build-time key", () => {
    const layers: SettingsLayers = { file: { "support.sentryDsn": { value: "https://dsn" } }, database: { "support.sentryDsn": { value: "https://other" }, "devtools.screen": { value: false } } };
    const r = resolve(layers);
    expect(r.values["support.sentryDsn"]).toBe("https://dsn");
    expect(r.values["devtools.screen"]).toBe(true);
    expect(kinds(layers)).toEqual(["build-only database support.sentryDsn", "build-only database devtools.screen"]);
  });
});

describe("resolveSettings: types, bounds and unknown keys", () => {
  it("skips a value of the wrong type or out of bounds, keeping the layer below", () => {
    const layers: SettingsLayers = {
      file: { "support.dumpRetentionDays": { value: 30 } },
      database: {
        "support.dumpRetentionDays": { value: 400 },
        "support.inbox": { value: "yes" },
        "support.channel": { value: "sms" },
        "support.languages": { value: ["en", "fr"] },
        "support.shake": { value: [1, 2] },
      },
    };
    const r = resolve(layers);
    expect(r.values["support.dumpRetentionDays"]).toBe(30);
    expect(r.sources["support.dumpRetentionDays"]).toEqual({ layer: "file" });
    expect(r.values["support.inbox"]).toBe(true);
    expect(kinds(layers)).toEqual(["type database support.dumpRetentionDays", "type database support.inbox", "type database support.channel", "type database support.languages", "type database support.shake"]);
    expect(r.problems[0]!.message).toBe("support.dumpRetentionDays must be at most 365 (the database layer has 400)");
  });

  it("checks a list's length and a number's lower bound", () => {
    expect(kinds({ file: { "support.languages": { value: [] } } })).toEqual(["type file support.languages"]);
    expect(kinds({ file: { "support.languages": { value: ["en", "nl", "de"] } } })).toEqual(["type file support.languages"]);
    expect(kinds({ file: { "support.dumpRetentionDays": { value: 6 } } })).toEqual(["type file support.dumpRetentionDays"]);
    expect(kinds({ file: { "support.dumpRetentionDays": { value: Number.NaN } } })).toEqual(["type file support.dumpRetentionDays"]);
  });

  it("reports an unknown key in any layer and an entry with no value", () => {
    const layers: SettingsLayers = { file: { "support.nope": { value: 1 } }, person: { "billing.plan": { value: "x" } }, database: { "support.inbox": {} as never } };
    expect(kinds(layers)).toEqual(["unknown-key file support.nope", "type database support.inbox", "unknown-key person billing.plan"]);
  });

  it("never throws on a bad layer, so one typo can't take the app down", () => {
    expect(() => resolve({ database: { "support.inbox": null as never, "": { value: 1 } } })).not.toThrow();
  });
});

describe("resolveSettings: requires", () => {
  it("reports a key that is on while a key it requires is off, and keeps its value", () => {
    const r = resolve({ file: { "support.inbox": { value: false } } });
    expect(r.values["support.agentDesk"]).toBe(true);
    expect(r.problems).toEqual([{ kind: "requires", key: "support.agentDesk", layer: "preset", message: "support.agentDesk is on but needs support.inbox, which is off" }]);
  });

  it("is quiet when the dependent is off too, or its requirement is on", () => {
    expect(resolve({ file: { "support.inbox": { value: false }, "support.agentDesk": { value: false } } }).problems).toEqual([]);
    expect(resolve({ preset: "min", file: { "support.inbox": { value: false } } }).problems).toEqual([]);
    expect(resolve().problems).toEqual([]);
  });

  it("reads the resolved values, after locks and every layer", () => {
    const r = resolve({ file: { "support.diagnostics": { value: false, locked: true } }, database: { "support.diagnostics": { value: true } } });
    expect(r.problems.map((p) => `${p.kind} ${p.key}`)).toEqual(["locked support.diagnostics", "requires support.dumpOnShake"]);
    expect(r.problems[1]!.layer).toBe("default");
  });
});

describe("the file and database layers", () => {
  it("reads genesis.config.json settings: plain values, and { value, locked } to lock", () => {
    expect(
      settingsLayerFromFile({
        "support.inbox": false,
        "support.diagnostics": { value: true, locked: true },
        "support.shake": { thresholdG: 3, jolts: 2 },
        "support.other": { value: 1, locked: "yes" },
      }),
    ).toEqual({
      "support.inbox": { value: false },
      "support.diagnostics": { value: true, locked: true },
      "support.shake": { value: { thresholdG: 3, jolts: 2 } },
      "support.other": { value: { value: 1, locked: "yes" } },
    });
    expect(settingsLayerFromFile(undefined)).toEqual({});
    expect(isLockedEntry({ value: 1, locked: false })).toBe(true);
    expect(isLockedEntry({ value: 1 })).toBe(false);
  });

  it("reads database rows", () => {
    expect(settingsLayerFromRows([{ key: "support.inbox", value: false, locked: true }, { key: "support.dumpRetentionDays", value: 30, locked: null }])).toEqual({
      "support.inbox": { value: false, locked: true },
      "support.dumpRetentionDays": { value: 30 },
    });
  });

  it("checks a value against a key's shape on its own", () => {
    expect(settingValueProblem(support.keys["support.dumpRetentionDays"], 3)).toBe("must be at least 7");
    expect(settingValueProblem(support.keys["support.dumpRetentionDays"], null)).toBe("can't be null: it has a default, so set a value");
    expect(settingValueProblem(support.keys["support.githubRepo"], null)).toBeNull();
  });
});

describe("feeding the gate", () => {
  const base = { owner: "mark", audience: ["admin"], summary: "Does x.", acceptance: ["It works."], reviewedAt: "2026-11-19" } as const;
  const features = defineFeatures({
    "support-messenger": { ...base, name: "Messenger", status: "live", apps: ["web"], links: { code: ["src"] } },
  });

  it("puts a feature whose switch resolved to false in off, and gives linked flags their values", () => {
    const r = resolve({ preset: "min", file: { "support.channel": { value: "email" } } });
    expect(settingsGateContext(catalogue, r)).toEqual({ off: ["support-messenger"], flags: { "support-channel": "email" }, locked: { features: [], flags: [] } });
    expect(settingsGateContext(catalogue, resolve())).toEqual({ off: [], flags: { "support-channel": "chat" }, locked: { features: [], flags: [] } });
    const locked = resolve({ file: { "support.messenger": { value: true, locked: true }, "support.channel": { value: "email", locked: true } } });
    expect(settingsGateContext(catalogue, locked).locked).toEqual({ features: ["support-messenger"], flags: ["support-channel"] });
  });

  it("keeps a locked key's flag when an unlocked key later gives the same flag a value", () => {
    const two = settingsCatalogue([
      defineSettings("a", { channel: { type: "string", default: "chat", flag: "shared-flag" } }),
      defineSettings("b", { channel: { type: "string", default: "sms", flag: "shared-flag" } }),
    ]);
    const r = resolveSettings(two, { file: { "a.channel": { value: "email", locked: true } } });
    expect(settingsGateContext(two, r)).toMatchObject({ flags: { "shared-flag": "email" }, locked: { flags: ["shared-flag"] } });
  });

  it("never throws on a value JSON can't write (a bigint), and declares planned keys", () => {
    const r = resolveSettings(catalogue, { file: { "support.dumpRetentionDays": { value: 10n } } as never });
    expect(r.problems[0]?.message).toContain("10n");
    const cycle = Object.create(null) as Record<string, unknown>;
    cycle.self = cycle;
    const c = resolveSettings(catalogue, { file: { "support.dumpRetentionDays": { value: cycle } } as never });
    expect(c.problems[0]?.message).toContain("(a value that can't be shown)");
    expect(defineSettings("x", { later: { type: "boolean", default: true, planned: true } }).keys["x.later"].planned).toBe(true);
    expect(() => defineSettings("x", { later: { type: "boolean", default: true, planned: "yes" as never } })).toThrow(/planned must be a boolean/);
  });

  it("turns the feature off through the existing gate, with reason setting", () => {
    const off = resolve({ tenant: { "support.messenger": { value: false } } });
    expect(featureOn({ features }, withSettings({ platform: "web" }, catalogue, off), "support-messenger")).toEqual({ on: false, reason: "setting" });
    // The tenant's own switch still answers "tenant".
    expect(featureOn({ features }, withSettings({ platform: "web", off: ["support-messenger"] }, catalogue, resolve()), "support-messenger")).toEqual({ on: false, reason: "tenant" });
    expect(featureOn({ features }, withSettings({ platform: "web" }, catalogue, resolve()), "support-messenger")).toEqual({ on: true });
  });

  it("keeps the context's own off switches and flags, which win over an unlocked setting's flag", () => {
    const ctx = withSettings({ platform: "web", off: ["other"], flags: { "support-channel": "sms" } }, catalogue, resolve({ preset: "min" }));
    const off = ctx.off as (id: string) => boolean;
    const settingsOff = ctx.settingsOff as (id: string) => boolean;
    expect(off("other")).toBe(true);
    expect(settingsOff("support-messenger")).toBe(true);
    expect(off("forms") || settingsOff("forms")).toBe(false);
    expect((ctx.flags as (n: string) => unknown)("support-channel")).toBe("sms");
    const fromSettings = withSettings({ platform: "web", off: new Set(["x"]), flags: () => undefined }, catalogue, resolve());
    expect((fromSettings.flags as (n: string) => unknown)("support-channel")).toBe("chat");
    expect((fromSettings.off as (id: string) => boolean)("x")).toBe(true);
  });

  it("holds a locked setting against the tenant's switch and the context's flag", () => {
    const locked = resolve({ file: { "support.messenger": { value: true, locked: true }, "support.channel": { value: "email", locked: true } } });
    const ctx = withSettings({ platform: "web", off: ["support-messenger"], flags: { "support-channel": "sms" } }, catalogue, locked);
    expect(featureOn({ features }, ctx, "support-messenger")).toEqual({ on: true });
    expect((ctx.flags as (n: string) => unknown)("support-channel")).toBe("email");
    // Locked off holds too: the setting's own answer.
    const lockedOff = resolve({ file: { "support.messenger": { value: false, locked: true } } });
    expect(featureOn({ features }, withSettings({ platform: "web" }, catalogue, lockedOff), "support-messenger")).toEqual({ on: false, reason: "setting" });
  });

  describe("a tenant or person lock never outranks the gate context", () => {
    const scoped = settingsCatalogue([
      defineSettings("beta", {
        release: { type: "boolean", default: false, scope: "tenant", flag: "beta.release" },
        tenantSwitch: { type: "boolean", default: true, scope: "tenant", feature: "beta-tenant" },
        personSwitch: { type: "boolean", default: true, scope: "person", feature: "beta-person" },
        paid: { type: "boolean", default: true, scope: "tenant", feature: "beta-paid" },
      }),
    ]);
    const registry = {
      features: {
        "beta-flagged": { status: "live" as const, apps: ["web"] },
        "beta-tenant": { status: "live" as const, apps: ["web"] },
        "beta-person": { status: "live" as const, apps: ["web"] },
        "beta-paid": { status: "live" as const, apps: ["web"], access: { plan: "pro" } },
      },
      flags: { "beta.release": { feature: "beta-flagged", kind: "release" as const, default: false } },
    };

    it("a tenant lock on a flag-linked key doesn't beat the platform's release flag", () => {
      const r = resolveSettings(scoped, { tenant: { "beta.release": { value: true, locked: true } } });
      expect(r.sources["beta.release"]).toEqual({ layer: "tenant", lockedBy: "tenant" });
      expect(settingsGateContext(scoped, r).locked).toEqual({ features: [], flags: [] });
      const ctx = withSettings({ platform: "web", flags: { "beta.release": false } }, scoped, r);
      expect((ctx.flags as (n: string) => unknown)("beta.release")).toBe(false);
      expect(featureOn(registry, ctx, "beta-flagged")).toEqual({ on: false, reason: "flag", flag: "beta.release" });
    });

    it("a tenant lock doesn't grant an entitlement", () => {
      const r = resolveSettings(scoped, { tenant: { "beta.paid": { value: true, locked: true } } });
      expect(featureOn(registry, withSettings({ platform: "web" }, scoped, r), "beta-paid")).toEqual({ on: false, reason: "entitlement", unlock: { plan: "pro" } });
    });

    it("a person lock doesn't beat the tenant's switch", () => {
      const r = resolveSettings(scoped, { person: { "beta.personSwitch": { value: true, locked: true } } });
      expect(featureOn(registry, withSettings({ platform: "web", off: ["beta-person"] }, scoped, r), "beta-person")).toEqual({ on: false, reason: "tenant" });
    });

    it("a tenant lock doesn't beat the tenant's own switch either; only the app's locks do", () => {
      const tenantLocked = resolveSettings(scoped, { tenant: { "beta.tenantSwitch": { value: true, locked: true } } });
      expect(featureOn(registry, withSettings({ platform: "web", off: ["beta-tenant"] }, scoped, tenantLocked), "beta-tenant")).toEqual({ on: false, reason: "tenant" });
      const appLocked = resolveSettings(scoped, { database: { "beta.tenantSwitch": { value: true, locked: true } } });
      expect(featureOn(registry, withSettings({ platform: "web", off: ["beta-tenant"] }, scoped, appLocked), "beta-tenant")).toEqual({ on: true });
    });

    it("a tenant or person lock still stops later settings layers", () => {
      const r = resolveSettings(scoped, { tenant: { "beta.release": { value: true, locked: true } } });
      expect(r.values["beta.release"]).toBe(true);
      expect(APP_LOCK_LAYERS).toEqual(["file", "database"]);
    });
  });

  it("reads only the context's own flag values, never a prototype's", () => {
    const ctx = withSettings({ platform: "web", flags: {} }, catalogue, resolve());
    const flag = ctx.flags as (n: string) => unknown;
    expect(flag("toString")).toBeUndefined();
    expect(flag("constructor")).toBeUndefined();
    expect(flag("__proto__")).toBeUndefined();
  });
});

describe("what /settings ships", () => {
  it("is the same code as the root, and imports nothing with zod", () => {
    expect(entry.resolveSettings).toBe(resolveSettings);
    const src = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");
    for (const file of ["settings.ts", "settings-entry.ts"]) {
      const imports = [...src(file).matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
      expect(imports.every((i) => ["./settings", "./gate", "./types"].includes(i!)), `${file}: ${imports.join(", ")}`).toBe(true);
      expect(src(file)).not.toMatch(/\b(window|document|eval|new Function|process\.env)\b/);
    }
    // settings.ts imports only types from ./gate and ./types: nothing runs from them.
    expect(src("settings.ts")).toMatch(/import type \{ GateContext, IdSet \} from "\.\/gate"/);
  });
});

describe("manifests", () => {
  it("writes the catalogue as the database checks it, without defaults or secrets", async () => {
    const { catalogueManifest } = await import("../index");
    const m = catalogueManifest(catalogue);
    expect(m["support.dumpRetentionDays"]).toEqual({ type: "number", applies: "runtime", scope: "app", min: 7, max: 365 });
    expect(m["support.githubRepo"]).toEqual({ type: "string", applies: "runtime", scope: "app", nullable: true });
    expect(m["devtools.screen"]).toEqual({ type: "boolean", applies: "build", scope: "app" });
    expect(JSON.stringify(m)).not.toMatch(/GITHUB_TOKEN|default/);
  });

  it("reads a package.json declaration with the same checks", async () => {
    const { settingsFromManifest } = await import("../index");
    const decl = settingsFromManifest({ namespace: "acme", keys: { on: { type: "boolean", default: true } } });
    expect(Object.keys(decl.keys)).toEqual(["acme.on"]);
    expect(() => settingsFromManifest({ keys: {} })).toThrow(/namespace/);
    expect(() => settingsFromManifest({ namespace: "acme", keys: { on: { type: "boolean", default: 1 } } })).toThrow(/true or false/);
  });
});

describe("hostile input", () => {
  it("treats __proto__ and constructor in a layer as unknown keys, and pollutes nothing", () => {
    const file = JSON.parse('{"__proto__": {"value": {"polluted": 1}}, "constructor": {"value": 5}}') as SettingsLayers["file"];
    const r = resolve({ file });
    expect(r.problems.map((p) => `${p.kind} ${p.key}`)).toEqual(["unknown-key __proto__", "unknown-key constructor"]);
    expect(Object.getPrototypeOf(r.values)).toBeNull();
    expect(Object.keys(r.values)).not.toContain("constructor");
    expect((r.values as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("answers toString in a tenant or person layer as an unknown key, not a scope problem", () => {
    expect(kinds({ tenant: { toString: { value: 1 } }, person: { hasOwnProperty: { value: 1 } } })).toEqual(["unknown-key tenant toString", "unknown-key person hasOwnProperty"]);
  });

  it("builds file and row layers with no prototype", () => {
    const layer = settingsLayerFromFile(JSON.parse('{"__proto__": {"x": 1}, "support.dumpRetentionDays": 10}') as Record<string, unknown>);
    expect(Object.getPrototypeOf(layer)).toBeNull();
    expect(Object.keys(layer).sort()).toEqual(["__proto__", "support.dumpRetentionDays"]);
    const rows = settingsLayerFromRows([{ key: "__proto__", value: 1 }]);
    expect(Object.getPrototypeOf(rows)).toBeNull();
    expect(kinds({ database: rows })).toEqual(["unknown-key database __proto__"]);
  });

  it("refuses a hand-built declaration with a polluted key, and a spec that inherits its default", () => {
    expect(() => settingsCatalogue([{ namespace: "z", keys: JSON.parse('{"__proto__": {"key": "z.a", "requires": []}}') } as never])).toThrow(SettingsError);
    expect(() => defineSettings("x", JSON.parse('{"__proto__": {"type": "boolean", "default": true}}') as never)).toThrow(SettingsError);
    const spec = Object.create({ default: true }) as Record<string, unknown>;
    spec.type = "boolean";
    expect(() => defineSettings("y", { a: spec as never })).toThrow(SettingsError);
    // A key may be named like an Object method: the maps have no prototype.
    const d = defineSettings("x", { constructor: { type: "boolean", default: true } } as never);
    expect(Object.keys(d.keys)).toEqual(["x.constructor"]);
  });

  it("keeps a lock whose own value is bad: the value below stays, pinned", () => {
    const r = resolve({ file: { "support.dumpRetentionDays": { value: 1, locked: true } }, database: { "support.dumpRetentionDays": { value: 200 } } });
    expect(r.values["support.dumpRetentionDays"]).toBe(90);
    expect(r.sources["support.dumpRetentionDays"]).toEqual({ layer: "default", lockedBy: "file" });
    expect(r.problems.map((p) => `${p.kind} ${p.layer}`)).toEqual(["type file", "locked database"]);
    expect(r.problems[0]!.message).toMatch(/its lock still holds the value from the default layer/);
  });

  it("refuses null for a key with a default, in any layer", () => {
    const r = resolve({ database: { "support.inbox": { value: null } } });
    expect(r.values["support.inbox"]).toBe(true);
    expect(r.problems).toEqual([expect.objectContaining({ kind: "type", key: "support.inbox", layer: "database" })]);
  });

  it("refuses NaN, and resolves the same whatever the entries' order", () => {
    expect(kinds({ database: { "support.dumpRetentionDays": { value: Number.NaN } } })).toEqual(["type database support.dumpRetentionDays"]);
    const a = resolve({ database: { "support.dumpRetentionDays": { value: 10 }, "support.inbox": { value: false } } });
    const b = resolve({ database: { "support.inbox": { value: false }, "support.dumpRetentionDays": { value: 10 } } });
    expect(JSON.stringify(a.values)).toBe(JSON.stringify(b.values));
    expect(JSON.stringify(a.sources)).toBe(JSON.stringify(b.sources));
  });

  it("keeps the scope rule in one table", () => {
    expect(SCOPE_LAYERS).toEqual({ app: ["file", "database"], tenant: ["file", "database", "tenant"], person: ["file", "database", "person"] });
  });
});

describe("whole numbers", () => {
  it("a number declared integer refuses a fraction in every layer, and the manifest says so", async () => {
    const { defineSettings, settingsCatalogue, resolveSettings, catalogueManifest, settingValueProblem } = await import("../settings");
    const decl = defineSettings("acme", { perHour: { type: "number", default: 10, min: 1, max: 100, integer: true } });
    const cat = settingsCatalogue([decl]);
    const r = resolveSettings(cat, { file: { "acme.perHour": { value: 4 } }, database: { "acme.perHour": { value: 2.5 } } });
    expect(r.values["acme.perHour"]).toBe(4);
    expect(r.problems.map((p) => p.kind)).toEqual(["type"]);
    expect(catalogueManifest(cat)["acme.perHour"]).toMatchObject({ integer: true });
    expect(settingValueProblem({ type: "number" }, 2.5)).toBeNull();
    expect(() => defineSettings("acme", { name: { type: "string", default: "x", integer: true } as never })).toThrow();
  });
});
