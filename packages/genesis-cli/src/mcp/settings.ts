/**
 * The settings side of `genesis mcp`: the catalogue the installed packages declare, the values
 * genesis.config.json resolves to (with where each came from), the secrets they need by name and
 * whether each is set, and a proposed change as a plan.
 *
 * A setting never holds a secret: a key that needs one names it (`needs: "secret:NAME"`). This
 * module reports that name and a status, never a value, and reads no `.env` file.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  isLockedEntry,
  resolveSettings,
  settingsCatalogue,
  settingsFromManifest,
  settingsLayerFromFile,
  settingsSecrets,
  settingValueProblem,
  SETTING_KEY,
  type SettingDef,
  type SettingsCatalogue,
  type SettingsDeclaration,
  type SecretStore,
} from "@marktiderman/genesis-config/settings";
import { installedGenesis } from "../blocks/discover.js";
import { readGenesisConfig } from "../doctor/config.js";
import { canonicalJson, plannedFile } from "../fix/engine.js";
import type { Fix, FixPlanDraft } from "../fix/types.js";

export const CONFIG_FILE = "genesis.config.json";

/** Whether a secret is set where it is kept. `unknown`: this server can't see that store. */
export type SecretStatus = "set" | "missing" | "unknown";

/** Says whether each secret is set, by name. Never returns or logs a value. */
export type SecretStatusReader = (secrets: ReadonlyArray<{ name: string; store: SecretStore }>) => Promise<Record<string, SecretStatus>> | Record<string, SecretStatus>;

/**
 * The default reader: a `server-env` secret is set when the server's own environment has it (the
 * value is never read past "is it there"); the other stores (edge, vault, ci) live elsewhere, so
 * their status is `unknown` here. The doctor's secret checks (which list the stores by name) can
 * replace it.
 */
export const envSecretStatus =
  (env: Readonly<Record<string, string | undefined>> = process.env): SecretStatusReader =>
  (secrets) =>
    Object.fromEntries(secrets.map((s) => [s.name, s.store === "server-env" ? (env[s.name] ? "set" : "missing") : "unknown"]));

/** One installed package's settings declaration, with the package it came from. */
export interface PackageSettings {
  package: string;
  declaration: SettingsDeclaration;
}

/** Every installed Genesis package's settings declarations (package.json `genesis.settings`), and what couldn't be read. */
export function packageSettings(root: string): { declared: PackageSettings[]; problems: Array<{ package: string; message: string }> } {
  const declared: PackageSettings[] = [];
  const problems: Array<{ package: string; message: string }> = [];
  for (const [name, dir] of [...installedGenesis(root)].sort(([a], [b]) => a.localeCompare(b))) {
    let raw: unknown;
    try {
      raw = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { genesis?: { settings?: unknown } }).genesis?.settings;
    } catch (err) {
      problems.push({ package: name, message: `its package.json can't be read: ${(err as Error).message}` });
      continue;
    }
    if (raw === undefined) continue;
    for (const [i, one] of (Array.isArray(raw) ? raw : [raw]).entries()) {
      try {
        declared.push({ package: name, declaration: settingsFromManifest(one, `${name} genesis.settings${Array.isArray(raw) ? `[${i}]` : ""}`) });
      } catch (err) {
        problems.push({ package: name, message: (err as Error).message });
      }
    }
  }
  return { declared, problems };
}

/** The catalogue of every installed package's keys; a catalogue that can't be built throws (SettingsError). */
export function loadCatalogue(root: string): { catalogue: SettingsCatalogue; declared: PackageSettings[]; problems: Array<{ package: string; message: string }> } {
  const { declared, problems } = packageSettings(root);
  return { catalogue: settingsCatalogue(declared.map((d) => d.declaration)), declared, problems };
}

/** The settings catalogue doesn't load, so the secrets it declares aren't known. */
export class CatalogueError extends Error {
  override name = "CatalogueError";
}

/** The secret names every settings declaration that could be read names, whether or not they make a catalogue. */
export function readableSecretNames(root: string): string[] {
  return packageSettings(root).declared.flatMap((d) => Object.values(d.declaration.keys).flatMap((k) => (k.secret ? [k.secret.name] : [])));
}

/**
 * The secret names the catalogue declares, so their values are redacted. A catalogue that can't be
 * built is a CatalogueError that says so: without it genesis mcp can't tell which values to redact.
 */
export function declaredSecretNames(root: string): string[] {
  let catalogue: SettingsCatalogue;
  try {
    catalogue = loadCatalogue(root).catalogue;
  } catch (err) {
    throw new CatalogueError(`The settings catalogue doesn't load, so genesis mcp can't tell which environment values are secrets, and answers nothing but doctor_run and doctor_explain until it does: ${err instanceof Error ? err.message : String(err)} (genesis doctor at a terminal shows it)`);
  }
  return Object.values(catalogue.keys).flatMap((d) => (d.secret ? [d.secret.name] : []));
}

