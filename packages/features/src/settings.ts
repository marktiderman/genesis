/**
 * Settings: every Genesis package declares its settings with {@link defineSettings}, the app builds
 * one catalogue from them ({@link settingsCatalogue}), and one resolver ({@link resolveSettings})
 * turns the layers into values, with where each came from and what was wrong.
 *
 * Layers, low to high (a later layer wins unless an earlier layer locked the value):
 *
 *   1. default   the declared default (for a per-preset default, the `max` value)
 *   2. preset    `max` (Genesis's default), `standard` or `min`: keys with a per-preset default
 *   3. file      genesis.config.json `settings`, committed and reviewed like code
 *   4. database  the app's `genesis_settings` table, changed live by platform admins
 *   5. tenant    only keys declared `scope: "tenant"`
 *   6. person    only keys declared `scope: "person"`
 *
 * A key declared `applies: "build"` takes effect only from a new build, so only the default,
 * preset and file layers set it. Secrets are never settings: a key names the secret it needs
 * (`needs: "secret:NAME"`) and the store it lives in, never its value.
 *
 * Feeding the gate: a boolean key linked to a feature (`feature`) that resolves to false puts the
 * feature in `GateContext.off`; a key linked to a flag (`flag`) gives that flag its value
 * ({@link settingsGateContext}, {@link withSettings}). There is no second gate.
 *
 * No zod, React, Node built-ins or DOM globals here: it ships to browsers, phones, edge functions
 * and servers (`@marktiderman/genesis-config/settings`).
 */
import type { GateContext, IdSet } from "./gate";
import type { FlagValue } from "./types";

/** The presets: `max` (the default) turns everything on. @stability Beta */
export const SETTINGS_PRESETS = ["max", "standard", "min"] as const;
/** @stability Beta */
export type SettingsPreset = (typeof SETTINGS_PRESETS)[number];
/** Genesis's default preset: zero config is everything on. @stability Beta */
export const DEFAULT_PRESET: SettingsPreset = "max";

/** @stability Beta */
export const SETTING_TYPES = ["boolean", "number", "string", "list", "object"] as const;
/** @stability Beta */
export type SettingType = (typeof SETTING_TYPES)[number];

/** The lowest layer that may change a key: the app (file, database), a tenant, or a person. @stability Beta */
export type SettingScope = "app" | "tenant" | "person";
/** `build`: needs a new binary or bundle. `runtime`: takes effect live. @stability Beta */
export type SettingApplies = "build" | "runtime";
/** Where a secret a key needs is kept (config-layer §9). @stability Beta */
export type SecretStore = "vault" | "edge" | "server-env" | "ci";

/** The layers, low to high. @stability Beta */
export const SETTINGS_LAYERS = ["default", "preset", "file", "database", "tenant", "person"] as const;
/** @stability Beta */
export type SettingsLayer = (typeof SETTINGS_LAYERS)[number];

/** A value by preset. All three are given. @stability Beta */
export interface PresetDefaults<T> {
  max: T;
  standard: T;
  min: T;
}

/** The value a type holds. @stability Beta */
export type SettingValueOf<K extends SettingType> = K extends "boolean"
  ? boolean
  : K extends "number"
    ? number
    : K extends "string"
      ? string
      : K extends "list"
        ? readonly (string | number)[]
        : { readonly [key: string]: unknown };

/**
 * One key, as a package declares it.
 *
 * @stability Beta
 */
