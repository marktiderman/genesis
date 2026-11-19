// @feat:settings-core
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { GenesisConfigError, readGenesisConfig, validatePreset, validateSettings } from "../src/doctor/config.js";
import { BUILTIN_RULES, runDoctor } from "../src/doctor/index.js";
import { installedSettings } from "../src/doctor/settings.js";
import { makeApp } from "./doctor-helpers.js";

const SUPPORT = "@marktiderman/genesis-support";
const supportPackage = (settings: unknown) =>
  JSON.stringify({ name: SUPPORT, version: "0.12.0", genesis: { settings } });
const declared = {
  namespace: "support",
  keys: {
    inbox: { type: "boolean", default: true },
    agentDesk: { type: "boolean", default: { max: true, standard: true, min: false }, requires: ["support.inbox"] },
    dumpRetentionDays: { type: "number", default: 90, min: 7, max: 365 },
    sentryDsn: { type: "string", default: null, applies: "build" },
  },
};

function app(config: unknown, packageSettings: unknown = declared): string {
  return makeApp(null, {
    "package.json": JSON.stringify({ name: "app", dependencies: { [SUPPORT]: "^0.12.0" } }),
    [`node_modules/${SUPPORT}/package.json`]: supportPackage(packageSettings),
    "genesis.config.json": JSON.stringify(config),
  });
}

async function findings(root: string) {
  const result = await runDoctor({ root, config: {} });
  return result.findings.filter((f) => f.rule === "invalid-setting").map((f) => `${f.level} ${f.subject}: ${f.message}`);
}

describe("genesis.config.json preset and settings", () => {
  it("reads them, strictly", () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-settings-config-"));
    writeFileSync(path.join(root, "genesis.config.json"), JSON.stringify({ preset: "standard", settings: { "support.inbox": false, "support.agentDesk": { value: true, locked: true } } }));
    expect(readGenesisConfig(root)).toMatchObject({ preset: "standard", settings: { "support.inbox": false, "support.agentDesk": { value: true, locked: true } } });
  });

  it.each([
    [() => validatePreset("huge"), /"preset" must be one of max, standard, min/],
    [() => validatePreset(undefined), /"preset" must be one of/],
    [() => validateSettings([]), /"settings" must be an object/],
    [() => validateSettings({ inbox: true }), /settings.inbox: a setting is "namespace.key"/],
    [() => validateSettings({ "support.a.b": true }), /namespace.key/],
    [() => validateSettings({ "support.inbox": { value: true, locked: "yes" } }), /locked must be true or false/],
  ])("refuses a malformed block (%#)", (run, message) => {
    expect(run).toThrow(GenesisConfigError);
    expect(run).toThrow(message);
  });

  it("lets an object setting hold any object that isn't exactly { value, locked }", () => {
    expect(validateSettings({ "support.shake": { thresholdG: 2, value: 1 } })).toEqual({ "support.shake": { thresholdG: 2, value: 1 } });
  });
});

