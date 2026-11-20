/**
 * Genesis settings: the client half of `migrations/0020_genesis_settings.sql` and
 * `0023_genesis_settings_tenant_person.sql`. Read the layers the database holds and resolve them
 * with genesis-config's `resolveSettings` (the one resolver, on every platform); platform admins
 * set, lock and clear runtime settings, tenant admins their tenant's values and each person their
 * own; `watchAppSettings` re-resolves when a layer changes (Realtime); the service role writes the
 * app manifest (with the catalogue the database checks values against) on deploy.
 */
import {
  catalogueManifest,
  resolveSettings,
  settingsLayerFromFile,
  type ResolvedSettings,
  type SettingsCatalogue,
  type SettingsLayerValues,
  type SettingsLayers,
  type SettingsPreset,
} from "@marktiderman/genesis-config/settings";
// A cycle with ./index, used only inside the functions.
import { must, type PostgrestErrorLike } from "./index";

/** The parts of a Supabase client these helpers use. A `SupabaseClient` fits. */
export interface SettingsClient {
  // Loose on purpose: a client typed by an app's Database narrows `rpc`'s function names, and the
  // app's generated types may not list these yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: PostgrestErrorLike | null }>;
}

/** A client with Realtime, for {@link watchAppSettings}. A `SupabaseClient` fits. */
export interface RealtimeSettingsClient extends SettingsClient {
  // Loose for the same reason as `rpc`: supabase-js's channel types are overloaded.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel: (name: string, options: { config: { private: true } }) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeChannel: (channel: any) => unknown;
}

/** The service-role client {@link writeAppManifest} writes with. */
export interface ManifestClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: any) => { upsert: (row: any, options?: any) => PromiseLike<{ error: PostgrestErrorLike | null }> };
}

type RpcResult = { data: unknown; error: null } | { data: null; error: PostgrestErrorLike };

/**
 * What `genesis_settings_layers` returns: the layers to resolve (not resolved values): the preset,
 * the file's settings for every declared key (build-time keys too), the database layer for runtime
 * keys, the tenant's layer (keys declared `scope: "tenant"`) and the signed-in person's (keys
 * declared `scope: "person"`).
 *
 * @stability Beta
 */
export interface StoredSettingsLayers {
  preset: SettingsPreset;
  file: SettingsLayerValues;
  database: SettingsLayerValues;
  /** The tenant's values; empty when no tenant was asked for. */
  tenant: SettingsLayerValues;
  /** The signed-in person's own values; empty for server code. */
  person: SettingsLayerValues;
  /** When the manifest was last written; null before the first deploy wrote it. */
  reportedAt: string | null;
}