export interface SettingSpec<K extends SettingType = SettingType> {
  type: K;
  /** The default, or one per preset (`{ max, standard, min }`). `null` means "not set" (a string to fill in, say). */
  default: SettingValueOf<K> | null | PresetDefaults<SettingValueOf<K> | null>;
  /** The lowest layer that may change it. Default `app`. */
  scope?: SettingScope;
  /** Default `runtime`. A `build` key can't have a tenant or person scope. */
  applies?: SettingApplies;
  /** Other keys (`namespace.key`) that must be on while this one is on. */
  requires?: readonly string[];
  /** A number's bounds, or a list's length. */
  min?: number;
  max?: number;
  /** The values a string or number may take, or a list's items. */
  options?: readonly (string | number)[];
  /** The secret it needs, by name only: `"secret:GITHUB_TOKEN"`. The value is never a setting. */
  needs?: `secret:${string}`;
  /** Where that secret is kept. Default `edge` (an Edge Function secret). Only with `needs`. */
  store?: SecretStore;
  /** A feature id (features.ts) this boolean switches: false puts it in `GateContext.off`. */
  feature?: string;
  /** A flag name (flags.json) this key gives its value to. */
  flag?: string;
  /** One line for the Settings screen and the agent. */
  summary?: string;
}

/** A declared key with its namespace folded in and its defaults filled. @stability Beta */
export interface SettingDef {
  /** `namespace.key` */
  readonly key: string;
  readonly namespace: string;
  readonly type: SettingType;
  /** The default for each preset (the same value three times for a plain default). */
  readonly defaults: Readonly<PresetDefaults<unknown>>;
  /** True when the default differs by preset (resolved by the preset layer). */
  readonly byPreset: boolean;
  /** True when a default is `null` ("not set"): only then may a layer set `null`. */
  readonly nullable: boolean;
  readonly scope: SettingScope;
  readonly applies: SettingApplies;
  readonly requires: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly (string | number)[];
  readonly secret?: { readonly name: string; readonly store: SecretStore };
  readonly feature?: string;
  readonly flag?: string;
  readonly summary?: string;
}

/** What {@link defineSettings} returns: one package's keys. @stability Beta */
export interface SettingsDeclaration<N extends string = string, Keys extends string = string> {
  readonly namespace: N;
  readonly keys: { readonly [K in Keys as `${N}.${K}`]: SettingDef };
}

/** A declaration or catalogue that can't be used. @stability Beta */
export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

