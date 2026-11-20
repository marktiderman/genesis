/**
 * The built-in `settings` check: genesis.config.json's `preset` and `settings` (and, with
 * `--database` or a linked project, the database layer) against the settings catalogue the
 * installed Genesis packages declare (package.json `genesis.settings`, the shape `defineSettings`
 * takes, read without running the package), then the setup and the secrets that catalogue needs.
 *
 * - `invalid-setting` **error**: a setting no installed package declares, a value that doesn't fit
 *   its key's type or bounds (resolveSettings would skip it at runtime, so the app would silently
 *   run on the layer below), a locked or out-of-scope database row, a package's declaration that
 *   can't be used, or two packages declaring the same key. **info**: the database layer couldn't be read.
 * - `setting-requires` **warn**: a key that is on while a key it requires is off.
 * - `setup-incomplete` **info**: a key with a setup step or a secret it needs that isn't set yet
 *   (the feature stays dormant; the finding names `genesis setup --step <id>`). Nothing fails.
 * - `secret-missing` **warn**: a secret an on key (`needs`) or a deployed Edge Function
 *   (`functions[].secrets`) reads isn't in its store; checked by name only through the
 *   developer's CLIs (src/exec/secret-stores.ts), only when the network is on. **info**: a store
 *   that couldn't be checked (a tool missing or signed out, the app not linked, a server's environment).
 *
 * The file's shape (a `namespace.key`, a boolean lock, a known preset) is checked when the config
 * is read, so a malformed file stops every command, not only the doctor.
 *
 * `genesis-config-unknown-key` (warn): a top-level key in genesis.config.json no Genesis tool reads
 * (`presets`, `setting`), which would otherwise do nothing, silently.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  SettingsError,
  resolveSettings,
  settingsCatalogue,
  settingsFromManifest,
  settingsLayerFromFile,
  settingsLayerFromRows,
  type SettingsCatalogue,
  type SettingsLayerValues,
  type ResolvedSettings,
  type SettingsDeclaration,
} from "@marktiderman/genesis-config/settings";
import { readGenesisConfig } from "./config.js";
import { installedGenesis } from "../blocks/discover.js";
import { GENESIS_PACKAGE, rawBlocksOf } from "../blocks/manifest.js";
import { runTool, TOOL_AUTH_ENV, type ToolRunner } from "../exec/run.js";
import { readSecretNames, storeOptions, supabaseLinked, targetsOf, TARGET_LABEL, type SecretStore, type SecretTarget } from "../exec/secret-stores.js";
import type { DoctorContext } from "./types.js";

const FILE = "genesis.config.json";

/**
 * Every top-level key a Genesis tool reads from genesis.config.json. Kept by hand: nothing derives
 * it from the config schema or the blocks, so a block or tool that adds a top-level key adds it here
 * in the same change (and to the config reader in ./config.ts), or `genesis-config-unknown-key` warns
 * in every app that uses it.
 */
export const GENESIS_CONFIG_KEYS: readonly string[] = [
  "$schema",
  "$comment",
  "appFolder",
  "client",
  "doctor",
  "environments",
  "features",
  "figma",
  "links",
  "localPackages",
  "notifications",
  "preset",
  "privacy",
  "release",
  "settings",
  "starter",
  "supabase",
];

/** The known key closest to a typo (one edit, or a plural/singular), if any. */
function nearestKey(key: string): string | undefined {
  const k = key.toLowerCase();
  return GENESIS_CONFIG_KEYS.find((known) => {
    const c = known.toLowerCase();
    if (k === `${c}s` || `${k}s` === c) return true;
    if (Math.abs(c.length - k.length) > 1) return false;
    let i = 0;
    while (i < Math.min(c.length, k.length) && c[i] === k[i]) i++;
    return c.slice(i + 1) === k.slice(i + 1) || c.slice(i) === k.slice(i + 1) || c.slice(i + 1) === k.slice(i);
  });
}

