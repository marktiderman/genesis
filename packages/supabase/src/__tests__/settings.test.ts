// @feat:settings-core @feat:define-block
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveBlocks } from "@marktiderman/genesis-config/blocks";
import { defineSettings, settingsCatalogue } from "@marktiderman/genesis-config/settings";
import {
  SupabaseQueryError,
  clearGenesisSetting,
  genesisSettingHistory,
  readSettingsLayers,
  resolveAppSettings,
  setGenesisSetting,
  settingsBlock,
  writeAppManifest,
  type ManifestClient,
  type SettingsClient,
} from "../index";

const packageRoot = join(__dirname, "..", "..");

const catalogue = settingsCatalogue([
  defineSettings("support", {
    messenger: { type: "boolean", default: { max: true, standard: true, min: false }, scope: "tenant" },
    dumpRetentionDays: { type: "number", default: 90, min: 7, max: 365 },
    shakeToReport: { type: "boolean", default: true, scope: "person" },
    sentryDsn: { type: "string", default: null, applies: "build" },
    githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN" },
  }),
]);

function fakeClient(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const rpc = vi.fn(async (_fn: string, _args?: Record<string, unknown>) => result);
  return { client: { rpc } as SettingsClient, rpc };
}

const stored = {
  preset: "min",
  file: { "support.dumpRetentionDays": 30, "support.messenger": { value: true, locked: true } },
  database: { "support.dumpRetentionDays": { value: 60, locked: false }, "support.messenger": { value: false, locked: false } },
  reportedAt: "2026-11-19T10:00:00Z",
};

describe("reading settings", () => {
  it("reads the stored layers: the preset, the file (with its locks) and the database", async () => {
    const { client, rpc } = fakeClient({ data: stored, error: null });
    const layers = await readSettingsLayers(client);
    expect(rpc).toHaveBeenCalledWith("genesis_settings_layers");
    expect(layers).toEqual({
      preset: "min",
      file: { "support.dumpRetentionDays": { value: 30 }, "support.messenger": { value: true, locked: true } },
      database: { "support.dumpRetentionDays": { value: 60 }, "support.messenger": { value: false } },
      reportedAt: "2026-11-19T10:00:00Z",
    });
  });

  it("falls back to max and empty layers before a manifest is written, and drops malformed rows", async () => {
    const { client } = fakeClient({ data: { preset: "huge", file: null, database: { "a.b": 3, "c.d": { value: 1, locked: true } }, reportedAt: null }, error: null });
    expect(await readSettingsLayers(client)).toEqual({ preset: "max", file: {}, database: { "c.d": { value: 1, locked: true } }, reportedAt: null });
  });

  it("resolves through the one resolver, with tenant and person values, and a lock from the file", async () => {
    const { client } = fakeClient({ data: stored, error: null });
    const r = await resolveAppSettings(client, catalogue, { person: { "support.shakeToReport": { value: false } } });
    expect(r.preset).toBe("min");
    expect(r.values["support.dumpRetentionDays"]).toBe(60);
    expect(r.values["support.messenger"]).toBe(true);
    expect(r.sources["support.messenger"]).toEqual({ layer: "file", lockedBy: "file" });
    expect(r.values["support.shakeToReport"]).toBe(false);
    expect(r.problems.map((p) => p.kind)).toEqual(["locked"]);
  });

  it("resolves a build-time key from the stored file layer, not as its default", async () => {
    const { client } = fakeClient({ data: { ...stored, file: { ...stored.file, "support.sentryDsn": "https://dsn.example" } }, error: null });
    const r = await resolveAppSettings(client, catalogue);
    expect(r.values["support.sentryDsn"]).toBe("https://dsn.example");
    expect(r.sources["support.sentryDsn"]).toEqual({ layer: "file" });
  });

  it("takes the build's preset and file over the stored ones, for build-time keys", async () => {
    const { client } = fakeClient({ data: stored, error: null });
    const r = await resolveAppSettings(client, catalogue, { build: { preset: "max", file: { "support.sentryDsn": { value: "https://dsn" } } } });
    expect(r.preset).toBe("max");
    expect(r.values["support.sentryDsn"]).toBe("https://dsn");
    expect(r.values["support.messenger"]).toBe(false);
  });

  it("throws a refusal rather than resolving defaults", async () => {
    const { client } = fakeClient({ data: null, error: { message: "not signed in", code: "42501" } });
    const failure = await resolveAppSettings(client, catalogue).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(SupabaseQueryError);
  });
});