const NAMESPACE = /^[a-z][a-zA-Z0-9]*(?:-[a-z0-9]+)*$/;
const KEY = /^[a-z][a-zA-Z0-9]*$/;
/** A full key: `namespace.key`, or `namespace.group.key` is not allowed (one level). */
export const SETTING_KEY = /^[a-z][a-zA-Z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-zA-Z0-9]*$/;
const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;
const SPEC_KEYS = new Set(["type", "default", "scope", "applies", "requires", "min", "max", "options", "needs", "store", "feature", "flag", "summary"]);
const SCOPES: readonly SettingScope[] = ["app", "tenant", "person"];
const APPLIES: readonly SettingApplies[] = ["build", "runtime"];
const STORES: readonly SecretStore[] = ["vault", "edge", "server-env", "ci"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/** `obj[key]` when `key` is its own property: never `__proto__`, `constructor` or `toString` from a prototype. */
function own<T>(obj: { readonly [key: string]: T }, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/** An empty map with no prototype, so no key (`__proto__`, `constructor`) means anything but itself. */
function dict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** A per-preset default: an object with exactly `max`, `standard` and `min`. */
export function isPresetDefaults(v: unknown): v is PresetDefaults<unknown> {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v).sort();
  return keys.length === 3 && keys[0] === "max" && keys[1] === "min" && keys[2] === "standard";
}

/**
 * Why a value doesn't fit a key's type and bounds, or null when it does. `null` ("not set") fits
 * only a key whose default is `null` (`nullable`).
 */
export function settingValueProblem(def: Pick<SettingDef, "type" | "min" | "max" | "options"> & { nullable?: boolean }, value: unknown): string | null {
  if (value === null) return def.nullable ? null : "can't be null: it has a default, so set a value";
  switch (def.type) {
    case "boolean":
      if (typeof value !== "boolean") return "must be true or false";
      return null;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "must be a number";
      if (def.min !== undefined && value < def.min) return `must be at least ${def.min}`;
      if (def.max !== undefined && value > def.max) return `must be at most ${def.max}`;
      if (def.options && !def.options.includes(value)) return `must be one of ${def.options.join(", ")}`;
      return null;
    case "string":
      if (typeof value !== "string") return "must be a string";
      if (def.options && !def.options.includes(value)) return `must be one of ${def.options.map((o) => JSON.stringify(o)).join(", ")}`;
      return null;
    case "list":
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string" && typeof item !== "number")) return "must be a list of strings or numbers";
      if (def.min !== undefined && value.length < def.min) return `must have at least ${def.min} items`;
      if (def.max !== undefined && value.length > def.max) return `must have at most ${def.max} items`;
      if (def.options) {
        const bad = value.find((item) => !def.options!.includes(item));
        if (bad !== undefined) return `has ${JSON.stringify(bad)}, which isn't one of ${def.options.map((o) => JSON.stringify(o)).join(", ")}`;
      }
      return null;
    case "object":
      if (!isPlainObject(value)) return "must be an object";
      return null;
  }
}

/** One key's spec, checked and normalised. Throws a SettingsError naming the key. */
function defineKey(namespace: string, name: string, spec: SettingSpec): SettingDef {
  const key = `${namespace}.${name}`;
  const fail = (msg: string): never => {
    throw new SettingsError(`defineSettings("${namespace}"): ${key} ${msg}`);
  };
  if (!KEY.test(name)) fail(`isn't a valid key name (camelCase letters and digits)`);
  if (!isPlainObject(spec)) fail("must be an object");
  for (const k of Object.keys(spec)) if (!SPEC_KEYS.has(k)) fail(`has an unknown field "${k}"`);
  if (!SETTING_TYPES.includes(spec.type)) fail(`has type ${JSON.stringify(spec.type)} (one of ${SETTING_TYPES.join(", ")})`);
  if (!Object.prototype.hasOwnProperty.call(spec, "default")) fail("needs a default (null for none)");
  const scope = spec.scope ?? "app";
  const applies = spec.applies ?? "runtime";
  if (!SCOPES.includes(scope)) fail(`has scope ${JSON.stringify(scope)} (app, tenant or person)`);
  if (!APPLIES.includes(applies)) fail(`has applies ${JSON.stringify(applies)} (build or runtime)`);
  if (applies === "build" && scope !== "app") fail(`applies at build time, so it can't have a ${scope} scope (a build is the app's)`);
  for (const bound of ["min", "max"] as const) {
    const v = spec[bound];
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v))) fail(`${bound} must be a number`);
    if (v !== undefined && spec.type !== "number" && spec.type !== "list") fail(`has ${bound}, which only a number or a list takes`);
  }
  if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) fail("has min above max");
  if (spec.options !== undefined) {
    if (!Array.isArray(spec.options) || spec.options.length === 0) fail("options must be a non-empty list");
    if (spec.type === "boolean" || spec.type === "object") fail(`has options, which a ${spec.type} doesn't take`);
  }
  const requires = spec.requires ?? [];
  if (!Array.isArray(requires)) fail("requires must be a list of keys");
  for (const r of requires) {
    if (typeof r !== "string" || !SETTING_KEY.test(r)) fail(`requires ${JSON.stringify(r)}, which isn't a full key (namespace.key)`);
    if (r === key) fail("requires itself");
  }
  let secret: SettingDef["secret"];
  if (spec.needs !== undefined) {
    const m = typeof spec.needs === "string" ? /^secret:(.+)$/.exec(spec.needs) : null;
    if (!m || !SECRET_NAME.test(m[1]!)) fail(`needs ${JSON.stringify(spec.needs)}: write "secret:NAME" with the secret's NAME in capitals (never its value)`);
    const store = spec.store ?? "edge";
    if (!STORES.includes(store)) fail(`has store ${JSON.stringify(store)} (vault, edge, server-env or ci)`);
    secret = { name: m![1]!, store };
  } else if (spec.store !== undefined) {
    fail("has a store but no needs: the store is where the secret it needs lives");
  }
  for (const link of ["feature", "flag"] as const) {
    const v = spec[link];
    if (v !== undefined && (typeof v !== "string" || !v.trim())) fail(`${link} must be a non-empty id`);
  }
  if (spec.feature !== undefined && spec.type !== "boolean") fail("switches a feature, so it must be a boolean");
  const byPreset = isPresetDefaults(spec.default);
  const defaults = byPreset
    ? { ...(spec.default as PresetDefaults<unknown>) }
    : { max: spec.default as unknown, standard: spec.default as unknown, min: spec.default as unknown };
  const nullable = SETTINGS_PRESETS.some((preset) => defaults[preset] === null);
  const shape = { type: spec.type, min: spec.min, max: spec.max, options: spec.options, nullable };
  for (const preset of SETTINGS_PRESETS) {
    const problem = settingValueProblem(shape, defaults[preset]);
    if (problem) fail(`default${byPreset ? ` for ${preset}` : ""} ${problem}`);
  }
  const def: SettingDef = {
    key,
    namespace,
    type: spec.type,
    defaults: Object.freeze(defaults),
    byPreset,
    nullable,
    scope,
    applies,
    requires: Object.freeze([...requires]),
    ...(spec.min !== undefined ? { min: spec.min } : {}),
    ...(spec.max !== undefined ? { max: spec.max } : {}),
    ...(spec.options !== undefined ? { options: Object.freeze([...spec.options]) } : {}),
    ...(secret ? { secret: Object.freeze(secret) } : {}),
    ...(spec.feature !== undefined ? { feature: spec.feature } : {}),
    ...(spec.flag !== undefined ? { flag: spec.flag } : {}),
    ...(spec.summary !== undefined ? { summary: spec.summary } : {}),
  };
  return Object.freeze(def);
}