describe("invalid-setting", () => {
  it("is a built-in rule", () => {
    expect(BUILTIN_RULES).toContain("invalid-setting");
  });

  it("reads the installed packages' declarations", () => {
    const root = app({});
    const { declarations, problems } = installedSettings(root);
    expect(declarations.map((d) => d.namespace)).toEqual(["support"]);
    expect(problems).toEqual([]);
  });

  it("passes settings the catalogue declares, with values that fit, and a lock", async () => {
    expect(await findings(app({ preset: "min", settings: { "support.dumpRetentionDays": 30, "support.inbox": { value: true, locked: true }, "support.sentryDsn": "https://dsn" } }))).toEqual([]);
  });

  it("fails an unknown key and a value that doesn't fit", async () => {
    expect(await findings(app({ settings: { "support.nope": true, "support.dumpRetentionDays": 400, "support.inbox": "yes" } }))).toEqual([
      "error support.nope: settings.support.nope: no installed Genesis package declares this setting (a typo, or a package that isn't installed)",
      "error support.dumpRetentionDays: settings.support.dumpRetentionDays must be at most 365 (the file layer has 400)",
      "error support.inbox: settings.support.inbox must be true or false (the file layer has \"yes\")",
    ]);
  });

  it("warns when a key is on while one it requires is off", async () => {
    expect(await findings(app({ settings: { "support.inbox": false } }))).toEqual([
      "warn support.agentDesk: settings.support.agentDesk is on but needs support.inbox, which is off",
    ]);
    expect(await findings(app({ preset: "min", settings: { "support.inbox": false } }))).toEqual([]);
  });

  it("fails every setting when no installed package declares settings", async () => {
    const root = makeApp(null, {
      "package.json": JSON.stringify({ name: "app", dependencies: { [SUPPORT]: "^0.12.0" } }),
      [`node_modules/${SUPPORT}/package.json`]: JSON.stringify({ name: SUPPORT, version: "0.12.0" }),
      "genesis.config.json": JSON.stringify({ settings: { "support.inbox": false } }),
    });
    expect(await findings(root)).toEqual([
      "error support.inbox: settings.support.inbox: no installed Genesis package declares this setting (a typo, or a package that isn't installed)",
    ]);
  });

  it("reports a package's declaration that can't be used", async () => {
    const out = await findings(app({}, { namespace: "support", keys: { inbox: { type: "boolean", default: "yes" } } }));
    expect(out).toEqual([expect.stringMatching(/^error @marktiderman\/genesis-support: @marktiderman\/genesis-support declares settings that can't be used: .*support.inbox default must be true or false/)]);
  });

  it("reads settings from Genesis packages installed transitively, not only direct dependencies", async () => {
    const root = makeApp(null, {
      "package.json": JSON.stringify({ name: "app", dependencies: { "@marktiderman/genesis": "^0.12.0" } }),
      [`node_modules/${SUPPORT}/package.json`]: supportPackage(declared),
      "genesis.config.json": JSON.stringify({ settings: { "support.dumpRetentionDays": 30 } }),
    });
    expect(installedSettings(root).declarations.map((d) => d.namespace)).toEqual(["support"]);
    expect(await findings(root)).toEqual([]);
  });

  it("reports a Genesis package whose package.json can't be read, and goes on", () => {
    const root = makeApp(null, {
      "package.json": JSON.stringify({ name: "app" }),
      "node_modules/@marktiderman/genesis-broken/package.json": "{ not json",
      [`node_modules/${SUPPORT}/package.json`]: supportPackage(declared),
    });
    const { declarations, problems } = installedSettings(root);
    expect(declarations.map((d) => d.namespace)).toEqual(["support"]);
    expect(problems).toEqual([expect.objectContaining({ pkg: "@marktiderman/genesis-broken" })]);
  });

  it("stays quiet in an app with no settings or preset", async () => {
    expect(await findings(app({}))).toEqual([]);
  });
});

describe("genesis-config-unknown-key", () => {
  it("warns on a top-level key nothing reads, naming the one meant", async () => {
    const root = app({ presets: "max", setting: {}, settings: {}, doctor: {}, $schema: "x" });
    const result = await runDoctor({ root, config: {} });
    expect(result.findings.filter((f) => f.rule === "genesis-config-unknown-key").map((f) => `${f.level} ${f.subject}: ${f.message}`)).toEqual([
      'warn presets: "presets" isn\'t a genesis.config.json setting, so nothing reads it: did you mean "preset"?; or upgrade @marktiderman/genesis-cli if this is a newer key',
      'warn setting: "setting" isn\'t a genesis.config.json setting, so nothing reads it: did you mean "settings"?; or upgrade @marktiderman/genesis-cli if this is a newer key',
    ]);
    expect(BUILTIN_RULES).toContain("genesis-config-unknown-key");
  });
});