/** Top-level keys of genesis.config.json that no Genesis tool reads. */
export function checkConfigKeys(ctx: DoctorContext): void {
  const raw = readGenesisConfig(ctx.root)?.raw;
  if (!raw) return;
  for (const key of Object.keys(raw)) {
    if (GENESIS_CONFIG_KEYS.includes(key)) continue;
    const near = nearestKey(key);
    ctx.report({
      rule: "genesis-config-unknown-key",
      level: "warn",
      file: FILE,
      subject: key,
      message: `"${key}" isn't a genesis.config.json setting, so nothing reads it${near ? `: did you mean "${near}", or` : ` (known: ${GENESIS_CONFIG_KEYS.filter((k) => !k.startsWith("$")).join(", ")}); or`} upgrade @marktiderman/genesis-cli if this is a newer key`,
    });
  }
}

/**
 * The settings declarations (package.json `genesis.settings`: one, or a list) of every Genesis
 * package installed for the app, direct or transitive, as Node would find them from `root`.
 */
export function installedSettings(root: string): { declarations: SettingsDeclaration[]; problems: Array<{ pkg: string; message: string }> } {
  const declarations: SettingsDeclaration[] = [];
  const problems: Array<{ pkg: string; message: string }> = [];
  for (const [name, dir] of [...installedGenesis(root)].sort(([a], [b]) => a.localeCompare(b))) {
    let raw: unknown;
    try {
      raw = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { genesis?: { settings?: unknown } }).genesis?.settings;
    } catch (err) {
      problems.push({ pkg: name, message: `its package.json can't be read: ${(err as Error).message}` });
      continue;
    }
    if (raw === undefined) continue;
    for (const [i, one] of (Array.isArray(raw) ? raw : [raw]).entries()) {
      try {
        declarations.push(settingsFromManifest(one, `${name} genesis.settings${Array.isArray(raw) ? `[${i}]` : ""}`));
      } catch (err) {
        problems.push({ pkg: name, message: (err as Error).message });
      }
    }
  }
  return { declarations, problems };
}

export interface SettingsCheckOptions {
  /**
   * Ask the developer's signed-in CLIs which secrets are set (`supabase secrets list`, `gh secret
   * list`, `eas env:list`, Vault names), and read the database layer. Default false: the CLI turns
   * it on (not with `--offline`); the Vite plugin and tests leave it off.
   */
  network?: boolean;
  /** The database layer: true reads it (`--database`), false never; left out, read when the app is linked (and `network`). */
  database?: boolean;
  /** Runs supabase, gh and eas (tests pass a stub). Default src/exec/run.ts. */
  run?: ToolRunner;
}

/** One secret the app needs, by name, where it lives, and what needs it. */
export interface NeededSecret {
  name: string;
  store: SecretStore;
  /** `settings.support.githubRepo`, `function genesis-support-notify`. */
  from: string[];
}

const DATABASE_FILE = "genesis_settings";
const SETTINGS_SQL = "select key, value, locked from public.genesis_settings order by key;\n";

/** The database layer through the linked project (`supabase db query --linked`), or why it couldn't be read. */
export async function readDatabaseLayer(root: string, run: ToolRunner = runTool): Promise<{ ok: true; layer: SettingsLayerValues } | { ok: false; reason: string }> {
  let result;
  try {
    result = await run("supabase", ["db", "query", "--linked", "-o", "json", "-f", "/dev/stdin"], { cwd: root, stdin: SETTINGS_SQL, timeoutMs: 30_000, passEnv: TOOL_AUTH_ENV["supabase"] ?? [] });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  if (result.code !== 0) return { ok: false, reason: `supabase exited ${result.code}: ${result.stderr.trim().split("\n")[0] ?? ""}`.trim() };
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown[] } | null)?.rows;
    if (!Array.isArray(rows)) throw new Error("no rows");
    return {
      ok: true,
      layer: settingsLayerFromRows(
        rows.flatMap((r) => {
          const row = r as { key?: unknown; value?: unknown; locked?: unknown };
          if (typeof row.key !== "string") return [];
          let value = row.value;
          // jsonb may come back as its text.
          if (typeof value === "string") {
            try {
              value = JSON.parse(value);
            } catch {
              /* a plain string */
            }
          }
          return [{ key: row.key, value, locked: row.locked === true || row.locked === "t" || row.locked === "true" }];
        }),
      ),
    };
  } catch {
    return { ok: false, reason: "supabase's output couldn't be read" };
  }
}

