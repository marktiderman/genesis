/**
 * Finds and validates the app's genesis.config.json.
 *
 * The doctor's lookup order: `--config <path>`, then `genesis.config.json`
 * in the app root, then the `genesis` key of package.json. Either file holds
 * the settings under `doctor`, beside other blocks: `features` (read by
 * `genesis features`) and `links` (validated here, read by the Expo config
 * plugin).
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { DoctorConfig } from "./types.js";

/** A genesis.config.json that can't be read or has a block of the wrong shape. */
export class GenesisConfigError extends Error {
  override name = "GenesisConfigError";
}

export class DoctorConfigError extends GenesisConfigError {
  override name = "DoctorConfigError";
}

/** The `links` block: the web hosts (and optional path prefixes) the app opens as universal / app links. */
export interface GenesisLinks {
  /** Bare host names, such as `example.com` or `app.example.com`: no scheme, path or port. */
  hosts: string[];
  /** Path prefixes the app handles, each starting with `/`. Default: every path. */
  paths?: string[];
  /** Also add `webcredentials:` domains (password autofill). Default true. */
  webcredentials?: boolean;
}

/**
 * Apple's collected data types (`NSPrivacyCollectedDataType`), every one in
 * Apple's reference, keyed by the stores' own words, lower case, as Genesis
 * blocks name them in `privacy.collects`. Look one up with
 * {@link privacyDataType}, which ignores case (blocks write `"device ID"`,
 * `"user ID"`). The values are Apple's exact strings, `PhotosorVideos`
 * included.
 */
export const PRIVACY_DATA_TYPES: Readonly<Record<string, string>> = {
  name: "NSPrivacyCollectedDataTypeName",
  "email address": "NSPrivacyCollectedDataTypeEmailAddress",
  "phone number": "NSPrivacyCollectedDataTypePhoneNumber",
  "physical address": "NSPrivacyCollectedDataTypePhysicalAddress",
  "other user contact info": "NSPrivacyCollectedDataTypeOtherUserContactInfo",
  health: "NSPrivacyCollectedDataTypeHealth",
  fitness: "NSPrivacyCollectedDataTypeFitness",
  "payment info": "NSPrivacyCollectedDataTypePaymentInfo",
  "credit info": "NSPrivacyCollectedDataTypeCreditInfo",
  "other financial info": "NSPrivacyCollectedDataTypeOtherFinancialInfo",
  "precise location": "NSPrivacyCollectedDataTypePreciseLocation",
  "coarse location": "NSPrivacyCollectedDataTypeCoarseLocation",
  "sensitive info": "NSPrivacyCollectedDataTypeSensitiveInfo",
  contacts: "NSPrivacyCollectedDataTypeContacts",
  "emails or text messages": "NSPrivacyCollectedDataTypeEmailsOrTextMessages",
  "photos or videos": "NSPrivacyCollectedDataTypePhotosorVideos",
  "audio data": "NSPrivacyCollectedDataTypeAudioData",
  "gameplay content": "NSPrivacyCollectedDataTypeGameplayContent",
  "customer support": "NSPrivacyCollectedDataTypeCustomerSupport",
  "other user content": "NSPrivacyCollectedDataTypeOtherUserContent",
  "browsing history": "NSPrivacyCollectedDataTypeBrowsingHistory",
  "search history": "NSPrivacyCollectedDataTypeSearchHistory",
  "user id": "NSPrivacyCollectedDataTypeUserID",
  "device id": "NSPrivacyCollectedDataTypeDeviceID",
  "purchase history": "NSPrivacyCollectedDataTypePurchaseHistory",
  "product interaction": "NSPrivacyCollectedDataTypeProductInteraction",
  "advertising data": "NSPrivacyCollectedDataTypeAdvertisingData",
  "other usage data": "NSPrivacyCollectedDataTypeOtherUsageData",
  "crash data": "NSPrivacyCollectedDataTypeCrashData",
  "performance data": "NSPrivacyCollectedDataTypePerformanceData",
  "other diagnostic data": "NSPrivacyCollectedDataTypeOtherDiagnosticData",
  "environment scanning": "NSPrivacyCollectedDataTypeEnvironmentScanning",
  hands: "NSPrivacyCollectedDataTypeHands",
  head: "NSPrivacyCollectedDataTypeHead",
  "other data types": "NSPrivacyCollectedDataTypeOtherDataTypes",
};

