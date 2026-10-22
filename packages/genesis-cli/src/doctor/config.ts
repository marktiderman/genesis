/**
 * Finds and validates the doctor's config.
 *
 * Lookup order: `--config <path>`, then `genesis.config.json` in the app
 * root, then the `genesis` key of package.json. Either file holds the
 * settings under `doctor`, leaving room for other commands' settings.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { DoctorConfig } from "./types.js";

export class DoctorConfigError extends Error {
  override name = "DoctorConfigError";
}

export interface LoadedConfig {
  config: DoctorConfig;
  /** The file it came from, or null when no config exists (defaults apply). */
  file: string | null;
  /** Folder that relative plugin paths resolve against. */
  dir: string;
}

const STRING_LISTS = ["src", "extensions", "ignore", "tokenFiles", "ignoreTokenPrefixes", "localPrimitiveDirs", "build"] as const;
const STRINGS = ["uiPackage", "rulesDoc"] as const;
const KNOWN = new Set<string>([
  ...STRING_LISTS,
  ...STRINGS,
  "themeCss",
  "rawTags",
  "forbiddenImports",
  "rules",
  "allow",
  "patterns",
  "plugins",
  "$schema",
  "$comment",
]);
const LEVELS = new Set(["error", "warn", "off"]);
const PATTERN_KEYS = new Set(["id", "level", "files", "exclude", "forbid", "require", "path", "message"]);

export function loadConfig(root: string, configPath?: string): LoadedConfig {
  if (configPath) {
    const file = path.resolve(root, configPath);
    if (!existsSync(file)) throw new DoctorConfigError(`Config file not found: ${configPath}`);
    const json = readJson(file);
    // An explicit file may hold the block at the top level or under `doctor`
    // (or, for a package.json, under `genesis.doctor`).
    const block = path.basename(file) === "package.json" ? json?.genesis?.doctor : json?.doctor ?? json;
    return { config: validateConfig(block ?? {}, file), file, dir: path.dirname(file) };
  }
  const own = path.join(root, "genesis.config.json");
  if (existsSync(own)) {
    return { config: validateConfig(readJson(own)?.doctor ?? {}, own), file: own, dir: root };
  }
  const pkg = path.join(root, "package.json");
  if (existsSync(pkg)) {
    const block = readJson(pkg)?.genesis?.doctor;
    if (block !== undefined) return { config: validateConfig(block, pkg), file: pkg, dir: root };
  }
  return { config: {}, file: null, dir: root };
}

function readJson(file: string) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new DoctorConfigError(`${file} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Check the shape, so a typo fails loudly instead of silently disabling a check. */
export function validateConfig(raw: unknown, source = "config"): DoctorConfig {
  const fail = (msg: string): never => {
    throw new DoctorConfigError(`${source}: ${msg}`);
  };
  if (!isObject(raw)) fail("the doctor settings must be an object");
  const c = raw as Record<string, unknown>;
  for (const key of Object.keys(c)) if (!KNOWN.has(key)) fail(`unknown setting "${key}"`);
  // themeCss takes one stylesheet or several; normalize to a list.
  if (typeof c.themeCss === "string") c.themeCss = [c.themeCss];
  if (c.themeCss !== undefined && !isStringList(c.themeCss)) fail(`"themeCss" must be a path or a list of paths`);
  for (const key of STRING_LISTS) {
    if (c[key] !== undefined && !isStringList(c[key])) fail(`"${key}" must be a list of strings`);
  }
  for (const key of STRINGS) {
    if (c[key] !== undefined && typeof c[key] !== "string") fail(`"${key}" must be a string`);
  }
  if (c.rawTags !== undefined) {
    if (!isObject(c.rawTags)) fail(`"rawTags" must be an object`);
    for (const [tag, v] of Object.entries(c.rawTags as object)) {
      if (!/^[a-z][a-z0-9-]*$/.test(tag)) fail(`rawTags: "${tag}" is not an HTML tag name`);
      if (v !== false && typeof v !== "string") fail(`rawTags.${tag} must be a component name or false`);
    }
  }
  if (c.forbiddenImports !== undefined) {
    if (!isObject(c.forbiddenImports)) fail(`"forbiddenImports" must be an object of pattern → message`);
    for (const [re, msg] of Object.entries(c.forbiddenImports as object)) {
      if (typeof msg !== "string") fail(`forbiddenImports["${re}"] must be a message string`);
      checkRegExp(re, `forbiddenImports["${re}"]`, fail);
    }
  }
  if (c.rules !== undefined) {
    if (!isObject(c.rules)) fail(`"rules" must be an object of rule → level`);
    for (const [rule, level] of Object.entries(c.rules as object)) {
      if (!LEVELS.has(level as string)) fail(`rules.${rule} must be "error", "warn" or "off"`);
    }
  }
  if (c.allow !== undefined) {
    if (!Array.isArray(c.allow)) fail(`"allow" must be a list`);
    (c.allow as unknown[]).forEach((e, i) => {
      if (!isObject(e)) return fail(`allow[${i}] must be an object`);
      const entry = e as Record<string, unknown>;
      if (typeof entry.rule !== "string" || !entry.rule) fail(`allow[${i}] needs a "rule"`);
      if (typeof entry.reason !== "string" || !entry.reason.trim()) fail(`allow[${i}] (${entry.rule}) needs a "reason"`);
      for (const k of ["file", "match"]) {
        if (entry[k] !== undefined && typeof entry[k] !== "string") fail(`allow[${i}].${k} must be a string`);
      }
    });
  }
  if (c.patterns !== undefined) {
    if (!Array.isArray(c.patterns)) fail(`"patterns" must be a list`);
    (c.patterns as unknown[]).forEach((p, i) => {
      if (!isObject(p)) return fail(`patterns[${i}] must be an object`);
      const rule = p as Record<string, unknown>;
      for (const k of Object.keys(rule)) if (!PATTERN_KEYS.has(k)) fail(`patterns[${i}]: unknown key "${k}"`);
      if (typeof rule.id !== "string" || !rule.id) fail(`patterns[${i}] needs an "id"`);
      for (const k of ["files", "exclude"]) {
        if (rule[k] !== undefined && !isStringList(rule[k])) fail(`patterns[${i}].${k} must be a list of globs`);
      }
    });
  }
  if (c.plugins !== undefined) {
    const ok =
      Array.isArray(c.plugins) &&
      c.plugins.every((p) => typeof p === "string" || (Array.isArray(p) && p.length === 2 && typeof p[0] === "string"));
    if (!ok) fail(`"plugins" must be a list of module paths or [path, options] pairs`);
  }
  return c as DoctorConfig;
}

export function checkRegExp(source: string, where: string, fail: (msg: string) => never): void {
  try {
    new RegExp(source);
  } catch (err) {
    fail(`${where} is not a valid regular expression: ${(err as Error).message}`);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