const FUNCTION_SECRET = /^[A-Z][A-Z0-9_]*$/;

/**
 * The secrets the deployed Edge Functions read: each installed Genesis package's block manifests
 * (package.json `genesis.blocks.*.functions[].secrets`), for the functions the app has in
 * supabase/functions/<name>/.
 */
export function functionSecrets(root: string): Array<{ fn: string; secrets: string[] }> {
  const out = new Map<string, Set<string>>();
  for (const [, dir] of [...installedGenesis(root)].sort(([a], [b]) => a.localeCompare(b))) {
    let blocks: Record<string, unknown>;
    try {
      blocks = rawBlocksOf(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")));
    } catch {
      continue;
    }
    for (const block of Object.values(blocks)) {
      const fns = (block as { functions?: unknown } | null)?.functions;
      if (!Array.isArray(fns)) continue;
      for (const f of fns as Array<{ dir?: unknown; secrets?: unknown }>) {
        if (typeof f?.dir !== "string" || !Array.isArray(f.secrets)) continue;
        const name = f.dir.split("/").pop() ?? "";
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || !existsSync(path.join(root, "supabase", "functions", name))) continue;
        const set = out.get(name) ?? new Set<string>();
        for (const secret of f.secrets) if (typeof secret === "string" && FUNCTION_SECRET.test(secret)) set.add(secret);
        out.set(name, set);
      }
    }
  }
  return [...out].map(([fn, secrets]) => ({ fn, secrets: [...secrets].sort() }));
}

/**
 * The secrets the app needs now: those of every settings key that is on (`needs`), and those of
 * every deployed function, except a secret only dormant keys declare (a feature not set up yet:
 * `setup-incomplete` says so instead).
 */
export function neededSecrets(root: string, catalogue: SettingsCatalogue, values: { readonly [key: string]: unknown }): NeededSecret[] {
  const byName = new Map<string, NeededSecret>();
  const add = (name: string, store: SecretStore, from: string) => {
    const one = byName.get(`${store}:${name}`) ?? { name, store, from: [] };
    one.from.push(from);
    byName.set(`${store}:${name}`, one);
  };
  const dormant = new Set<string>();
  const on = new Set<string>();
  for (const def of Object.values(catalogue.keys)) {
    if (!def.secret) continue;
    if (isOn(values[def.key])) {
      on.add(def.secret.name);
      add(def.secret.name, def.secret.store, `settings.${def.key}`);
    } else dormant.add(def.secret.name);
  }
  for (const { fn, secrets } of functionSecrets(root)) {
    for (const name of secrets) if (on.has(name) || !dormant.has(name)) add(name, "edge", `function ${fn}`);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name) || a.store.localeCompare(b.store));
}

/** On, as resolveSettings reads it for `requires`: anything but false, null or not set. */
const isOn = (value: unknown) => value !== false && value !== null && value !== undefined;