const hasKey = (catalogue: SettingsCatalogue, key: string) => Object.prototype.hasOwnProperty.call(catalogue.keys, key);

/** One key as the catalogue tool shows it: its declaration, a secret by name only. */
export function describeKey(def: SettingDef, pkg?: string) {
  return {
    key: def.key,
    ...(pkg ? { package: pkg } : {}),
    type: def.type,
    ...(def.summary ? { summary: def.summary } : {}),
    defaults: def.byPreset ? def.defaults : def.defaults.max,
    ...(def.nullable ? { nullable: true } : {}),
    scope: def.scope,
    applies: def.applies,
    ...(def.requires.length ? { requires: def.requires } : {}),
    ...(def.min !== undefined ? { min: def.min } : {}),
    ...(def.max !== undefined ? { max: def.max } : {}),
    ...(def.options ? { options: def.options } : {}),
    ...(def.secret ? { needsSecret: { name: def.secret.name, store: def.secret.store } } : {}),
    ...(def.feature ? { feature: def.feature } : {}),
    ...(def.flag ? { flag: def.flag } : {}),
  };
}

/** The app's file layer and preset, as genesis.config.json has them. */
export function fileLayers(root: string) {
  const config = readGenesisConfig(root);
  return { ...(config?.preset ? { preset: config.preset } : {}), file: settingsLayerFromFile(config?.settings) };
}

/** The resolved values of `keys` (all of them without), each with its source, plus the secrets they need and their status. */
export async function settingsValues(root: string, keys: readonly string[] | undefined, readStatus: SecretStatusReader) {
  const { catalogue, problems: declarationProblems } = loadCatalogue(root);
  const resolved = resolveSettings(catalogue, fileLayers(root));
  const wanted = keys?.length ? keys : Object.keys(catalogue.keys).sort();
  const unknown = wanted.filter((k) => !hasKey(catalogue, k));
  const known = wanted.filter((k) => hasKey(catalogue, k));
  const secrets = settingsSecrets(catalogue).filter((s) => known.includes(s.key));
  const byName = new Map<string, { name: string; store: SecretStore; keys: string[] }>();
  for (const s of secrets) {
    const entry = byName.get(s.name) ?? { name: s.name, store: s.store, keys: [] };
    entry.keys.push(s.key);
    byName.set(s.name, entry);
  }
  const status = byName.size ? await readStatus([...byName.values()].map(({ name, store }) => ({ name, store }))) : {};
  return {
    preset: resolved.preset,
    values: known.map((key) => ({
      key,
      value: resolved.values[key] ?? null,
      source: resolved.sources[key] ?? { layer: "default" },
      ...(catalogue.keys[key]!.summary ? { summary: catalogue.keys[key]!.summary } : {}),
    })),
    ...(unknown.length ? { unknownKeys: unknown } : {}),
    problems: resolved.problems.filter((p) => !keys?.length || keys.includes(p.key)).map((p) => ({ kind: p.kind, key: p.key, layer: p.layer, message: p.message })),
    // By name only. `set`/`missing` is all this ever says about a value.
    secrets: [...byName.values()].map((s) => ({ name: s.name, store: s.store, keys: s.keys, status: status[s.name] === "set" || status[s.name] === "missing" ? status[s.name] : "unknown" })),
    ...(declarationProblems.length ? { declarationProblems } : {}),
  };
}

export class ProposalError extends Error {
  override name = "ProposalError";
}

/** The id fix_apply uses for a proposed settings change. */
export const SETTINGS_PROPOSE_ID = "settings.propose";

/** The most a proposed value may weigh, as JSON. */
const MAX_VALUE_JSON = 10_000;

/** Checks a proposal against the catalogue: a declared key, and a value that fits it. Throws ProposalError. */
export function checkProposal(catalogue: SettingsCatalogue, key: string, value: unknown): SettingDef {
  if (typeof key !== "string" || !SETTING_KEY.test(key)) throw new ProposalError(`"${key}" isn't a setting key (namespace.key)`);
  if (!hasKey(catalogue, key)) throw new ProposalError(`no installed Genesis package declares ${key} (settings_catalogue lists the keys)`);
  const def = catalogue.keys[key]!;
  if (value === undefined) throw new ProposalError(`${key} needs a value`);
  if (canonicalJson(value).length > MAX_VALUE_JSON) throw new ProposalError(`the value for ${key} is over ${MAX_VALUE_JSON} characters as JSON`);
  const problem = settingValueProblem({ type: def.type, ...(def.min !== undefined ? { min: def.min } : {}), ...(def.max !== undefined ? { max: def.max } : {}), ...(def.options ? { options: def.options } : {}), nullable: def.nullable }, value);
  if (problem) throw new ProposalError(`${key} ${problem}`);
  // The file reads exactly { value, locked } as a lock, so an object of that shape can't be a value.
  if (isLockedEntry(value)) throw new ProposalError(`${key}: an object of exactly { value, locked } reads as a lock in ${CONFIG_FILE}; propose the value itself`);
  return def;
}

