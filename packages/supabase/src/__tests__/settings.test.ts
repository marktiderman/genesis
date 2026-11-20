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
  watchAppSettings,
  writeAppManifest,
  type ManifestClient,
  type RealtimeSettingsClient,
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
    expect(rpc).toHaveBeenCalledWith("genesis_settings_layers", { tenant: null });
    expect(layers).toEqual({
      preset: "min",
      file: { "support.dumpRetentionDays": { value: 30 }, "support.messenger": { value: true, locked: true } },
      database: { "support.dumpRetentionDays": { value: 60 }, "support.messenger": { value: false } },
      tenant: {},
      person: {},
      reportedAt: "2026-11-19T10:00:00Z",
    });
  });

  it("reads a tenant's layer and the person's own", async () => {
    const { client, rpc } = fakeClient({ data: { ...stored, tenant: { "support.messenger": { value: true } }, person: { "support.shakeToReport": { value: false }, "x.y": 1 } }, error: null });
    const layers = await readSettingsLayers(client, { tenantId: "tenant-a" });
    expect(rpc).toHaveBeenCalledWith("genesis_settings_layers", { tenant: "tenant-a" });
    expect(layers.tenant).toEqual({ "support.messenger": { value: true } });
    expect(layers.person).toEqual({ "support.shakeToReport": { value: false } });
  });

  it("reads 0020's layers alone on a database without migration 0023, saying so once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const code of ["PGRST202", "42883"]) {
      const rpc = vi.fn(async (_fn: string, args?: Record<string, unknown>) =>
        args ? { data: null, error: { message: "Could not find the function public.genesis_settings_layers(tenant)", code } } : { data: stored, error: null },
      );
      const r = await resolveAppSettings({ rpc } as SettingsClient, catalogue, { tenantId: "tenant-a" });
      expect(rpc.mock.calls).toEqual([["genesis_settings_layers", { tenant: "tenant-a" }], ["genesis_settings_layers"]]);
      expect(r.values["support.dumpRetentionDays"]).toBe(60);
      expect(r.sources["support.shakeToReport"]!.layer).not.toBe("person");
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/0023_genesis_settings_tenant_person/);
    warn.mockRestore();
  });

  it("doesn't fall back on a 42883 about another function (a bug in an app hook)", async () => {
    const { client, rpc } = fakeClient({ data: null, error: { message: "function private.genesis_tenant_member(uuid, text) does not exist", code: "42883" } });
    await expect(readSettingsLayers(client, { tenantId: "tenant-a" })).rejects.toBeInstanceOf(SupabaseQueryError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("doesn't fall back on any other error", async () => {
    const { client, rpc } = fakeClient({ data: null, error: { message: "only the tenant's members can read its settings", code: "42501" } });
    await expect(readSettingsLayers(client, { tenantId: "tenant-b" })).rejects.toBeInstanceOf(SupabaseQueryError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("falls back to max and empty layers before a manifest is written, and drops malformed rows", async () => {
    const { client } = fakeClient({ data: { preset: "huge", file: null, database: { "a.b": 3, "c.d": { value: 1, locked: true } }, reportedAt: null }, error: null });
    expect(await readSettingsLayers(client)).toEqual({ preset: "max", file: {}, database: { "c.d": { value: 1, locked: true } }, tenant: {}, person: {}, reportedAt: null });
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

  it("resolves with the stored tenant and person layers, and the app's lock wins", async () => {
    const { client, rpc } = fakeClient({
      data: { ...stored, file: {}, tenant: { "support.messenger": { value: true } }, person: { "support.shakeToReport": { value: false } } },
      error: null,
    });
    const r = await resolveAppSettings(client, catalogue, { tenantId: "tenant-a" });
    expect(rpc).toHaveBeenCalledWith("genesis_settings_layers", { tenant: "tenant-a" });
    expect(r.values["support.messenger"]).toBe(true);
    expect(r.sources["support.messenger"]).toEqual({ layer: "tenant" });
    expect(r.values["support.shakeToReport"]).toBe(false);
    expect(r.sources["support.shakeToReport"]).toEqual({ layer: "person" });
    const locked = fakeClient({ data: { ...stored, tenant: { "support.messenger": { value: false } } }, error: null });
    const l = await resolveAppSettings(locked.client, catalogue, { tenantId: "tenant-a" });
    expect(l.values["support.messenger"]).toBe(true);
    expect(l.sources["support.messenger"]).toEqual({ layer: "file", lockedBy: "file" });
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

  it("sets and clears a tenant's value and the person's own", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    await setGenesisSetting(client, { key: "support.messenger", value: false, layer: "tenant", tenant: "tenant-a" });
    await setGenesisSetting(client, { key: "support.shakeToReport", value: false, layer: "person" });
    await clearGenesisSetting(client, "support.messenger", { layer: "tenant", tenant: "tenant-a" });
    await clearGenesisSetting(client, "support.shakeToReport", { layer: "person" });
    expect(rpc.mock.calls).toEqual([
      ["set_genesis_tenant_setting", { tenant: "tenant-a", key: "support.messenger", value: false }],
      ["set_genesis_person_setting", { key: "support.shakeToReport", value: false }],
      ["clear_genesis_tenant_setting", { tenant: "tenant-a", key: "support.messenger" }],
      ["clear_genesis_person_setting", { key: "support.shakeToReport" }],
    ]);
  });

  it("refuses a lock outside the database layer, and a tenant write without a tenant", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    await expect(setGenesisSetting(client, { key: "support.shakeToReport", value: false, layer: "person", locked: true })).rejects.toThrow(/only the database layer locks/);
    await expect(setGenesisSetting(client, { key: "support.messenger", value: false, layer: "tenant" })).rejects.toThrow(/needs a tenant/);
    await expect(clearGenesisSetting(client, "support.messenger", { layer: "tenant" })).rejects.toThrow(/needs a tenant/);
    expect(rpc).not.toHaveBeenCalled();
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

describe("watching settings", () => {
  // Like realtime-js: one channel per topic, handed back again while it is still leaving; `subscribe()`
  // joins only a closed channel; `removeChannel` resolves later, once the channel is gone.
  function realtimeClient(data: unknown) {
    const listeners = new Map<string, () => void>();
    const joins = new Map<string, (status: string, error?: unknown) => void>();
    const removed: string[] = [];
    const live = new Map<string, { name: string; state: string }>();
    const rpc = vi.fn(async () => ({ data, error: null }));
    const channel = vi.fn((name: string, options: unknown) => {
      expect(options).toEqual({ config: { private: true } });
      const existing = live.get(name);
      if (existing) return existing;
      let onChanged: (() => void) | undefined;
      const ch = {
        name,
        state: "closed",
        on: (type: string, filter: { event: string }, cb: () => void) => {
          expect([type, filter.event]).toEqual(["broadcast", "changed"]);
          onChanged = cb;
          return ch;
        },
        subscribe: (cb: (status: string, error?: unknown) => void) => {
          if (ch.state !== "closed") return ch;
          ch.state = "joined";
          listeners.set(name, onChanged!);
          joins.set(name, cb);
          return ch;
        },
      };
      live.set(name, ch);
      return ch;
    });
    const removeChannel = vi.fn((ch: { name: string; state: string }) => {
      removed.push(ch.name);
      ch.state = "leaving";
      return new Promise((resolve) =>
        setTimeout(() => {
          ch.state = "closed";
          live.delete(ch.name);
          resolve("ok");
        }, 0),
      );
    });
    return { client: { rpc, channel, removeChannel } as unknown as RealtimeSettingsClient, rpc, listeners, joins, removed };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("resolves now, again on each change and after a reconnect, and stops cleanly", async () => {
    const fake = realtimeClient({ ...stored, tenant: { "support.messenger": { value: true } } });
    const onChange = vi.fn();
    const stop = watchAppSettings(fake.client, catalogue, { tenantId: "t1", personId: "p1", onChange });
    expect([...fake.listeners.keys()]).toEqual(["genesis-settings", "genesis-settings:tenant:t1", "genesis-settings:person:p1"]);
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].values["support.messenger"]).toBe(true);
    expect(fake.rpc).toHaveBeenCalledWith("genesis_settings_layers", { tenant: "t1" });

    fake.joins.get("genesis-settings")!("SUBSCRIBED");
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    fake.listeners.get("genesis-settings:tenant:t1")!();
    await flush();
    expect(onChange).toHaveBeenCalledTimes(2);
    fake.joins.get("genesis-settings")!("SUBSCRIBED");
    await flush();
    expect(onChange).toHaveBeenCalledTimes(3);

    stop();
    expect(fake.removed).toEqual(["genesis-settings", "genesis-settings:tenant:t1", "genesis-settings:person:p1"]);
    fake.listeners.get("genesis-settings")!();
    await flush();
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("joins again after a stop (a sign-in, a sign-out): the new watch hears changes, the old one doesn't", async () => {
    const fake = realtimeClient(stored);
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = watchAppSettings(fake.client, catalogue, { personId: "p1", onChange: first });
    const appChannel = fake.joins.get("genesis-settings");
    stopFirst();
    watchAppSettings(fake.client, catalogue, { personId: "p2", onChange: second });
    await flush();
    await flush();
    // A fresh channel, joined once the old one was gone.
    expect(fake.joins.get("genesis-settings")).not.toBe(appChannel);
    expect(second).toHaveBeenCalledTimes(1);
    // Its first join may follow changes made while it waited: it reads again.
    fake.joins.get("genesis-settings")!("SUBSCRIBED");
    await flush();
    expect(second).toHaveBeenCalledTimes(2);
    fake.listeners.get("genesis-settings")!();
    fake.listeners.get("genesis-settings:person:p2")!();
    await flush();
    expect(second).toHaveBeenCalledTimes(3);
    expect(first).not.toHaveBeenCalled();
  });

  it("reports a channel that can't be joined or times out", async () => {
    const fake = realtimeClient(stored);
    const onError = vi.fn();
    const stop = watchAppSettings(fake.client, catalogue, { tenantId: "t1", onChange: () => {}, onError });
    const denied = new Error("unauthorized");
    fake.joins.get("genesis-settings:tenant:t1")!("CHANNEL_ERROR", denied);
    fake.joins.get("genesis-settings")!("TIMED_OUT");
    expect(onError.mock.calls[0]![0]).toBe(denied);
    expect(String(onError.mock.calls[1]![0])).toMatch(/genesis-settings: TIMED_OUT/);
    stop();
    fake.joins.get("genesis-settings")!("CHANNEL_ERROR");
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("listens on the app channel alone without a tenant or person, and reports a failed read", async () => {
    const fake = realtimeClient(null);
    fake.rpc.mockImplementation(async () => ({ data: null, error: { message: "not signed in", code: "42501" } }) as never);
    const onChange = vi.fn();
    const onError = vi.fn();
    watchAppSettings(fake.client, catalogue, { onChange, onError });
    expect([...fake.listeners.keys()]).toEqual(["genesis-settings"]);
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(SupabaseQueryError);
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
      { package: "@marktiderman/genesis-supabase", file: "migrations/0023_genesis_settings_tenant_person.sql", test: "migrations/tests/0023_genesis_settings_tenant_person.test.sql", feature: "settings" },
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
      { file: "migrations/0023_genesis_settings_tenant_person.sql", test: "migrations/tests/0023_genesis_settings_tenant_person.test.sql" },
    ]);
  });

  it("fails closed without the platform-admin hook, and never stores a secret", () => {
    const sql = readFileSync(join(packageRoot, "migrations", "0020_genesis_settings.sql"), "utf8");
    expect(sql).toContain("to_regprocedure('private.genesis_platform_admin(uuid)') is null");
    expect(sql).toContain("nobody may change settings yet");
    expect(sql).not.toMatch(/\bsecret_value\b|vault\.create_secret/);
  });
});