/**
 * A package's settings, declared next to its `defineBlock`. Keys are `namespace.key`.
 *
 * ```ts
 * export const supportSettings = defineSettings("support", {
 *   messenger: { type: "boolean", default: { max: true, standard: true, min: false }, scope: "tenant" },
 *   dumpRetentionDays: { type: "number", default: 90, min: 7, max: 365 },
 *   githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", store: "edge" },
 * });
 * ```
 *
 * Throws a {@link SettingsError} for a declaration that can't be used (an unknown field, a
 * default outside its bounds, a build-time key with a tenant scope, a secret value instead of a name).
 *
 * @stability Beta
 */
export function defineSettings<const N extends string, const S extends { readonly [key: string]: SettingSpec }>(
  namespace: N,
  keys: S,
): SettingsDeclaration<N, Extract<keyof S, string>> {
  if (typeof namespace !== "string" || !NAMESPACE.test(namespace)) {
    throw new SettingsError(`defineSettings: ${JSON.stringify(namespace)} isn't a valid namespace (lower camelCase or kebab-case, like "support")`);
  }
  if (!isPlainObject(keys) || Object.keys(keys).length === 0) throw new SettingsError(`defineSettings("${namespace}"): declare at least one key`);
  const out = dict<SettingDef>();
  for (const [name, spec] of Object.entries(keys)) {
    const def = defineKey(namespace, name, spec as SettingSpec);
    out[def.key] = def;
  }
  return Object.freeze({ namespace, keys: Object.freeze(out) }) as unknown as SettingsDeclaration<N, Extract<keyof S, string>>;
}

/** Every package's keys in one place. @stability Beta */
export interface SettingsCatalogue {
  readonly keys: { readonly [key: string]: SettingDef };
}

/**
 * One catalogue from every package's declarations (the way features.ts builds the registry).
 * Throws a {@link SettingsError} when two declarations share a namespace or a key, or a key
 * requires one no declaration has.
 *
 * @stability Beta
 */