/** Apple's string for a data type in the stores' words, whatever its case, or undefined. */
export function privacyDataType(type: string): string | undefined {
  return PRIVACY_DATA_TYPES[type.toLowerCase()];
}

/** Apple's collection purposes (`NSPrivacyCollectedDataTypePurposes`), by the stores' words. */
export const PRIVACY_PURPOSES: Readonly<Record<string, string>> = {
  "app functionality": "NSPrivacyCollectedDataTypePurposeAppFunctionality",
  analytics: "NSPrivacyCollectedDataTypePurposeAnalytics",
  "product personalization": "NSPrivacyCollectedDataTypePurposeProductPersonalization",
  "developer advertising": "NSPrivacyCollectedDataTypePurposeDeveloperAdvertising",
  "third-party advertising": "NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising",
  other: "NSPrivacyCollectedDataTypePurposeOther",
};

/** One kind of data the app collects, as a Genesis block's `privacy.collects` entry says it. */
export interface GenesisDataUse {
  /** A key of {@link PRIVACY_DATA_TYPES}: `"email address"`, `"user id"`, `"crash data"`… */
  type: string;
  /** Keys of {@link PRIVACY_PURPOSES}: `"app functionality"`, `"analytics"`… */
  purposes: string[];
  /** Tied to the person's identity. */
  linked: boolean;
  /** Used to track the person across other companies' apps and websites. */
  tracking: boolean;
}

/**
 * The `privacy` block: what goes in the iOS privacy manifest's collected data
 * types. Left out, the Genesis blocks the app's packages carry decide.
 */
export interface GenesisPrivacy {
  /** The Genesis blocks whose data the app sends anywhere (`account`, `observability`, `push`). Default: found from package.json. */
  blocks?: string[];
  /** Every kind of data the app collects. Replaces what the blocks give, so list everything. */
  collects?: GenesisDataUse[];
  /** `NSPrivacyTracking`. Default false; true needs `NSPrivacyTrackingDomains` in app.config. */
  tracking?: boolean;
}

/** genesis.config.json, parsed, with its shared blocks validated. */
export interface GenesisConfigFile {
  /** The whole parsed file, for blocks other readers own (`doctor`, `features`). */
  raw: Record<string, unknown>;
  links?: GenesisLinks;
  privacy?: GenesisPrivacy;
}

export interface LoadedConfig {
  config: DoctorConfig;
  /** The file it came from, or null when no config exists (defaults apply). */
  file: string | null;
  /** Folder that relative plugin paths resolve against. */
  dir: string;
}

const STRING_LISTS = ["src", "extensions", "ignore", "tokenFiles", "ignoreTokenPrefixes", "localPrimitiveDirs", "build", "componentPackages"] as const;
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
  "packs",
  "native",
  "supabase",
  "routesDir",
  "$schema",
  "$comment",
]);
const LEVELS = new Set(["error", "warn", "off"]);
const PATTERN_KEYS = new Set(["id", "level", "files", "exclude", "forbid", "require", "path", "message"]);
const PACKS = new Set(["native", "supabase"]);
/** Each pack's settings: key → "string", "path" (app-relative folder, normalized) or "list". */
const PACK_KEYS: Record<string, Record<string, "string" | "path" | "list">> = {
  native: { routerRoot: "path" },
  supabase: { migrations: "path", base: "string", exposedSchemas: "list", since: "string" },
};