const PRESETS: readonly string[] = ["max", "standard", "min"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function storedLayer(raw: unknown): SettingsLayerValues {
  const out: Record<string, { value: unknown; locked?: boolean }> = {};
  for (const [key, entry] of Object.entries(isObject(raw) ? raw : {})) {
    if (!isObject(entry) || !("value" in entry)) continue;
    out[key] = entry.locked === true ? { value: entry.value, locked: true } : { value: entry.value };
  }
  return out;
}

// The database predates migration 0023: PostgREST can't find genesis_settings_layers(tenant), or
// Postgres says that function doesn't exist. A 42883 about anything else (a type bug in an app
// hook, say) is a real error, not a missing migration.
function layersFunctionMissing(error: PostgrestErrorLike): boolean {
  return error.code === "PGRST202" || (error.code === "42883" && /genesis_settings_layers/.test(error.message ?? ""));
}
let warnedWithoutScopedLayers = false;

/**
 * The stored layers, for any signed-in person or server code: `genesis_settings_layers`. With
 * `tenantId`, the tenant's layer too (its members and admins, platform admins and server code
 * only). On a database without migration 0023 it reads 0020's layers and returns no tenant or
 * person values (saying so once in the console). Throws a `SupabaseQueryError` (`42501`) when
 * nobody is signed in, or the caller may not read that tenant.
 *
 * @stability Beta
 */
export async function readSettingsLayers(client: SettingsClient, options: { tenantId?: string } = {}): Promise<StoredSettingsLayers> {
  let result = (await client.rpc("genesis_settings_layers", { tenant: options.tenantId ?? null })) as RpcResult;
  if (result.error && layersFunctionMissing(result.error)) {
    if (!warnedWithoutScopedLayers) {
      warnedWithoutScopedLayers = true;
      // genesis-allow-console: a set-up hint, once: the app's database is missing a migration.
      console.warn("Genesis settings: genesis_settings_layers(tenant) isn't in the database, so tenant and person values are left out. Apply genesis-supabase migration 0023_genesis_settings_tenant_person.sql (genesis migrate).");
    }
    result = (await client.rpc("genesis_settings_layers")) as RpcResult;
  }
  const data = must(result);
  const raw = isObject(data) ? data : {};
  return {
    preset: (typeof raw.preset === "string" && PRESETS.includes(raw.preset) ? raw.preset : "max") as SettingsPreset,
    file: settingsLayerFromFile(isObject(raw.file) ? raw.file : {}),
    database: storedLayer(raw.database),
    tenant: storedLayer(raw.tenant),
    person: storedLayer(raw.person),
    reportedAt: typeof raw.reportedAt === "string" ? raw.reportedAt : null,
  };
}

/** @stability Beta */
export interface ResolveAppSettingsOptions {
  /** The tenant whose stored values to resolve with (keys declared `scope: "tenant"`). */
  tenantId?: string;
  /** The tenant's values, in place of the stored ones (from wherever the app keeps them). */
  tenant?: SettingsLayerValues;
  /** The person's values, in place of the signed-in person's stored ones (keys declared `scope: "person"`). */
  person?: SettingsLayerValues;
  /**
   * The layers the build itself carries (the preset and genesis.config.json `settings`); when given,
   * they replace the stored preset and file layer (the stored ones are what the last deploy wrote).
   */
  build?: Pick<SettingsLayers, "preset" | "file">;
}

/**
 * Read the stored layers and resolve them with the app's catalogue: values, where each came from,
 * and what was wrong.
 *
 * ```ts
 * const settings = await resolveAppSettings(supabase, catalogue, { person: myPreferences });
 * settings.values["support.messenger"]; // true
 * ```
 *
 * @stability Beta
 */
export async function resolveAppSettings(client: SettingsClient, catalogue: SettingsCatalogue, options: ResolveAppSettingsOptions = {}): Promise<ResolvedSettings> {
  const stored = await readSettingsLayers(client, options.tenantId !== undefined ? { tenantId: options.tenantId } : {});
  return resolveSettings(catalogue, {
    preset: options.build?.preset ?? stored.preset,
    file: options.build?.file ?? stored.file,
    database: stored.database,
    tenant: options.tenant ?? stored.tenant,
    person: options.person ?? stored.person,
  });
}

/**
 * The app's settings as {@link resolveAppSettings} and {@link watchAppSettings} give them: every
 * key's value, with the layer it came from (genesis-config's `ResolvedSettings`). Hand it to a
 * package's `appSettings`.
 *
 * @stability Beta
 */
export type AppSettings = ResolvedSettings;

/** @stability Beta */
export interface WatchAppSettingsOptions extends ResolveAppSettingsOptions {
  /** The signed-in person's id, to hear when their own values change. */
  personId?: string;
  /** Called with the resolved settings now, and again after every change. */
  onChange: (settings: AppSettings) => void;
  /**
   * Called when a read fails, or a channel can't be joined or times out (`CHANNEL_ERROR`,
   * `TIMED_OUT`: for example Realtime is off, or the listen policy is missing). The last good
   * settings stay where they are.
   */
  onError?: (error: unknown) => void;
}

/**
 * Resolve the settings now and again whenever a layer changes: the database layer, the tenant's
 * (`tenantId`) or the person's (`personId`). It listens on the private Realtime channels migration
 * 0023 broadcasts on (each change names the layer and key, never the value), re-reads after a
 * reconnect, and returns the function that stops it. Not wanted? Call {@link resolveAppSettings}
 * instead: nothing listens.
 *
 * ```ts
 * const stop = watchAppSettings(supabase, catalogue, { tenantId, personId: user.id, onChange: setSettings });
 * ```
 *
 * @stability Beta
 */
export function watchAppSettings(client: RealtimeSettingsClient, catalogue: SettingsCatalogue, options: WatchAppSettingsOptions): () => void {
  let stopped = false;
  let latest = 0;
  const refresh = () => {
    const mine = ++latest;
    resolveAppSettings(client, catalogue, options).then(
      (settings) => {
        if (!stopped && mine === latest) options.onChange(settings);
      },
      (error: unknown) => {
        if (!stopped && mine === latest) options.onError?.(error);
      },
    );
  };
  const topics = [
    "genesis-settings",
    ...(options.tenantId ? [`genesis-settings:tenant:${options.tenantId}`] : []),
    ...(options.personId ? [`genesis-settings:person:${options.personId}`] : []),
  ];
  const pending = leaving.get(client) ?? new Map<string, Promise<void>>();
  leaving.set(client, pending);
  const channels: { topic: string; channel: unknown }[] = [];
  // `rejoin`: this watch waited for an earlier one's channel to go, so its first join may follow changes the read missed.
  const join = (topic: string, rejoin: boolean) => {
    if (stopped) return;
    let joined = rejoin;
    const channel = client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "changed" }, refresh)
      .subscribe((status: string, error?: unknown) => {
        if (stopped) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          options.onError?.(error instanceof Error ? error : new Error(`Genesis settings: Realtime channel ${topic}: ${status}`));
          return;
        }
        // The first join follows the read below; a later one is a reconnect, which may have missed changes.
        if (status !== "SUBSCRIBED") return;
        if (joined) refresh();
        joined = true;
      });
    channels.push({ topic, channel });
  };
  for (const topic of topics) {
    const gone = pending.get(topic);
    if (gone) void gone.then(() => join(topic, true));
    else join(topic, false);
  }
  refresh();
  return () => {
    stopped = true;
    for (const { topic, channel } of channels) {
      // Whatever removal answers ("ok", "timed out", an error), the old channel is no longer in the client's way.
      const done = new Promise<void>((resolve) => {
        try {
          Promise.resolve(client.removeChannel(channel)).then(
            () => resolve(),
            () => resolve(),
          );
        } catch {
          resolve();
        }
      });
      pending.set(topic, done);
      void done.then(() => {
        if (pending.get(topic) === done) pending.delete(topic);
      });
    }
  };
}