export function settingsCatalogue(declarations: readonly SettingsDeclaration[]): SettingsCatalogue {
  const keys = dict<SettingDef>();
  const namespaces = new Set<string>();
  for (const decl of declarations) {
    if (namespaces.has(decl.namespace)) throw new SettingsError(`settingsCatalogue: the namespace "${decl.namespace}" is declared twice`);
    namespaces.add(decl.namespace);
    for (const [key, def] of Object.entries(decl.keys)) {
      // Only what defineSettings made: a hand-built declaration with a key like `__proto__` is refused.
      if (!SETTING_KEY.test(key) || !isPlainObject(def) || (def as SettingDef).key !== key || !key.startsWith(`${decl.namespace}.`)) {
        throw new SettingsError(`settingsCatalogue: ${JSON.stringify(key)} in "${decl.namespace}" isn't a key defineSettings declared`);
      }
      if (own(keys, key)) throw new SettingsError(`settingsCatalogue: ${key} is declared twice`);
      keys[key] = def as SettingDef;
    }
  }
  for (const def of Object.values(keys)) {
    for (const r of def.requires) if (!own(keys, r)) throw new SettingsError(`settingsCatalogue: ${def.key} requires ${r}, which no package declares`);
  }
  return Object.freeze({ keys: Object.freeze(keys) });
}

/**
 * One key's value in a layer. `locked: true` stops every later layer from changing it.
 *
 * @stability Beta
 */
export interface SettingEntry {
  value: unknown;
  locked?: boolean;
}

/** A layer's values by full key. @stability Beta */
export type SettingsLayerValues = { readonly [key: string]: SettingEntry };

/**
 * The layers to resolve. Leave out what the caller doesn't have: no `preset` is `max`, no
 * `tenant` means no tenant has changed anything.
 *
 * @stability Beta
 */
export interface SettingsLayers {
  preset?: SettingsPreset;
  file?: SettingsLayerValues;
  database?: SettingsLayerValues;
  tenant?: SettingsLayerValues;
  person?: SettingsLayerValues;
}

/** @stability Beta */
export type SettingsProblemKind = "unknown-key" | "type" | "scope" | "build-only" | "locked" | "requires" | "preset";

/**
 * Something wrong in the layers: the value was ignored (every kind but `requires`, which keeps
 * the value and says what it needs).
 *
 * @stability Beta
 */
export interface SettingsProblem {
  kind: SettingsProblemKind;
  key: string;
  /** The layer the problem is in. For `requires`, the layer that set the key. */
  layer: SettingsLayer;
  message: string;
}

/** Where a value came from, and the layer that locked it, if any. @stability Beta */
export interface SettingSource {
  layer: SettingsLayer;
  lockedBy?: SettingsLayer;
}

/** @stability Beta */
export interface ResolvedSettings {
  readonly preset: SettingsPreset;
  readonly values: { readonly [key: string]: unknown };
  readonly sources: { readonly [key: string]: SettingSource };
  readonly problems: readonly SettingsProblem[];
}

const OVERRIDE_LAYERS = ["file", "database", "tenant", "person"] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** On, for `requires`: anything but false, null or not set. */
function isOn(value: unknown): boolean {
  return value !== false && value !== null && value !== undefined;
}

/**
 * The scope rule, in one place: which override layers may set a key of each scope. The app's own
 * layers (file, database) set every key; the tenant layer only keys declared `scope: "tenant"`,
 * the person layer only keys declared `scope: "person"` (decision C2, read literally). Changing
 * this table is the whole change if that reading changes.
 *
 * @stability Beta
 */
export const SCOPE_LAYERS: Readonly<Record<SettingScope, readonly SettingsLayer[]>> = Object.freeze({
  app: Object.freeze(["file", "database"] as SettingsLayer[]),
  tenant: Object.freeze(["file", "database", "tenant"] as SettingsLayer[]),
  person: Object.freeze(["file", "database", "person"] as SettingsLayer[]),
});

