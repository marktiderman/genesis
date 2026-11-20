/**
 * `genesis settings sync`: write the app manifest (genesis-supabase's `genesis_app_manifest`) on
 * deploy. The manifest carries the settings catalogue `set_genesis_setting` checks platform admins'
 * values against; until it is written, every write is refused. The row is what `writeAppManifest`
 * writes from a server: the installed Genesis packages and their versions, the preset, the file's
 * settings and the catalogue, built here from the app's own files.
 *
 * It goes through the linked project (`supabase db query --linked`), as the doctor reads the
 * database layer, so no key is handled here; `--print` gives the SQL for a pipeline that runs it
 * its own way (psql with the database URL).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { catalogueManifest, settingsCatalogue, type SettingsCatalogue } from "@marktiderman/genesis-config/settings";
import { installedGenesis } from "./blocks/discover.js";
import { readGenesisConfig } from "./doctor/config.js";
import { installedSettings } from "./doctor/settings.js";
import { runTool, TOOL_AUTH_ENV, type ToolRunner } from "./exec/run.js";

const APP_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;

/** The manifest row, as the table holds it. */
export interface ManifestRow {
  app_id: string;
  name: string | null;
  packages: Record<string, string>;
  preset: "max" | "standard" | "min";
  config_hash: string | null;
  file_settings: Record<string, unknown>;
  catalogue: ReturnType<typeof catalogueManifest>;
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

function readPackageJson(file: string): { name?: unknown; version?: unknown } | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as { name?: unknown; version?: unknown };
  } catch {
    return null;
  }
}

/** The app's id: `--app-id`, else its package.json name without a scope, lower-cased. */
export function appIdOf(root: string, given?: string): string {
  if (given !== undefined) {
    if (!APP_ID.test(given)) throw new ManifestError(`--app-id ${JSON.stringify(given)} isn't an app id (lower-case letters, digits, '.', '_' and '-', 100 at most).`);
    return given;
  }
  const name = readPackageJson(path.join(root, "package.json"))?.name;
  const id = typeof name === "string" ? name.replace(/^@[^/]+\//, "").toLowerCase() : "";
  if (!APP_ID.test(id)) throw new ManifestError("The app's package.json has no name that works as an app id: pass --app-id.");
  return id;
}

/** Build the manifest row from the app's files. Throws a ManifestError when the catalogue can't be built. */
export function buildManifest(root: string, options: { appId?: string } = {}): ManifestRow {
  const config = readGenesisConfig(root);
  const { declarations, problems } = installedSettings(root);
  if (problems.length) throw new ManifestError(`The settings catalogue can't be built: ${problems.map((p) => `${p.pkg}: ${p.message}`).join("; ")}`);
  let catalogue: SettingsCatalogue;
  try {
    catalogue = settingsCatalogue(declarations);
  } catch (err) {
    throw new ManifestError(`The settings catalogue can't be built: ${(err as Error).message}`);
  }
  const packages: Record<string, string> = {};
  for (const [name, dir] of [...installedGenesis(root)].sort(([a], [b]) => a.localeCompare(b))) {
    const version = readPackageJson(path.join(dir, "package.json"))?.version;
    if (typeof version === "string") packages[name] = version;
  }
  const configFile = path.join(root, "genesis.config.json");
  const appName = readPackageJson(path.join(root, "package.json"))?.name;
  return {
    app_id: appIdOf(root, options.appId),
    name: typeof appName === "string" ? appName.slice(0, 200) : null,
    packages,
    preset: config?.preset ?? "max",
    config_hash: existsSync(configFile) ? createHash("sha256").update(readFileSync(configFile)).digest("hex") : null,
    file_settings: (config?.settings ?? {}) as Record<string, unknown>,
    catalogue: catalogueManifest(catalogue),
  };
}

/** A SQL string literal (standard_conforming_strings: only `'` needs doubling). */
function literal(value: string | null): string {
  return value === null ? "null" : `'${value.replace(/'/g, "''")}'`;
}

/** The upsert: one row, so an app that changed its id replaces the old one (as `writeAppManifest` does). */
export function manifestSql(row: ManifestRow): string {
  const json = (v: unknown) => `${literal(JSON.stringify(v))}::jsonb`;
  return [
    "insert into public.genesis_app_manifest (app_id, name, packages, preset, config_hash, file_settings, catalogue, reported_at)",
    `values (${literal(row.app_id)}, ${literal(row.name)}, ${json(row.packages)}, ${literal(row.preset)}, ${literal(row.config_hash)}, ${json(row.file_settings)}, ${json(row.catalogue)}, now())`,
    "on conflict (one) do update set app_id = excluded.app_id, name = excluded.name, packages = excluded.packages, preset = excluded.preset,",
    "  config_hash = excluded.config_hash, file_settings = excluded.file_settings, catalogue = excluded.catalogue, reported_at = excluded.reported_at;",
    "",
  ].join("\n");
}

/** Write the manifest through the linked Supabase project. */
export async function syncManifest(root: string, row: ManifestRow, run: ToolRunner = runTool): Promise<void> {
  const result = await run("supabase", ["db", "query", "--linked", "-f", "/dev/stdin"], { cwd: root, stdin: manifestSql(row), timeoutMs: 60_000, passEnv: TOOL_AUTH_ENV["supabase"] ?? [] });
  if (result.code !== 0) throw new ManifestError(`supabase exited ${result.code}: ${result.stderr.trim().split("\n")[0] ?? ""}`.trim());
}