/**
 * Each client's settings channels still being removed, by topic. realtime-js hands a new
 * `channel(topic)` the one still leaving under that topic, and `subscribe()` on it does nothing,
 * so a watch started right after another stopped (a sign-in, a sign-out) waits for the old
 * channel to go before it joins.
 */
const leaving = new WeakMap<object, Map<string, Promise<void>>>();

/** @stability Beta */
export interface SetGenesisSettingInput {
  /** `namespace.key`, a runtime key the catalogue declares. */
  key: string;
  /** The value; `null` for "not set". */
  value: unknown;
  /** Lock it, so tenant and person values can't change it. Default false. The database layer only. */
  locked?: boolean;
  /**
   * The layer to write: `database` (default; platform admins), `tenant` (the tenant's admins, keys
   * declared `scope: "tenant"`, with `tenant`) or `person` (the signed-in person's own value, keys
   * declared `scope: "person"`).
   */
  layer?: GenesisSettingLayer;
  /** The tenant's id, for the `tenant` layer. */
  tenant?: string;
}

/** The layers stored in the app's database. @stability Beta */
export type GenesisSettingLayer = "database" | "tenant" | "person";

function layerCall(verb: "set" | "clear", input: { layer?: GenesisSettingLayer; tenant?: string; locked?: boolean }): { fn: string; args: Record<string, unknown> } {
  const layer = input.layer ?? "database";
  if (layer !== "database" && input.locked) throw new TypeError(`${verb}GenesisSetting: only the database layer locks a value`);
  if (layer === "tenant" && !input.tenant) throw new TypeError(`${verb}GenesisSetting: the tenant layer needs a tenant`);
  if (layer === "tenant") return { fn: `${verb}_genesis_tenant_setting`, args: { tenant: input.tenant } };
  if (layer === "person") return { fn: `${verb}_genesis_person_setting`, args: {} };
  return { fn: `${verb}_genesis_setting`, args: {} };
}