/** The built-in `settings` check: the catalogue, the layers, setup and secrets. */
export function settingsCheck(options: SettingsCheckOptions = {}): (ctx: DoctorContext) => Promise<void> {
  return async (ctx) => {
    const config = readGenesisConfig(ctx.root);
    const { declarations, problems } = installedSettings(ctx.root);
    for (const p of problems) {
      ctx.report({ rule: "invalid-setting", level: "error", file: "package.json", subject: p.pkg, message: `${p.pkg} declares settings that can't be used: ${p.message}` });
    }
    let catalogue: SettingsCatalogue;
    try {
      catalogue = settingsCatalogue(declarations);
    } catch (err) {
      if (!(err instanceof SettingsError)) throw err;
      ctx.report({ rule: "invalid-setting", level: "error", file: "package.json", subject: "settings catalogue", message: err.message });
      return;
    }
    for (const legacy of config?.legacySettingsKeys ?? []) {
      ctx.report({ rule: "invalid-setting", level: "error", file: FILE, subject: legacy.key, message: legacy.message });
    }
    const run = options.run ?? runTool;

    let database: SettingsLayerValues | undefined;
    const wantDatabase = options.database ?? (options.network === true && supabaseLinked(ctx.root));
    if (wantDatabase && Object.keys(catalogue.keys).length) {
      const read = await readDatabaseLayer(ctx.root, run);
      if (read.ok) database = read.layer;
      else ctx.report({ rule: "invalid-setting", level: "info", file: DATABASE_FILE, message: `the database layer wasn't checked: ${read.reason}` });
    }

    const resolved = resolveSettings(catalogue, { ...(config?.preset ? { preset: config.preset } : {}), file: settingsLayerFromFile(config?.settings), ...(database ? { database } : {}) });
    // An unknown key is certain only when the catalogue is the whole of it; otherwise the finding says why not.
    const state = resolved.problems.some((p) => p.kind === "unknown-key" && p.layer !== "database") ? catalogueCompleteness(ctx.root) : { complete: true as const };
    for (const problem of resolved.problems) {
      const inFile = problem.layer !== "database";
      if (problem.kind === "requires") {
        // Reported where the key was set: the database layer's rows are a platform admin's, everything else the file's.
        ctx.report({ rule: "setting-requires", level: "warn", file: inFile ? FILE : DATABASE_FILE, subject: problem.key, message: `settings.${problem.message} (its value comes from the ${problem.layer} layer)` });
        continue;
      }
      ctx.report({
        rule: "invalid-setting",
        level: "error",
        file: inFile ? FILE : DATABASE_FILE,
        subject: problem.key,
        message:
          problem.kind === "unknown-key" && inFile
            ? `settings.${problem.key}: no installed Genesis package declares this setting (a typo, or a package that isn't installed)${state.complete ? "" : `; not certain: ${state.reason}`}`
            : inFile
              ? `settings.${problem.message}`
              : `${problem.message} (a row in the database layer; a platform admin changes it on the Settings screen)`,
      });
    }

    // A feature that needs an outside service, not set up yet: dormant, with its guided step. Nothing fails.
    for (const def of Object.values(catalogue.keys)) {
      if (!def.setup && !def.secret) continue;
      if (resolved.values[def.key] !== null || !["default", "preset"].includes(resolved.sources[def.key]?.layer ?? "")) continue;
      const how = def.setup ? `genesis setup --step ${def.setup}` : `set settings.${def.key} in ${FILE}${def.secret ? `, and the secret ${def.secret.name}` : ""}`;
      ctx.report({ rule: "setup-incomplete", level: "info", file: FILE, subject: def.key, message: `${def.key} isn't set up yet${def.summary ? ` (${def.summary})` : ""}, so it stays off: ${how}` });
    }

    const needed = neededSecrets(ctx.root, catalogue, resolved.values);
    if (!needed.length || options.network !== true) return;
    const storeOpts = storeOptions(ctx.root);
    const byTarget = new Map<SecretTarget, NeededSecret[]>();
    for (const n of needed) for (const t of targetsOf(n.store, ctx.root)) byTarget.set(t, [...(byTarget.get(t) ?? []), n]);
    for (const [target, secrets] of byTarget) {
      const label = TARGET_LABEL[target];
      const names = secrets.map((s) => s.name);
      const status = await readSecretNames(target, ctx.root, { ...storeOpts, run });
      if (!status.ok) {
        ctx.report({ rule: "secret-missing", level: "info", file: label, message: `${names.join(", ")} not checked: ${status.reason}` });
        continue;
      }
      for (const s of secrets) {
        if (status.names.has(s.name)) continue;
        ctx.report({ rule: "secret-missing", level: "warn", file: label, subject: s.name, message: `${s.name} isn't set in ${label}${target === "github" && storeOpts.githubEnvironment ? ` (environment ${storeOpts.githubEnvironment})` : ""}; ${s.from.join(" and ")} need${s.from.length === 1 ? "s" : ""} it` });
      }
    }
  };
}