/** An app-relative folder in POSIX form (`./app/` → `app`); absolute paths and paths leaving the app are rejected. */
function appPath(v: unknown, where: string, fail: (msg: string) => never): string {
  if (typeof v !== "string" || !v.trim()) return fail(`${where} must be a non-empty path`);
  if (path.isAbsolute(v) || /^[A-Za-z]:[\\/]/.test(v)) fail(`${where} must be relative to the app, not absolute ("${v}")`);
  const norm = path.posix.normalize(v.replace(/\\/g, "/")).replace(/\/+$/, "");
  if (norm === "." || norm === ".." || norm.startsWith("../")) fail(`${where} must be a folder inside the app ("${v}")`);
  return norm;
}

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
    const block = readGenesisConfig(root)?.raw.doctor;
    return { config: validateConfig(block ?? {}, own), file: own, dir: root };
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

/**
 * Reads `<root>/genesis.config.json` and validates its shared blocks (today:
 * `links` and `privacy`). Returns null when the file doesn't exist; throws a
 * GenesisConfigError naming the file when it isn't valid.
 */
export function readGenesisConfig(root: string): GenesisConfigFile | null {
  const file = path.join(root, "genesis.config.json");
  if (!existsSync(file)) return null;
  const raw: unknown = readJson(file);
  if (!isObject(raw)) throw new GenesisConfigError(`${file}: the config must be a JSON object`);
  const out: GenesisConfigFile = { raw };
  if (raw.links !== undefined) out.links = validateLinks(raw.links, file);
  if (raw.privacy !== undefined) out.privacy = validatePrivacy(raw.privacy, file);
  return out;
}

const PRIVACY_KEYS = new Set(["blocks", "collects", "tracking"]);
const DATA_USE_KEYS = new Set(["type", "purposes", "linked", "tracking"]);

/**
 * Check a `privacy` block (genesis.config.json's, or the plugin's `privacy`
 * option): a misspelt data type or purpose fails the build, since Xcode's
 * privacy report ignores values it doesn't know.
 */
export function validatePrivacy(raw: unknown, source = "config"): GenesisPrivacy {
  const fail = (msg: string): never => {
    throw new GenesisConfigError(`${source}: ${msg}`);
  };
  if (!isObject(raw)) fail(`"privacy" must be an object`);
  const c = raw as Record<string, unknown>;
  for (const key of Object.keys(c)) if (!PRIVACY_KEYS.has(key)) fail(`privacy: unknown setting "${key}"`);
  const out: GenesisPrivacy = {};
  if (c.blocks !== undefined) {
    if (!isStringList(c.blocks)) fail(`privacy.blocks must be a list of block ids`);
    out.blocks = [...new Set(c.blocks as string[])];
  }
  if (c.tracking !== undefined) {
    if (typeof c.tracking !== "boolean") fail(`privacy.tracking must be true or false`);
    out.tracking = c.tracking as boolean;
  }
  if (c.collects !== undefined) {
    if (!Array.isArray(c.collects)) fail(`privacy.collects must be a list`);
    out.collects = (c.collects as unknown[]).map((entry, i) => {
      const where = `privacy.collects[${i}]`;
      if (!isObject(entry)) return fail(`${where} must be an object`);
      for (const key of Object.keys(entry)) if (!DATA_USE_KEYS.has(key)) fail(`${where}: unknown setting "${key}"`);
      if (typeof entry.type !== "string" || !privacyDataType(entry.type)) {
        fail(`${where}.type "${String(entry.type)}" is not one of ${Object.keys(PRIVACY_DATA_TYPES).join(", ")}`);
      }
      if (!isStringList(entry.purposes) || entry.purposes.length === 0) fail(`${where}.purposes must be a non-empty list`);
      for (const p of entry.purposes as string[]) {
        if (!(p in PRIVACY_PURPOSES)) fail(`${where}.purposes: "${p}" is not one of ${Object.keys(PRIVACY_PURPOSES).join(", ")}`);
      }
      if (typeof entry.linked !== "boolean") fail(`${where}.linked must be true or false`);
      if (typeof entry.tracking !== "boolean") fail(`${where}.tracking must be true or false`);
      return { type: entry.type as string, purposes: [...new Set(entry.purposes as string[])], linked: entry.linked as boolean, tracking: entry.tracking as boolean };
    });
  }
  return out;
}

