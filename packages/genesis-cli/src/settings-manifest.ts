/**
 * `genesis settings sync`: write the app manifest (genesis-supabase's `genesis_app_manifest`) on
 * deploy. The manifest carries the settings catalogue `set_genesis_setting` checks platform admins'
 * values against; until it is written, every write is refused. The row is what `writeAppManifest`
 * writes from a server: the installed Genesis packages and their versions, the preset, the file's
 * settings and the catalogue, built here from the app's own files.
 *
 * It goes through the linked project (`supabase db query --linked`, or `--project-ref`), as the
 * doctor reads the database layer, so no key is handled here. It names the project and asks before
 * writing (`--yes` skips the question; without a terminal, `--yes` is required). `--print` gives
 * the SQL for a pipeline that runs it its own way (psql with the database URL).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { catalogueManifest, settingsCatalogue, type SettingsCatalogue } from "@marktiderman/genesis-config/settings";
import { installedGenesis } from "./blocks/discover.js";
import { GenesisConfigError, readGenesisConfig } from "./doctor/config.js";
import { installedSettings } from "./doctor/settings.js";
import { runTool, TOOL_AUTH_ENV, type ToolRunner } from "./exec/run.js";

const APP_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;
/** A Supabase project ref: 20 lower-case letters and digits. */
const PROJECT_REF = /^[a-z0-9]{20}$/;

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

/**
 * The manifest row from the app's files. Throws a ManifestError when the config can't be read, its
 * preset isn't one of the presets, or the catalogue can't be built.
 */
export function toManifestRow(root: string, options: { appId?: string } = {}): ManifestRow {
  let config: ReturnType<typeof readGenesisConfig>;
  try {
    config = readGenesisConfig(root);
  } catch (err) {
    if (err instanceof GenesisConfigError) throw new ManifestError(err.message);
    throw err;
  }
  // The doctor reads an invalid preset as max with an error; the manifest would store max as if chosen.
  const badPreset = config?.legacySettingsKeys?.find((l) => l.key === "preset");
  if (badPreset) throw new ManifestError(`genesis.config.json: ${badPreset.message.split(". ")[0]}. Fix it before writing the manifest.`);
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

/** The project `supabase link` recorded for the app, or null. */
export function linkedProjectRef(root: string): string | null {
  try {
    const ref = readFileSync(path.join(root, "supabase", ".temp", "project-ref"), "utf8").trim();
    return PROJECT_REF.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

export interface SyncManifestOptions {
  /** The project to write to (`--project-ref`), else the linked one. */
  projectRef?: string;
  /** Default `process.platform`. On Windows the SQL goes through a temp file: there is no /dev/stdin. */
  platform?: NodeJS.Platform;
}

/** Write the manifest through the linked Supabase project (or `projectRef`). */
export async function syncManifest(root: string, row: ManifestRow, run: ToolRunner = runTool, options: SyncManifestOptions = {}): Promise<void> {
  if (options.projectRef !== undefined && !PROJECT_REF.test(options.projectRef)) throw new ManifestError(`--project-ref ${JSON.stringify(options.projectRef)} isn't a Supabase project ref (20 lower-case letters and digits).`);
  const sql = manifestSql(row);
  // `--yes`: supabase asks before it sends a statement to a hosted database, and reads no piped
  // answer (the default is No). The person already confirmed, or passed --yes, before this runs.
  const target = ["db", "query", "--linked", ...(options.projectRef ? ["--project-ref", options.projectRef] : []), "--yes"];
  const common = { cwd: root, timeoutMs: 60_000, passEnv: TOOL_AUTH_ENV["supabase"] ?? [] };
  let result: Awaited<ReturnType<ToolRunner>>;
  if ((options.platform ?? process.platform) === "win32") {
    const dir = mkdtempSync(path.join(tmpdir(), "genesis-manifest-"));
    try {
      const file = path.join(dir, "manifest.sql");
      writeFileSync(file, sql, { mode: 0o600 });
      result = await run("supabase", [...target, "-f", file], common);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else {
    result = await run("supabase", [...target, "-f", "/dev/stdin"], { ...common, stdin: sql });
  }
  if (result.code !== 0) throw new ManifestError(`supabase exited ${result.code}: ${result.stderr.trim().split("\n")[0] ?? ""}`.trim());
}

export interface SettingsSyncOptions {
  dir: string;
  appId?: string;
  print?: boolean;
  /** Write without asking. Required without a terminal. */
  yes?: boolean;
  projectRef?: string;
}

export interface SettingsSyncIo {
  out: (line: string) => void;
  err: (line: string) => void;
  /** Whether a person is at a terminal to answer. */
  isTTY: boolean;
  confirm?: (question: string) => Promise<boolean>;
  run?: ToolRunner;
  platform?: NodeJS.Platform;
}

/** `genesis settings sync`: the exit code. Names the project and asks before it writes. */
export async function runSettingsSync(options: SettingsSyncOptions, io: SettingsSyncIo): Promise<number> {
  const root = path.resolve(options.dir);
  try {
    const row = toManifestRow(root, options.appId !== undefined ? { appId: options.appId } : {});
    if (options.print) {
      io.out(manifestSql(row));
      return 0;
    }
    if (options.projectRef !== undefined && !PROJECT_REF.test(options.projectRef)) throw new ManifestError(`--project-ref ${JSON.stringify(options.projectRef)} isn't a Supabase project ref (20 lower-case letters and digits).`);
    const linked = linkedProjectRef(root);
    const ref = options.projectRef ?? linked;
    if (!ref) throw new ManifestError("No Supabase project is linked here (supabase/.temp/project-ref): run supabase link, or pass --project-ref.");
    io.out(`The manifest for ${row.app_id} (preset ${row.preset}, ${Object.keys(row.catalogue).length} settings) goes to Supabase project ${ref}${options.projectRef ? "" : " (linked)"}.`);
    if (!options.yes) {
      if (!io.isTTY || !io.confirm) throw new ManifestError("Not at a terminal, so nothing was written: pass --yes to write it without asking.");
      if (!(await io.confirm(`Write it to ${ref}?`))) {
        io.out("Nothing written.");
        return 1;
      }
    }
    await syncManifest(root, row, io.run ?? runTool, { ...(options.projectRef ? { projectRef: options.projectRef } : {}), ...(io.platform ? { platform: io.platform } : {}) });
    io.out(`✔ Wrote the manifest for ${row.app_id}: ${Object.keys(row.packages).length} Genesis packages, ${Object.keys(row.catalogue).length} settings, preset ${row.preset}.`);
    return 0;
  } catch (err) {
    if (!(err instanceof ManifestError)) throw err;
    io.err(`✗ ${err.message}`);
    return 1;
  }
}