/** The `settings` check without the network (the Vite plugin's, and the merge base's). */
export function checkSettings(ctx: DoctorContext): Promise<void> {
  return settingsCheck()(ctx);
}

/** The catalogue and the file layer resolved (no database): what the settings fixes plan from. Null when the catalogue can't be built. */
export function resolveFileSettings(root: string): { catalogue: SettingsCatalogue; resolved: ResolvedSettings; settings: Record<string, unknown> } | null {
  const config = readGenesisConfig(root);
  let catalogue: SettingsCatalogue;
  try {
    catalogue = settingsCatalogue(installedSettings(root).declarations);
  } catch {
    return null;
  }
  const settings = config?.settings ?? {};
  const resolved = resolveSettings(catalogue, { ...(config?.preset ? { preset: config.preset } : {}), file: settingsLayerFromFile(settings) });
  return { catalogue, resolved, settings };
}

/**
 * Whether the installed packages' settings catalogue is the whole of it: node_modules is there,
 * every Genesis package package.json lists is installed, and every declaration was read. Only then
 * can a key be called unknown for sure; otherwise the reason it can't.
 */
export function catalogueCompleteness(root: string): { complete: true } | { complete: false; reason: string } {
  let pkg: Record<string, Record<string, string> | undefined>;
  try {
    pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as typeof pkg;
  } catch {
    return { complete: false, reason: "package.json can't be read" };
  }
  const listed = [...new Set(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((f) => Object.keys(pkg[f] ?? {})))].filter((n) => GENESIS_PACKAGE.test(n));
  const installed = installedGenesis(root);
  const missing = listed.filter((n) => !installed.has(n));
  if (missing.length) return { complete: false, reason: `${missing.join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} installed (run the install)` };
  const { problems, declarations } = installedSettings(root);
  if (problems.length) return { complete: false, reason: `${[...new Set(problems.map((p) => p.pkg))].join(", ")} declare${problems.length === 1 ? "s" : ""} settings that can't be read` };
  try {
    settingsCatalogue(declarations);
  } catch (err) {
    return { complete: false, reason: `the settings catalogue can't be built (${(err as Error).message})` };
  }
  return { complete: true };
}

/** Whether genesis.config.json sets this key with `"locked": true`. */
export function isLockedSetting(root: string, key: string): boolean {
  const v = readGenesisConfig(root)?.settings?.[key] as unknown;
  return typeof v === "object" && v !== null && (v as { locked?: unknown }).locked === true;
}

/**
 * The `settings` keys in genesis.config.json that no installed package declares (what
 * `invalid-setting` reports as unknown), and whether that is certain (the catalogue is complete).
 */
export function unknownSettingKeys(root: string): { keys: string[]; complete: boolean; reason?: string } {
  const config = readGenesisConfig(root);
  if (!config?.settings) return { keys: [], complete: true };
  const state = catalogueCompleteness(root);
  const r = resolveFileSettings(root);
  if (!r) return { keys: [], complete: false, reason: state.complete ? "the settings catalogue can't be built" : state.reason };
  const keys = [...new Set(r.resolved.problems.filter((p) => p.kind === "unknown-key" && p.layer === "file").map((p) => p.key))];
  return state.complete ? { keys, complete: true } : { keys, complete: false, reason: state.reason };
}

/** The `settings` values in genesis.config.json that don't fit their key (what `invalid-setting` reports as a bad value), with why. */
export function badSettingValues(root: string): Array<{ key: string; message: string }> {
  const r = resolveFileSettings(root);
  if (!r) return [];
  return r.resolved.problems.filter((p) => p.kind === "type" && p.layer === "file").map((p) => ({ key: p.key, message: p.message }));
}