/** Why a layer may not set a key at all, or null. */
function layerRefusal(def: SettingDef, layer: (typeof OVERRIDE_LAYERS)[number]): { kind: SettingsProblemKind; message: string } | null {
  if (def.applies === "build" && layer !== "file") {
    return { kind: "build-only", message: `${def.key} applies at build time: only genesis.config.json sets it, not the ${layer} layer` };
  }
  if (!SCOPE_LAYERS[def.scope].includes(layer)) return { kind: "scope", message: `${def.key} has scope "${def.scope}": the ${layer} layer can't change it` };
  return null;
}

/**
 * Resolve every key in the catalogue through the layers. Later layers win unless an earlier one
 * locked the value. Problems never throw: a bad entry is reported and skipped, so one typo in a
 * table never takes the app down.
 *
 * - `unknown-key`: no package declares it.
 * - `type`: the value doesn't fit the key's type or bounds.
 * - `scope`: a tenant or person entry for a key not declared with that scope.
 * - `build-only`: a database, tenant or person entry for a key that applies at build time.
 * - `locked`: a later layer tried to change a value an earlier layer locked (setting the same
 *   value again isn't a problem).
 * - `requires`: a key is on while a key it requires is off. The value stays; the screen and the
 *   doctor show what's missing.
 * - `preset`: an unknown preset; the layers resolve on `max`.
 *
 * A lock whose own value is bad still locks: the value from the layers below stays, pinned, and
 * the bad value is reported (`type`). A lock never fails open.
 *
 * @stability Beta
 */
export function resolveSettings(catalogue: SettingsCatalogue, layers: SettingsLayers = {}): ResolvedSettings {
  const problems: SettingsProblem[] = [];
  let preset: SettingsPreset = layers.preset ?? DEFAULT_PRESET;
  if (!SETTINGS_PRESETS.includes(preset)) {
    problems.push({ kind: "preset", key: "preset", layer: "preset", message: `unknown preset ${JSON.stringify(preset)} (max, standard or min): resolved on ${DEFAULT_PRESET}` });
    preset = DEFAULT_PRESET;
  }
  const values = dict<unknown>();
  const sources = dict<SettingSource>();
  for (const def of Object.values(catalogue.keys)) {
    if (def.byPreset) {
      values[def.key] = def.defaults[preset];
      sources[def.key] = { layer: "preset" };
    } else {
      values[def.key] = def.defaults[DEFAULT_PRESET];
      sources[def.key] = { layer: "default" };
    }
  }
  for (const layer of OVERRIDE_LAYERS) {
    const entries = layers[layer];
    if (!entries) continue;
    for (const [key, entry] of Object.entries(entries)) {
      const def = own(catalogue.keys, key);
      if (!def) {
        problems.push({ kind: "unknown-key", key, layer, message: `${key} isn't a setting any installed package declares` });
        continue;
      }
      const refusal = layerRefusal(def, layer);
      if (refusal) {
        problems.push({ ...refusal, key, layer });
        continue;
      }
      const source = sources[key]!;
      if (!isPlainObject(entry) || !Object.prototype.hasOwnProperty.call(entry, "value")) {
        problems.push({ kind: "type", key, layer, message: `${key} in the ${layer} layer has no value` });
        continue;
      }
      const bad = settingValueProblem(def, entry.value);
      if (bad) {
        // A bad value under a lock still locks: what the layers below gave stays, pinned.
        const locks = entry.locked === true && !source.lockedBy;
        if (locks) sources[key] = { layer: source.layer, lockedBy: layer };
        problems.push({ kind: "type", key, layer, message: `${key} ${bad} (the ${layer} layer has ${JSON.stringify(entry.value)})${locks ? `; its lock still holds the value from the ${source.layer} layer` : ""}` });
        continue;
      }
      if (source.lockedBy) {
        if (!sameValue(values[key], entry.value)) {
          problems.push({ kind: "locked", key, layer, message: `${key} is locked by the ${source.lockedBy} layer: the ${layer} layer can't change it` });
        }
        continue;
      }
      values[key] = entry.value;
      sources[key] = entry.locked === true ? { layer, lockedBy: layer } : { layer };
    }
  }
  for (const def of Object.values(catalogue.keys)) {
    if (!def.requires.length || !isOn(values[def.key])) continue;
    const off = def.requires.filter((r) => !isOn(values[r]));
    if (off.length) {
      problems.push({ kind: "requires", key: def.key, layer: sources[def.key]!.layer, message: `${def.key} is on but needs ${off.join(" and ")}, which ${off.length === 1 ? "is" : "are"} off` });
    }
  }
  return Object.freeze({ preset, values: Object.freeze(values), sources: Object.freeze(sources), problems: Object.freeze(problems) });
}