/**
 * Set a runtime setting: in the database layer (`set_genesis_setting`, platform admins: the app's
 * `private.genesis_platform_admin` hook), a tenant's layer (`set_genesis_tenant_setting`, the
 * tenant's admins: `private.genesis_tenant_admin`) or the signed-in person's
 * (`set_genesis_person_setting`). Throws a `SupabaseQueryError` when the caller may not (`42501`),
 * or for a value the synced catalogue refuses (`22023`: an unknown or build-time key, one a lower
 * layer locks, a key of another scope, the wrong type, out of bounds, or `null` for a key with a default).
 *
 * @stability Beta
 */
export async function setGenesisSetting(client: SettingsClient, input: SetGenesisSettingInput): Promise<void> {
  const { fn, args } = layerCall("set", input);
  const value = input.value === undefined ? null : input.value;
  must((await client.rpc(fn, fn === "set_genesis_setting" ? { key: input.key, value, locked: input.locked ?? false } : { ...args, key: input.key, value })) as RpcResult);
}

/**
 * Remove a value from a layer, so the layers below apply again: the database layer (default;
 * platform admins), a tenant's (`{ layer: "tenant", tenant }`, its admins) or the signed-in
 * person's own (`{ layer: "person" }`).
 *
 * @stability Beta
 */
export async function clearGenesisSetting(client: SettingsClient, key: string, options: { layer?: GenesisSettingLayer; tenant?: string } = {}): Promise<void> {
  const { fn, args } = layerCall("clear", options);
  must((await client.rpc(fn, { ...args, key })) as RpcResult);
}

/** One change to the database layer. A null `new_value` with `new_locked` null is a cleared setting. @stability Beta */
export interface GenesisSettingChange {
  key: string;
  old_value: unknown;
  new_value: unknown;
  old_locked: boolean | null;
  new_locked: boolean | null;
  /** The person, or null for the service role, a migration, or a person since deleted. */
  changed_by: string | null;
  changed_role: string;
  source: "admin" | "wizard" | "cli" | "central" | "server" | "database";
  changed_at: string;
}

/** The database layer's history, newest first (at most `maxRows`, 1 to 1000, default 100). Platform admins only. @stability Beta */
export async function genesisSettingHistory(client: SettingsClient, options: { maxRows?: number } = {}): Promise<GenesisSettingChange[]> {
  const args = options.maxRows === undefined ? {} : { max_rows: options.maxRows };
  return (must((await client.rpc("genesis_setting_history", args)) as RpcResult) ?? []) as GenesisSettingChange[];
}

/** What this app runs, written on deploy and at app start. @stability Beta */
export interface AppManifestInput {
  /** The app's slug (`sample-app`). */
  appId: string;
  name?: string;
  /** Package → version, from genesis.lock.json. */
  packages?: Record<string, string>;
  preset?: SettingsPreset;
  configHash?: string;
  /** genesis.config.json `settings`, as written. */
  fileSettings?: Record<string, unknown>;
  /** The app's catalogue: the database checks platform admins' values against it. */
  catalogue: SettingsCatalogue;
}

/**
 * Write the app manifest (one row) with the service-role client, on deploy and at app start. It
 * carries the catalogue `set_genesis_setting` validates against: until it's written, no setting
 * can be changed. Server only: never with a browser's client.
 *
 * @stability Beta
 */
export async function writeAppManifest(admin: ManifestClient, input: AppManifestInput): Promise<void> {
  const row = {
    app_id: input.appId,
    name: input.name ?? null,
    packages: input.packages ?? {},
    preset: input.preset ?? "max",
    config_hash: input.configHash ?? null,
    file_settings: input.fileSettings ?? {},
    catalogue: catalogueManifest(input.catalogue),
    reported_at: new Date().toISOString(),
  };
  // One row: an app that changed its id replaces the old row (the `one` column is unique).
  const { error } = await admin.from("genesis_app_manifest").upsert(row, { onConflict: "one" });
  must({ data: null, error } as RpcResult);
}