describe("changing settings", () => {
  it("sets, locks and clears through the RPCs", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    await setGenesisSetting(client, { key: "support.dumpRetentionDays", value: 30 });
    await setGenesisSetting(client, { key: "support.messenger", value: true, locked: true });
    await setGenesisSetting(client, { key: "support.githubRepo", value: undefined });
    await clearGenesisSetting(client, "support.messenger");
    expect(rpc.mock.calls).toEqual([
      ["set_genesis_setting", { key: "support.dumpRetentionDays", value: 30, locked: false }],
      ["set_genesis_setting", { key: "support.messenger", value: true, locked: true }],
      ["set_genesis_setting", { key: "support.githubRepo", value: null, locked: false }],
      ["clear_genesis_setting", { key: "support.messenger" }],
    ]);
  });

  it("throws the database's refusal (not a platform admin, a value the catalogue refuses)", async () => {
    const { client } = fakeClient({ data: null, error: { message: "set_genesis_setting: support.dumpRetentionDays must be at most 365", code: "22023" } });
    const failure = await setGenesisSetting(client, { key: "support.dumpRetentionDays", value: 400 }).catch((e: unknown) => e);
    expect((failure as SupabaseQueryError).code).toBe("22023");
  });

  it("reads the history with a row limit", async () => {
    const { client, rpc } = fakeClient({ data: [{ key: "support.messenger" }], error: null });
    expect(await genesisSettingHistory(client, { maxRows: 5 })).toEqual([{ key: "support.messenger" }]);
    expect(rpc).toHaveBeenCalledWith("genesis_setting_history", { max_rows: 5 });
    await genesisSettingHistory(client);
    expect(rpc).toHaveBeenLastCalledWith("genesis_setting_history", {});
  });
});

describe("the manifest", () => {
  it("writes one row with the catalogue the database checks, and no secrets", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    await writeAppManifest({ from } as unknown as ManifestClient, {
      appId: "sample-app",
      packages: { "@marktiderman/genesis-config": "0.10.1" },
      preset: "standard",
      fileSettings: { "support.dumpRetentionDays": 30 },
      catalogue,
    });
    expect(from).toHaveBeenCalledWith("genesis_app_manifest");
    const [row, options] = upsert.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    expect(options).toEqual({ onConflict: "one" });
    expect(row).toMatchObject({ app_id: "sample-app", preset: "standard", file_settings: { "support.dumpRetentionDays": 30 }, name: null, config_hash: null });
    expect((row.catalogue as Record<string, unknown>)["support.dumpRetentionDays"]).toEqual({ type: "number", applies: "runtime", scope: "app", min: 7, max: 365 });
    expect(JSON.stringify(row)).not.toMatch(/GITHUB_TOKEN/);
  });

  it("throws when the write fails", async () => {
    const from = () => ({ upsert: async () => ({ error: { message: "permission denied", code: "42501" } }) });
    await expect(writeAppManifest({ from } as unknown as ManifestClient, { appId: "sample-app", catalogue })).rejects.toBeInstanceOf(SupabaseQueryError);
  });
});

describe("the settings block", () => {
  it("ships its migration and test, and package.json declares it the same way", () => {
    const resolved = resolveBlocks([settingsBlock], undefined, { platform: "web" });
    expect(resolved.migrations).toEqual([
      { package: "@marktiderman/genesis-supabase", file: "migrations/0020_genesis_settings.sql", test: "migrations/tests/0020_genesis_settings.test.sql", feature: "settings" },
      { package: "@marktiderman/genesis-supabase", file: "migrations/0021_genesis_settings_integer.sql", test: "migrations/tests/0021_genesis_settings_integer.test.sql", feature: "settings" },
      { package: "@marktiderman/genesis-supabase", file: "migrations/0022_genesis_platform_admins.sql", test: "migrations/tests/0022_genesis_platform_admins.test.sql", feature: "settings" },
    ]);
    for (const m of resolved.migrations) {
      expect(existsSync(join(packageRoot, m.file)), m.file).toBe(true);
      expect(existsSync(join(packageRoot, m.test!)), m.test).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).genesis.blocks.settings;
    expect(manifest.migrations).toEqual([
      { file: "migrations/0020_genesis_settings.sql", test: "migrations/tests/0020_genesis_settings.test.sql" },
      { file: "migrations/0021_genesis_settings_integer.sql", test: "migrations/tests/0021_genesis_settings_integer.test.sql" },
      { file: "migrations/0022_genesis_platform_admins.sql", test: "migrations/tests/0022_genesis_platform_admins.test.sql" },
    ]);
  });

  it("fails closed without the platform-admin hook, and never stores a secret", () => {
    const sql = readFileSync(join(packageRoot, "migrations", "0020_genesis_settings.sql"), "utf8");
    expect(sql).toContain("to_regprocedure('private.genesis_platform_admin(uuid)') is null");
    expect(sql).toContain("nobody may change settings yet");
    expect(sql).not.toMatch(/\bsecret_value\b|vault\.create_secret/);
  });
});
