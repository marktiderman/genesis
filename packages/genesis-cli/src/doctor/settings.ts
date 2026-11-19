/**
 * `invalid-setting`: genesis.config.json's `preset` and `settings`, checked against the settings
 * catalogue the installed Genesis packages declare (package.json `genesis.settings`, the same
 * shape `defineSettings` takes, read without running the package).
 *
 * - **error**: a setting no installed package declares, or a value that doesn't fit its key's type
 *   or bounds. resolveSettings would skip it at runtime, so the app would silently run on the layer
 *   below.
 * - **error**: a package's declaration that can't be used, or two packages declaring the same key.
 * - **warn**: a key that is on while a key it requires is off.
 *
 * The file's shape (a `namespace.key`, a boolean lock, a known preset) is checked when the config
 * is read, so a malformed file stops every command, not only the doctor.
 *
 * `genesis-config-unknown-key` (warn): a top-level key in genesis.config.json no Genesis tool reads
 * (`presets`, `setting`), which would otherwise do nothing, silently.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  SettingsError,
  resolveSettings,
  settingsCatalogue,
  settingsFromManifest,
  settingsLayerFromFile,
  type SettingsCatalogue,
  type SettingsDeclaration,
} from "@marktiderman/genesis-config/settings";
import { readGenesisConfig } from "./config.js";
import { installedGenesis } from "../blocks/discover.js";
import { GENESIS_PACKAGE } from "../blocks/manifest.js";
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
      message: `"${key}" isn't a genesis.config.json setting, so nothing reads it${near ? `: did you mean "${near}"?` : ` (known: ${GENESIS_CONFIG_KEYS.filter((k) => !k.startsWith("$")).join(", ")})`}; or upgrade @marktiderman/genesis-cli if this is a newer key`,
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

export function checkSettings(ctx: DoctorContext): void {
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
  if (!config?.settings && !config?.preset) return;
  const resolved = resolveSettings(catalogue, { ...(config.preset ? { preset: config.preset } : {}), file: settingsLayerFromFile(config.settings) });
  const state = resolved.problems.some((p) => p.kind === "unknown-key") ? catalogueCompleteness(ctx.root) : { complete: true as const };
  for (const problem of resolved.problems) {
    const unknown = problem.kind === "unknown-key";
    ctx.report({
      rule: "invalid-setting",
      level: problem.kind === "requires" ? "warn" : "error",
      file: FILE,
      subject: problem.key,
      message: unknown
        ? `settings.${problem.key}: no installed Genesis package declares this setting (a typo, or a package that isn't installed)${state.complete ? "" : `; not certain: ${state.reason}`}`
        : `settings.${problem.message}`,
    });
  }
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
  let catalogue: SettingsCatalogue;
  try {
    catalogue = settingsCatalogue(installedSettings(root).declarations);
  } catch {
    return { keys: [], complete: false, reason: state.complete ? "the settings catalogue can't be built" : state.reason };
  }
  const resolved = resolveSettings(catalogue, { ...(config.preset ? { preset: config.preset } : {}), file: settingsLayerFromFile(config.settings) });
  const keys = [...new Set(resolved.problems.filter((p) => p.kind === "unknown-key").map((p) => p.key))];
  return state.complete ? { keys, complete: true } : { keys, complete: false, reason: state.reason };
}