/**
 * A proposed change to one setting as a fix: its plan writes genesis.config.json with the key set
 * (a locked entry stays locked), keeping the file's indentation. Applied like any fix, through
 * fix_apply, after the person approves it.
 */
export function settingsProposalFix(key: string, value: unknown, locked?: boolean): Fix {
  return {
    id: SETTINGS_PROPOSE_ID,
    kind: "auto",
    rules: ["invalid-setting"],
    title: `set settings.${key} in ${CONFIG_FILE}`,
    plan(ctx): FixPlanDraft {
      const { catalogue } = loadCatalogue(ctx.root);
      checkProposal(catalogue, key, value);
      const abs = path.join(ctx.root, CONFIG_FILE);
      const raw = existsSync(abs) ? readFileSync(abs, "utf8") : null;
      let json: Record<string, unknown> = {};
      if (raw !== null) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          throw new ProposalError(`${CONFIG_FILE} isn't valid JSON (${(err as Error).message}); fix it first`);
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProposalError(`${CONFIG_FILE} isn't a JSON object`);
        json = parsed as Record<string, unknown>;
      }
      const settings = json.settings ?? {};
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new ProposalError(`${CONFIG_FILE} "settings" isn't an object`);
      const current = (settings as Record<string, unknown>)[key];
      // `locked` left out keeps the key's lock as it is; true or false sets it.
      const wasLocked = isLockedEntry(current) && current.locked === true;
      const lock = locked ?? wasLocked;
      // Left out, an entry written as { value, locked } keeps that shape (an explicit `locked: false` included).
      const entry = locked === undefined && isLockedEntry(current) ? { value, locked: current.locked } : lock ? { value, locked: true } : value;
      const before = isLockedEntry(current) ? current.value : current;
      if (current !== undefined && canonicalJson(before) === canonicalJson(value) && lock === wasLocked) {
        return { summary: `settings.${key} is already ${clipJson(value)}${lock ? " (locked)" : ""} in ${CONFIG_FILE}` };
      }
      // In place when the key is there, so the file's order stays.
      const next: Record<string, unknown> = { ...(settings as Record<string, unknown>) };
      next[key] = entry;
      json = { ...json, settings: next };
      const indent = raw === null ? "  " : (/^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ");
      const content = `${JSON.stringify(json, null, indent)}${raw === null || raw.endsWith("\n") ? "\n" : ""}`;
      // What the change leaves to do: a key it needs that is off.
      const after = resolveSettings(catalogue, { ...(typeof json.preset === "string" ? { preset: json.preset as never } : {}), file: settingsLayerFromFile(next) });
      const needs = after.problems.filter((p) => p.key === key).map((p) => p.message);
      return {
        summary: `${raw === null ? "creates" : "writes"} ${CONFIG_FILE}: settings.${key} ${current === undefined ? "set to" : `from ${clipJson(before)} to`} ${clipJson(value)}${lock && wasLocked ? " (stays locked)" : lock ? ", locked" : wasLocked ? ", unlocked" : ""}`,
        files: [plannedFile(ctx.root, CONFIG_FILE, content, `the proposed value of ${key}`)],
        ...(needs.length ? { manual: needs.join("\n") } : {}),
      };
    },
    verify(ctx) {
      const { catalogue } = loadCatalogue(ctx.root);
      const resolved = resolveSettings(catalogue, fileLayers(ctx.root));
      const problem = resolved.problems.find((p) => p.key === key && p.kind !== "requires");
      if (problem) return { ok: false, message: problem.message };
      const lockedHere = (() => {
        const entry = (readGenesisConfig(ctx.root)?.settings ?? {})[key];
        return isLockedEntry(entry) && entry.locked === true;
      })();
      if (locked !== undefined && lockedHere !== locked) return { ok: false, message: `settings.${key} is ${lockedHere ? "locked" : "not locked"} in ${CONFIG_FILE}` };
      const ok = canonicalJson(resolved.values[key]) === canonicalJson(value) || resolved.sources[key]?.lockedBy !== undefined;
      return ok ? { ok: true } : { ok: false, message: `settings.${key} resolves to ${clipJson(resolved.values[key])}` };
    },
  };
}

function clipJson(value: unknown): string {
  const text = JSON.stringify(value) ?? "null";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