/**
 * genesis.config.json's `settings`, as a layer. Each key holds its value, or `{ "value": …,
 * "locked": true }` to lock it: an object with exactly `value` and `locked` (a boolean) is that
 * wrapper; any other object is the value itself.
 *
 * @stability Beta
 */
export function settingsLayerFromFile(settings: { readonly [key: string]: unknown } | undefined): SettingsLayerValues {
  const out = dict<SettingEntry>();
  for (const [key, raw] of Object.entries(settings ?? {})) out[key] = isLockedEntry(raw) ? { value: raw.value, locked: raw.locked } : { value: raw };
  return out;
}

/** `{ value, locked }` exactly, with a boolean lock: the file's way to lock a value. @stability Beta */
export function isLockedEntry(raw: unknown): raw is { value: unknown; locked: boolean } {
  if (!isPlainObject(raw)) return false;
  const keys = Object.keys(raw).sort();
  return keys.length === 2 && keys[0] === "locked" && keys[1] === "value" && typeof raw.locked === "boolean";
}

/** Rows (`{ key, value, locked }`, as the database returns them) as a layer. @stability Beta */
export function settingsLayerFromRows(rows: readonly { key: string; value: unknown; locked?: boolean | null }[]): SettingsLayerValues {
  const out = dict<SettingEntry>();
  for (const row of rows) out[row.key] = row.locked ? { value: row.value, locked: true } : { value: row.value };
  return out;
}

/** The secrets the catalogue's keys need, by name and store, never by value. @stability Beta */
export function settingsSecrets(catalogue: SettingsCatalogue): Array<{ key: string; name: string; store: SecretStore }> {
  return Object.values(catalogue.keys)
    .filter((def): def is SettingDef & { secret: NonNullable<SettingDef["secret"]> } => def.secret !== undefined)
    .map((def) => ({ key: def.key, name: def.secret.name, store: def.secret.store }));
}

/** What the resolved settings say to the gate. @stability Beta */
export interface SettingsGate {
  /** Features a boolean key linked with `feature` switched off (resolved to false). */
  off: string[];
  /** Flag values from keys linked with `flag`, when set. */
  flags: { [name: string]: FlagValue };
  /** The features and flags whose keys a layer locked: the context's own switches and flag values don't change them. */
  locked: { features: string[]; flags: string[] };
}

/**
 * What the resolved settings say to the gate: the features switched off (a boolean key linked
 * with `feature` that resolved to false), flag values (a key linked with `flag`, when set), and
 * which of those are locked.
 *
 * @stability Beta
 */
export function settingsGateContext(catalogue: SettingsCatalogue, resolved: ResolvedSettings): SettingsGate {
  const off = new Set<string>();
  const flags = dict<FlagValue>();
  const lockedFeatures = new Set<string>();
  const lockedFlags = new Set<string>();
  for (const def of Object.values(catalogue.keys)) {
    const value = own(resolved.values, def.key);
    const locked = own(resolved.sources, def.key)?.lockedBy !== undefined;
    if (def.feature && value === false) off.add(def.feature);
    if (def.feature && locked) lockedFeatures.add(def.feature);
    if (def.flag && value !== null && value !== undefined) {
      flags[def.flag] = value as FlagValue;
      if (locked) lockedFlags.add(def.flag);
    }
  }
  return { off: [...off].sort(), flags, locked: { features: [...lockedFeatures].sort(), flags: [...lockedFlags].sort() } };
}