const LINK_KEYS = new Set(["hosts", "paths", "webcredentials"]);
const HOST = /^(?=.{1,253}$)(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Check the `links` block, so a typo'd host fails the build instead of shipping links that never open. */
export function validateLinks(raw: unknown, source = "config"): GenesisLinks {
  const fail = (msg: string): never => {
    throw new GenesisConfigError(`${source}: ${msg}`);
  };
  if (!isObject(raw)) fail(`"links" must be an object`);
  const c = raw as Record<string, unknown>;
  for (const key of Object.keys(c)) if (!LINK_KEYS.has(key)) fail(`links: unknown setting "${key}"`);
  if (!isStringList(c.hosts) || c.hosts.length === 0) fail(`links.hosts must be a non-empty list of host names`);
  for (const host of c.hosts as string[]) {
    if (!HOST.test(host)) {
      fail(`links.hosts: "${host}" is not a bare lower-case host name (no scheme, path or port), e.g. "example.com"`);
    }
  }
  if (c.paths !== undefined) {
    if (!isStringList(c.paths)) fail(`links.paths must be a list of path prefixes`);
    for (const p of c.paths as string[]) {
      if (!p.startsWith("/") || /[\s?#*]/.test(p)) {
        fail(`links.paths: "${p}" must start with "/" and hold no spaces, "?", "#" or "*"`);
      }
    }
  }
  if (c.webcredentials !== undefined && typeof c.webcredentials !== "boolean") fail(`links.webcredentials must be true or false`);
  const links: GenesisLinks = { hosts: [...new Set(c.hosts as string[])] };
  if (c.paths !== undefined) links.paths = [...new Set(c.paths as string[])];
  if (c.webcredentials !== undefined) links.webcredentials = c.webcredentials as boolean;
  return links;
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
  if (c.routesDir !== undefined) c.routesDir = appPath(c.routesDir, `"routesDir"`, fail);
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
  if (c.packs !== undefined) {
    if (!isStringList(c.packs)) fail(`"packs" must be a list, e.g. ["native", "supabase"]`);
    for (const p of c.packs as string[]) if (!PACKS.has(p)) fail(`packs: unknown pack "${p}" (known: ${[...PACKS].join(", ")})`);
    if (new Set(c.packs as string[]).size !== (c.packs as string[]).length) fail(`packs: lists a pack twice`);
  }
  for (const [pack, keys] of Object.entries(PACK_KEYS)) {
    const block = c[pack];
    if (block === undefined) continue;
    if (!isObject(block)) fail(`"${pack}" must be an object`);
    if (!((c.packs as string[] | undefined) ?? []).includes(pack)) fail(`"${pack}" settings are set but the ${pack} pack is not in "packs"`);
    for (const [k, v] of Object.entries(block as object)) {
      const want = keys[k];
      if (!want) fail(`${pack}: unknown setting "${k}"`);
      if (want === "string" && typeof v !== "string") fail(`${pack}.${k} must be a string`);
      if (want === "list" && !isStringList(v)) fail(`${pack}.${k} must be a list of strings`);
      if (want === "string" && !(v as string).trim()) fail(`${pack}.${k} must not be empty`);
      if (want === "path") (block as Record<string, unknown>)[k] = appPath(v, `${pack}.${k}`, fail);
    }
  }
  // Schema names compare lowercased, like the SQL they're matched against.
  const supa = c.supabase as Record<string, unknown> | undefined;
  if (Array.isArray(supa?.exposedSchemas)) supa.exposedSchemas = (supa.exposedSchemas as string[]).map((s) => s.toLowerCase());
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
