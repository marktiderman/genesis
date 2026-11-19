/**
 * Genesis settings: the client half of `migrations/0020_genesis_settings.sql`. Read the layers the
 * database holds and resolve them with genesis-config's `resolveSettings` (the one resolver, on
 * every platform); platform admins set, lock and clear runtime settings; the service role writes
 * the app manifest (with the catalogue the database checks values against) on deploy.
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

/** The service-role client {@link writeAppManifest} writes with. */
export interface ManifestClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: any) => { upsert: (row: any, options?: any) => PromiseLike<{ error: PostgrestErrorLike | null }> };
}

type RpcResult = { data: unknown; error: null } | { data: null; error: PostgrestErrorLike };

/**
 * What `genesis_settings_layers` returns: the layers to resolve (not resolved values): the preset,
 * the file's settings for every declared key (build-time keys too) and the database layer for runtime keys.
 *
 * @stability Beta
 */
export interface StoredSettingsLayers {
  preset: SettingsPreset;
  file: SettingsLayerValues;
  database: SettingsLayerValues;
  /** When the manifest was last written; null before the first deploy wrote it. */
  reportedAt: string | null;
}

const PRESETS: readonly string[] = ["max", "standard", "min"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The preset, the file's settings and the database layer, for any signed-in person or server code:
 * `genesis_settings_layers`. Throws a `SupabaseQueryError` (`42501`) when nobody is signed in.
 *
 * @stability Beta
 */
export async function readSettingsLayers(client: SettingsClient): Promise<StoredSettingsLayers> {
  const data = must((await client.rpc("genesis_settings_layers")) as RpcResult);
  const raw = isObject(data) ? data : {};
  const database: Record<string, { value: unknown; locked?: boolean }> = {};
  for (const [key, entry] of Object.entries(isObject(raw.database) ? raw.database : {})) {
    if (!isObject(entry) || !("value" in entry)) continue;
    database[key] = entry.locked === true ? { value: entry.value, locked: true } : { value: entry.value };
  }
  return {
    preset: (typeof raw.preset === "string" && PRESETS.includes(raw.preset) ? raw.preset : "max") as SettingsPreset,
    file: settingsLayerFromFile(isObject(raw.file) ? raw.file : {}),
    database,
    reportedAt: typeof raw.reportedAt === "string" ? raw.reportedAt : null,
  };
}

/** @stability Beta */
export interface ResolveAppSettingsOptions {
  /** The tenant's values (keys declared `scope: "tenant"`), from wherever the app keeps them. */
  tenant?: SettingsLayerValues;
  /** The person's values (keys declared `scope: "person"`). */
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
  const stored = await readSettingsLayers(client);
  return resolveSettings(catalogue, {
    preset: options.build?.preset ?? stored.preset,
    file: options.build?.file ?? stored.file,
    database: stored.database,
    ...(options.tenant ? { tenant: options.tenant } : {}),
    ...(options.person ? { person: options.person } : {}),
  });
}

/** @stability Beta */
export interface SetGenesisSettingInput {
  /** `namespace.key`, a runtime key the catalogue declares. */
  key: string;
  /** The value; `null` for "not set". */
  value: unknown;
  /** Lock it, so tenant and person values can't change it. Default false. */
  locked?: boolean;
}

/**
 * Set a runtime setting in the database layer: `set_genesis_setting`. Only platform admins (the
 * app's `private.genesis_platform_admin` hook); throws a `SupabaseQueryError` otherwise (`42501`),
 * or for a value the synced catalogue refuses (`22023`: an unknown or build-time key, one
 * genesis.config.json locks, the wrong type, out of bounds, or `null` for a key with a default).
 *
 * @stability Beta
 */
export async function setGenesisSetting(client: SettingsClient, input: SetGenesisSettingInput): Promise<void> {
  must((await client.rpc("set_genesis_setting", { key: input.key, value: input.value === undefined ? null : input.value, locked: input.locked ?? false })) as RpcResult);
}

/** Remove a setting from the database layer, so the file, preset or default applies again: `clear_genesis_setting`. Platform admins only. @stability Beta */
export async function clearGenesisSetting(client: SettingsClient, key: string): Promise<void> {
  must((await client.rpc("clear_genesis_setting", { key })) as RpcResult);
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