function idTest(set: IdSet | undefined): (id: string) => boolean {
  if (set === undefined) return () => false;
  if (typeof set === "function") return set;
  if (Array.isArray(set)) return (id) => set.includes(id);
  const s = set as ReadonlySet<string>;
  return (id) => s.has(id);
}

/**
 * A gate context with the resolved settings folded in. The gate itself doesn't change:
 *
 * - a feature a setting switched off goes in `settingsOff`, so `featureOn` answers `reason:
 *   "setting"`;
 * - a flag the context doesn't set takes the setting's value;
 * - a locked setting wins over the context: the tenant's switch (`off`) can't turn off a feature
 *   whose key a layer locked on, and the context's flag value can't change a locked flag.
 *
 * ```ts
 * const ctx = withSettings({ platform: "web", entitlements, off: tenantOff }, catalogue, resolved);
 * featureOn({ features }, ctx, "support-messenger");
 * ```
 *
 * @stability Beta
 */
export function withSettings(ctx: GateContext, catalogue: SettingsCatalogue, resolved: ResolvedSettings): GateContext {
  const gate = settingsGateContext(catalogue, resolved);
  const ctxOff = idTest(ctx.off);
  const ctxSettingsOff = idTest(ctx.settingsOff);
  const settingsOff = new Set(gate.off);
  const lockedFeatures = new Set(gate.locked.features);
  const lockedFlags = new Set(gate.locked.flags);
  const flags = ctx.flags;
  const flagOf: (name: string) => FlagValue | undefined =
    flags === undefined
      ? () => undefined
      : typeof flags === "function"
        ? flags
        : (name) => (Object.prototype.hasOwnProperty.call(flags, name) ? flags[name] : undefined);
  return {
    ...ctx,
    settingsOff: (id: string) => settingsOff.has(id) || ctxSettingsOff(id),
    off: (id: string) => !lockedFeatures.has(id) && ctxOff(id),
    flags: (name: string) => {
      const setting = own(gate.flags, name);
      if (lockedFlags.has(name)) return setting;
      const fromCtx = flagOf(name);
      return fromCtx !== undefined ? fromCtx : setting;
    },
  };
}

/** One key as the database checks it (genesis_app_manifest.catalogue): no defaults, no secrets. @stability Beta */
export interface SettingManifestEntry {
  type: SettingType;
  applies: SettingApplies;
  scope: SettingScope;
  min?: number;
  max?: number;
  options?: readonly (string | number)[];
  /** Present (true) only when the key may be `null` ("not set"). */
  nullable?: true;
}

/**
 * The catalogue as the database's manifest stores it, so `set_genesis_setting` can check a value
 * (type, bounds, runtime only) without the packages' code. Written on deploy with the manifest.
 *
 * @stability Beta
 */
export function catalogueManifest(catalogue: SettingsCatalogue): { [key: string]: SettingManifestEntry } {
  const out = dict<SettingManifestEntry>();
  for (const def of Object.values(catalogue.keys)) {
    out[def.key] = {
      type: def.type,
      applies: def.applies,
      scope: def.scope,
      ...(def.min !== undefined ? { min: def.min } : {}),
      ...(def.max !== undefined ? { max: def.max } : {}),
      ...(def.options !== undefined ? { options: def.options } : {}),
      ...(def.nullable ? { nullable: true as const } : {}),
    };
  }
  return out;
}

/**
 * A package's settings as its package.json declares them (`genesis.settings`: `{ namespace, keys }`),
 * for tools that read packages without running them (the CLI's doctor). The same checks as
 * {@link defineSettings}.
 *
 * @stability Beta
 */
export function settingsFromManifest(raw: unknown, where = "genesis.settings"): SettingsDeclaration {
  if (!isPlainObject(raw) || typeof raw.namespace !== "string" || !isPlainObject(raw.keys)) {
    throw new SettingsError(`${where} must be { "namespace": "…", "keys": { … } }`);
  }
  return defineSettings(raw.namespace, raw.keys as { [key: string]: SettingSpec });
}
