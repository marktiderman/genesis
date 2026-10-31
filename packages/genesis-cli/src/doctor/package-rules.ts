/**
 * Package rules: what each Genesis package enforces, declared by the package
 * itself in its package.json under `genesis.doctor`, and found by the doctor
 * in every installed `@marktiderman/genesis-*` package and every local package
 * (genesis.config.json `localPackages`). A new package enforces its own
 * primitives with no app config.
 *
 *   "genesis": {
 *     "doctor": {
 *       "prefer": [{
 *         "id": "lists-use-resource-view",
 *         "need": "a list screen",
 *         "level": "warn",
 *         "files": ["**\/*.tsx"],
 *         "forbid": { "jsx": ["DataTable"], "imports": ["…"], "pattern": "…" },
 *         "unless": { "renders": ["ResourceView"] },
 *         "use": "defineView + <ResourceView>",
 *         "import": "@marktiderman/genesis-ui/data",
 *         "docs": "https://…",
 *         "why": "…"
 *       }],
 *       "primitives": [{ "need": "dates", "use": "dayIn(zone)", "import": "…", "docs": "…" }],
 *       "plugin": "./dist/doctor-rules.js"
 *     }
 *   }
 *
 * A package with nothing to enforce says so: `"doctor": { "enforce": false, "reason": "…" }`
 * (it may still list `primitives` for the catalog). `"doctor": "./doctor.json"` points at a file in
 * the package holding the same object.
 *
 * Rule ids are namespaced by package (`ui/lists-use-resource-view`), so `rules`, `allow`,
 * `ratchet` and `stale-exception` treat them like any built-in.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import { installedGenesis } from "../blocks/discover.js";
import { inside } from "../blocks/files.js";
import { localPackages } from "../blocks/local.js";
import { globMatcher } from "./glob.js";
import { overlayState } from "./overlays.js";
import { loadPlugins } from "./plugins.js";
import { routesDir } from "./routes.js";
import { lineAt } from "./scan.js";
import { localImportedNames } from "./source.js";
import { importSpecifiers } from "./rules.js";
import type { DeclaringPackage, DoctorContext, DoctorPlugin, FindingInput, Level, PackageDeclaration, PackageRuleSetting, PreferRule, PrimitiveEntry, SourceFile } from "./types.js";

export type { DeclaringPackage, PackageDeclaration, PreferRule, PrimitiveEntry } from "./types.js";

export class PackageDeclarationError extends Error {
  override name = "PackageDeclarationError";
}

const GENESIS = /^@marktiderman\/genesis(?:-([a-z0-9-]+))?$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const LEVELS = new Set(["error", "warn", "info"]);
const PREFER_KEYS = new Set(["id", "need", "level", "platform", "files", "exclude", "forbid", "unless", "use", "import", "docs", "why", "newOnly"]);
const FORBID_KEYS = new Set(["jsx", "imports", "pattern"]);
const UNLESS_KEYS = new Set(["renders", "pattern"]);
const PRIMITIVE_KEYS = new Set(["need", "use", "import", "docs"]);
const DECLARATION_KEYS = new Set(["enforce", "reason", "prefer", "catalog", "primitives", "plugin", "$comment"]);
const SCRIPT_GLOBS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mts", "**/*.cts", "**/*.mjs", "**/*.cjs"];

/** `ui` for `@marktiderman/genesis-ui`, `genesis` for the umbrella, the full name for anything else. */
export function ruleNamespace(packageName: string): string {
  const m = GENESIS.exec(packageName);
  if (m) return m[1] ?? "genesis";
  return packageName;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim() !== "");

/** `(?i)` at the start means case-insensitive, as in app pattern rules. */
export function toRegExp(source: string, flags = ""): RegExp {
  if (source.startsWith("(?i)")) return new RegExp(source.slice(4), flags + "i");
  return new RegExp(source, flags);
}

/**
 * Check one package's `genesis.doctor` value and return it normalized. Throws a
 * PackageDeclarationError naming the package and the key that's wrong.
 *
 * With `ignored`, it reads forward-compatibly, as an app's doctor reads installed packages: a
 * package may be newer than this CLI, so an unknown key, or a `prefer` rule or primitive that
 * doesn't validate, is left out and described in `ignored` instead of refusing the declaration.
 */
export function validateDeclaration(raw: unknown, packageName: string, packageDir?: string, ignored?: string[]): PackageDeclaration {
  const fail = (msg: string): never => {
    throw new PackageDeclarationError(`${packageName}: genesis.doctor ${msg}`);
  };
  const unknownKey = (where: string, key: string, known?: Set<string>) => {
    const msg = `${where ? `${where} ` : ""}has an unknown key "${key}"${known ? ` (known: ${[...known].filter((k) => k !== "$comment").join(", ")})` : ""}`;
    if (!ignored) return fail(msg);
    ignored.push(`${packageName}: genesis.doctor ${msg}; ignored`);
  };
  // One rule or primitive that doesn't validate is left out on its own when reading leniently.
  const each = <T>(list: unknown[], check: (item: unknown, i: number) => T): T[] =>
    list.flatMap((item, i) => {
      if (!ignored) return [check(item, i)];
      try {
        return [check(item, i)];
      } catch (err) {
        if (!(err instanceof PackageDeclarationError)) throw err;
        ignored.push(`${err.message}; that entry is skipped`);
        return [];
      }
    });
  if (typeof raw === "string") {
    if (!packageDir) fail(`points at ${raw}, but the package folder is unknown`);
    const file = path.resolve(packageDir!, raw);
    if (!inside(packageDir!, file)) fail(`points outside the package (${raw})`);
    if (!existsSync(file)) fail(`points at ${raw}, which doesn't exist (is it in package.json "files"?)`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      return fail(`file ${raw} is not valid JSON: ${(err as Error).message}`);
    }
    return validateDeclaration(parsed, packageName, packageDir, ignored);
  }
  if (raw === false) fail(`is false; say why with { "enforce": false, "reason": "…" }`);
  if (!isObject(raw)) fail(`must be an object (or a path to a JSON file in the package)`);
  const c = raw as Record<string, unknown>;
  for (const key of Object.keys(c)) if (!DECLARATION_KEYS.has(key)) unknownKey("", key, DECLARATION_KEYS);
  const enforce = c.enforce === undefined ? true : c.enforce;
  if (typeof enforce !== "boolean") fail(`enforce must be true or false`);
  if (c.reason !== undefined && (typeof c.reason !== "string" || !c.reason.trim())) fail(`reason must be a sentence`);
  const prefer = c.prefer === undefined ? [] : c.prefer;
  if (!Array.isArray(prefer)) fail(`prefer must be a list`);
  // `catalog` is the name; `primitives` is its deprecated name, read until the next major.
  if (c.catalog !== undefined && c.primitives !== undefined) fail(`declares both catalog and primitives; keep catalog (primitives is its old name)`);
  const listKey = c.catalog !== undefined ? "catalog" : "primitives";
  const primitives = c[listKey] === undefined ? [] : c[listKey];
  if (!Array.isArray(primitives)) fail(`${listKey} must be a list`);
  if (c.plugin !== undefined && (typeof c.plugin !== "string" || !c.plugin.trim())) fail(`plugin must be a module path inside the package`);
  if (!enforce) {
    if (typeof c.reason !== "string") fail(`turns enforcement off without a reason; add "reason"`);
    if ((prefer as unknown[]).length || c.plugin) fail(`turns enforcement off but declares rules; drop "enforce": false or the rules`);
  } else if (!(prefer as unknown[]).length && !c.plugin) {
    fail(`declares no rules; add "prefer" rules or a "plugin", or say { "enforce": false, "reason": "…" }`);
  }
  const ids = new Set<string>();
  const rules = each(prefer as unknown[], (r, i) => validatePrefer(r, `prefer[${i}]`, fail, unknownKey));
  for (const r of rules) {
    if (ids.has(r.id)) fail(`defines the rule "${r.id}" twice`);
    ids.add(r.id);
  }
  const entries = each(primitives as unknown[], (p, i) => {
    const where = `${listKey}[${i}]`;
    if (!isObject(p)) return fail(`${where} must be an object`);
    for (const key of Object.keys(p)) if (!PRIMITIVE_KEYS.has(key)) unknownKey(where, key);
    for (const key of ["need", "use"]) if (typeof p[key] !== "string" || !(p[key] as string).trim()) fail(`${where} needs "${key}"`);
    for (const key of ["import", "docs"]) if (p[key] !== undefined && typeof p[key] !== "string") fail(`${where}.${key} must be a string`);
    return p as unknown as PrimitiveEntry;
  });
  let plugin: string | undefined;
  if (typeof c.plugin === "string") {
    if (!packageDir) plugin = c.plugin;
    else {
      plugin = path.resolve(packageDir, c.plugin);
      if (!inside(packageDir, plugin)) fail(`plugin points outside the package (${c.plugin})`);
    }
  }
  return {
    enforce: enforce as boolean,
    ...(typeof c.reason === "string" ? { reason: c.reason } : {}),
    prefer: rules,
    primitives: entries,
    ...(plugin ? { plugin } : {}),
  };
}

/**
 * An unknown key at the rule's level or in `unless` may narrow where the rule applies (`onlyIn`, an
 * exemption), so a rule that has one is skipped whole rather than run wider than its package meant.
 * An unknown key in `forbid` is only dropped: running without it forbids less, never more.
 */
function validatePrefer(raw: unknown, where: string, fail: (msg: string) => never, unknownKey: (where: string, key: string) => void): PreferRule {
  if (!isObject(raw)) return fail(`${where} must be an object`);
  const narrowing = (at: string, key: string, known: Set<string>) => fail(`${at} has an unknown key "${key}" (known: ${[...known].join(", ")})`);
  for (const key of Object.keys(raw)) if (!PREFER_KEYS.has(key)) narrowing(where, key, PREFER_KEYS);
  if (typeof raw.id !== "string" || !ID.test(raw.id)) fail(`${where} needs an "id" of lower-case words and dashes`);
  const at = `${where} (${raw.id as string})`;
  for (const key of ["use", "why"]) if (typeof raw[key] !== "string" || !(raw[key] as string).trim()) fail(`${at} needs "${key}"`);
  for (const key of ["need", "import", "docs"]) if (raw[key] !== undefined && typeof raw[key] !== "string") fail(`${at}.${key} must be a string`);
  if (raw.level !== undefined && !LEVELS.has(raw.level as string)) fail(`${at}.level must be "error", "warn" or "info"`);
  if (raw.platform !== undefined && raw.platform !== "web" && raw.platform !== "native") fail(`${at}.platform must be "web" or "native"`);
  if (raw.newOnly !== undefined && typeof raw.newOnly !== "boolean") fail(`${at}.newOnly must be true or false`);
  for (const key of ["files", "exclude"]) if (raw[key] !== undefined && !isStringList(raw[key])) fail(`${at}.${key} must be a list of globs`);
  if (!isObject(raw.forbid)) fail(`${at} needs "forbid": { jsx?, imports?, pattern? }`);
  const forbid = raw.forbid as Record<string, unknown>;
  for (const key of Object.keys(forbid)) if (!FORBID_KEYS.has(key)) unknownKey(`${at}.forbid`, key);
  if (!forbid.jsx && !forbid.imports && !forbid.pattern) fail(`${at}.forbid needs jsx, imports or pattern`);
  if (forbid.jsx !== undefined && !(isStringList(forbid.jsx) && forbid.jsx.every((n) => /^[A-Z][\w.]*$/.test(n)))) fail(`${at}.forbid.jsx must be a list of component names`);
  if (forbid.imports !== undefined && !isStringList(forbid.imports)) fail(`${at}.forbid.imports must be a list of import specifiers`);
  if (forbid.pattern !== undefined) checkPattern(forbid.pattern, `${at}.forbid.pattern`, fail);
  if (raw.unless !== undefined) {
    if (!isObject(raw.unless)) fail(`${at}.unless must be an object`);
    const unless = raw.unless as Record<string, unknown>;
    for (const key of Object.keys(unless)) if (!UNLESS_KEYS.has(key)) narrowing(`${at}.unless`, key, UNLESS_KEYS);
    if (unless.renders !== undefined && !isStringList(unless.renders)) fail(`${at}.unless.renders must be a list of component names`);
    if (unless.pattern !== undefined) checkPattern(unless.pattern, `${at}.unless.pattern`, fail);
  }
  return raw as unknown as PreferRule;
}

function checkPattern(v: unknown, where: string, fail: (msg: string) => never): void {
  if (typeof v !== "string" || !v) fail(`${where} must be a regular expression`);
  try {
    toRegExp(v as string, "g");
  } catch (err) {
    fail(`${where} is not a valid regular expression: ${(err as Error).message}`);
  }
}

interface ManifestJson {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  genesis?: { doctor?: unknown; overlay?: unknown };
}

const discoveryCache = new Map<string, DeclaringPackage>();

/** One package folder's declaration, cached on its package.json's mtime (the dev server re-runs the doctor often). */
export function readDeclaringPackage(dir: string, local: boolean): DeclaringPackage | null {
  const file = path.join(dir, "package.json");
  let stamp: string;
  let real: string;
  try {
    real = realpathSync(dir);
    stamp = `${real}\n${statSync(file).mtimeMs}\n${local}`;
  } catch {
    return null;
  }
  const hit = discoveryCache.get(stamp);
  if (hit) return hit;
  let json: ManifestJson;
  try {
    json = JSON.parse(readFileSync(file, "utf8")) as ManifestJson;
  } catch {
    return null;
  }
  if (typeof json.name !== "string" || !json.name) return null;
  const pkg: DeclaringPackage = {
    name: json.name,
    version: typeof json.version === "string" ? json.version : "0.0.0",
    dir: path.resolve(dir),
    namespace: ruleNamespace(json.name),
    local,
    private: json.private === true,
    declaration: null,
  };
  if (local) {
    const state = overlayState(json.name, json);
    if (state.kind === "marked") pkg.overlay = state.marker;
  }
  const raw = json.genesis?.doctor;
  if (raw !== undefined) {
    const ignored: string[] = [];
    try {
      pkg.declaration = validateDeclaration(raw, json.name, path.resolve(dir), ignored);
      if (ignored.length) pkg.ignored = ignored;
    } catch (err) {
      pkg.error = (err as Error).message;
    }
  }
  discoveryCache.set(stamp, pkg);
  return pkg;
}

/**
 * Every package whose rules apply to the app: the installed Genesis packages
 * (and the Genesis packages installed beside them, for an isolated install), and the app's local packages (a local package wins over an installed one
 * of the same name). Sorted by name.
 */
export function discoverPackages(root: string): DeclaringPackage[] {
  const byName = new Map<string, DeclaringPackage>();
  const installed = [...installedGenesis(root).values()];
  for (const dir of installed) {
    const pkg = readDeclaringPackage(dir, false);
    if (pkg) byName.set(pkg.name, pkg);
  }
  // An isolated install (pnpm) keeps a package's own dependencies beside its real folder, not in the
  // app's node_modules: an app on the umbrella package alone still gets the rules of what it re-exports.
  for (const dir of installed) {
    let scope: string;
    try {
      scope = path.dirname(realpathSync(dir));
    } catch {
      continue;
    }
    if (path.basename(scope) !== "@marktiderman" || !existsSync(scope)) continue;
    for (const entry of readdirSync(scope)) {
      if (byName.has(`@marktiderman/${entry}`) || !GENESIS.test(`@marktiderman/${entry}`)) continue;
      const pkg = readDeclaringPackage(path.join(scope, entry), false);
      if (pkg) byName.set(pkg.name, pkg);
    }
  }
  let local: ReturnType<typeof localPackages> = [];
  try {
    local = localPackages(root);
  } catch {
    // A broken localPackages setting is the packages pack's to report.
  }
  for (const l of local) {
    const pkg = readDeclaringPackage(l.dir, true);
    if (pkg) byName.set(pkg.name, pkg);
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Forget what was read (tests). */
export function clearPackageRulesCache(): void {
  discoveryCache.clear();
}

/** A package rule with its namespaced id and the package it came from. */
export interface ResolvedPreferRule extends PreferRule {
  /** `ui/lists-use-resource-view`. */
  ruleId: string;
  package: string;
  packageDir: string;
}

/** The prefer rules of every package that declares any. */
export function preferRules(packages: readonly DeclaringPackage[]): ResolvedPreferRule[] {
  return packages.flatMap((p) =>
    (p.declaration?.prefer ?? []).map((r) => ({ ...r, ruleId: `${p.namespace}/${r.id}`, package: p.name, packageDir: p.dir })),
  );
}

interface CompiledPrefer {
  rule: ResolvedPreferRule;
  level: Level;
  includes: (p: string) => boolean;
  excludes: (p: string) => boolean;
  jsx: Set<string>;
  imports: Array<(spec: string) => boolean>;
  pattern?: RegExp;
  unlessRenders: Set<string>;
  unlessPattern?: RegExp;
}

const specMatcher = (s: string) => (s.endsWith("*") ? (spec: string) => spec.startsWith(s.slice(0, -1)) : (spec: string) => spec === s);

function compile(rule: ResolvedPreferRule, setting: PackageRuleSetting | undefined, routes: string | null): CompiledPrefer | null {
  const expand = (globs: string[]) =>
    globs.flatMap((g) => {
      if (!g.includes("{routes}")) return [g];
      return routes ? [g.replaceAll("{routes}", routes)] : [];
    });
  const files = expand(setting?.files ?? rule.files ?? SCRIPT_GLOBS);
  if (files.length === 0) return null;
  return {
    rule,
    level: rule.level ?? "warn",
    includes: globMatcher(files),
    excludes: globMatcher(expand(setting?.exclude ?? rule.exclude ?? [])),
    jsx: new Set(rule.forbid.jsx ?? []),
    imports: (rule.forbid.imports ?? []).map(specMatcher),
    ...(rule.forbid.pattern ? { pattern: toRegExp(rule.forbid.pattern, "g") } : {}),
    unlessRenders: new Set(rule.unless?.renders ?? []),
    ...(rule.unless?.pattern ? { unlessPattern: toRegExp(rule.unless.pattern) } : {}),
  };
}

const JSX = new Set([".tsx", ".jsx"]);
/** A JSX element's name: `<Name …>`, `<Name/>`, or with type arguments `<Name<T> …>`. Not a generic after an identifier (`useState<Card>`). */
const ELEMENT = /(?<![\w$.])<([A-Z][\w.]*)(?=[\s>/<])/g;
const SCRIPT = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

/** The message a prefer finding carries: what it found, what to use, where, and the docs. */
function messageFor(rule: ResolvedPreferRule, found: string): string {
  const from = rule.import ? ` (${rule.import})` : "";
  const docs = rule.docs ? ` See ${rule.docs}` : "";
  return `${found}; use ${rule.use}${from}. ${rule.why}${docs}`;
}

/** A top-level declaration (at the start of a line): whether it is exported, and its name. */
const TOP_LEVEL = /^(export\s+(default\s+)?)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/gm;
/** `export { A, B as C }` without `from`: names exported after their declaration. */
const EXPORT_LIST = /\bexport\s*\{([^}]*)\}(?!\s*from)/g;
/** `export default A;`: a component declared first and default-exported by name. */
const EXPORT_DEFAULT_NAME = /^export\s+default\s+([A-Z][\w$]*)\s*;?\s*$/gm;

/**
 * The components a file exports whose own declaration renders a forbidden element, keyed by the
 * name they are imported under (`default` for the default export). A declaration runs from its
 * line to the next top-level declaration, so a sibling export that doesn't render it isn't one.
 */
function wrappersIn(file: SourceFile, elements: RegExpMatchArray[], c: CompiledPrefer): Map<string, string> {
  const out = new Map<string, string>();
  const decls = [...file.code.matchAll(TOP_LEVEL)];
  const listed = new Map<string, string[]>();
  for (const m of file.code.matchAll(EXPORT_LIST)) {
    for (const part of m[1]!.split(",")) {
      const [local, exported] = part.trim().split(/\s+as\s+/);
      if (local) listed.set(local, [...(listed.get(local) ?? []), exported ?? local]);
    }
  }
  for (const m of file.code.matchAll(EXPORT_DEFAULT_NAME)) listed.set(m[1]!, [...(listed.get(m[1]!) ?? []), "default"]);
  decls.forEach((d, i) => {
    const name = d[3]!;
    if (!/^[A-Z]/.test(name) || c.jsx.has(name)) return;
    const end = decls[i + 1]?.index ?? file.code.length;
    const hit = elements.find((m) => m.index! > d.index! && m.index! < end && c.jsx.has(m[1]!));
    if (!hit) return;
    const names = [...(d[1] ? [d[2] ? "default" : name] : []), ...(listed.get(name) ?? [])];
    for (const n of names) out.set(n, hit[1]!);
  });
  return out;
}

/**
 * Run one compiled rule over the scanned files. A forbidden element counts
 * where it is rendered and, one level up, wherever an app component that
 * renders it is used: a local wrapper (`RecordTable` around `DataTable`) is
 * flagged once, and every screen that imports and renders the wrapper is flagged too.
 */
function runPrefer(ctx: DoctorContext, c: CompiledPrefer): void {
  const own = c.rule.packageDir;
  const checked = ctx.files.filter((file) => SCRIPT.has(file.ext) && c.includes(file.path) && !c.excludes(file.path) && !inside(own, file.absolutePath));
  const exempt = (file: SourceFile, rendered: string[]) => rendered.some((n) => c.unlessRenders.has(n)) || (c.unlessPattern?.test(file.code) ?? false);
  // Wrappers, by file: exported components whose own body renders a forbidden element, in files that aren't exempt.
  const wrappers = new Map<string, Map<string, string>>();
  const renderedBy = new Map<SourceFile, RegExpMatchArray[]>();
  for (const file of checked) {
    if (!JSX.has(file.ext)) continue;
    const elements = [...file.code.matchAll(ELEMENT)];
    renderedBy.set(file, elements);
    if (!c.jsx.size || exempt(file, elements.map((m) => m[1]!))) continue;
    const found = wrappersIn(file, elements, c);
    if (found.size) wrappers.set(file.absolutePath, found);
  }
  for (const file of checked) {
    const elements = renderedBy.get(file) ?? [];
    if (exempt(file, elements.map((m) => m[1]!))) continue;
    const report = (line: number, subject: string, found: string) =>
      ctx.report({ rule: c.rule.ruleId, level: c.level, file: file.path, line, subject, message: messageFor(c.rule, found) });
    const imported = wrappers.size && elements.length ? localImportedNames(ctx.root, file) : null;
    for (const m of elements) {
      const name = m[1]!;
      if (c.jsx.has(name)) {
        report(lineAt(file.code, m.index!), name, `renders <${name}>`);
        continue;
      }
      const from = imported?.get(name.split(".")[0]!);
      const around = from && !name.includes(".") ? wrappers.get(from.file)?.get(from.name) : undefined;
      if (around) report(lineAt(file.code, m.index!), name, `renders <${name}>, an app wrapper around <${around}>`);
    }
    if (c.imports.length) {
      for (const { specifier, line } of importSpecifiers(file)) {
        if (c.imports.some((t) => t(specifier))) report(line, specifier, `imports ${specifier}`);
      }
    }
    if (c.pattern) {
      c.pattern.lastIndex = 0;
      for (const m of file.code.matchAll(c.pattern)) {
        const text = m[0].trim().replace(/\s+/g, " ").slice(0, 60);
        report(lineAt(file.code, m.index!), text, `has ${text}`);
      }
    }
  }
}

const isNative = (ctx: Pick<DoctorContext, "config">) => ctx.config.packs?.includes("native") ?? false;

/**
 * The doctor plugin for every package's rules: invalid declarations as
 * `package-rules-invalid`, prefer rules, then each package's own plugin module
 * (its findings namespaced like its prefer rules). `package-rules-invalid` is a
 * warning: a package newer than this CLI (or a broken one) must never fail an
 * app's build; what it can't read is skipped and said.
 */
export async function packageRulesPlugins(packages: readonly DeclaringPackage[]): Promise<DoctorPlugin[]> {
  const out: DoctorPlugin[] = [
    {
      name: "package-rules",
      check(ctx) {
        for (const p of packages) {
          const at = { rule: "package-rules-invalid", level: "warn", file: `${p.name}/package.json`, subject: p.name } as const;
          if (p.error) ctx.report({ ...at, message: `${p.error}; its rules don't run` });
          for (const note of p.ignored ?? []) ctx.report({ ...at, message: `${note} (a newer @marktiderman/genesis-cli may read it)` });
        }
        const routes = routesDir(ctx);
        const settings = ctx.config.packageRules ?? {};
        for (const rule of preferRules(packages)) {
          if (rule.platform === "web" && isNative(ctx)) continue;
          if (rule.platform === "native" && !isNative(ctx)) continue;
          const compiled = compile(rule, settings[rule.ruleId], routes);
          if (compiled) runPrefer(ctx, compiled);
        }
      },
    },
  ];
  for (const p of packages) {
    const file = p.declaration?.plugin;
    if (!file) continue;
    let loaded: DoctorPlugin[];
    try {
      loaded = await loadPlugins([file], p.dir);
    } catch (err) {
      const message = (err as Error).message;
      out.push({ name: `${p.name} plugin`, check: (ctx) => ctx.report({ rule: "package-rules-invalid", level: "warn", file: `${p.name}/package.json`, subject: p.name, message }) });
      continue;
    }
    for (const plugin of loaded) {
      out.push({
        name: `${p.namespace}/${plugin.name}`,
        check: (ctx) =>
          plugin.check({
            ...ctx,
            report: (f) => ctx.report({ ...f, rule: f.rule.startsWith(`${p.namespace}/`) ? f.rule : `${p.namespace}/${f.rule}` }),
          }),
      });
    }
  }
  return out;
}

/**
 * `packageRules` entries that name no rule: not a prefer rule of any package, not reported this run,
 * and not in the namespace of a package with a plugin (whose ids aren't known until it reports).
 * A typo there would otherwise change nothing, silently.
 */
export function unknownPackageRuleSettings(config: DoctorContext["config"], packages: readonly DeclaringPackage[], reported: readonly { rule: string }[]): FindingInput[] {
  const known = new Set([...packageRuleIds(packages), ...reported.map((f) => f.rule)]);
  const plugins = packages.filter((p) => p.declaration?.plugin).map((p) => `${p.namespace}/`);
  return Object.keys(config.packageRules ?? {})
    .filter((id) => !known.has(id) && !plugins.some((ns) => id.startsWith(ns)))
    .map((id) => ({
      rule: "stale-exception",
      level: "warn",
      file: "genesis config",
      subject: id,
      message: `packageRules names ${id}, which no installed package declares; check the id (genesis catalog lists them) or remove it`,
    }));
}

/** The ids of every rule a set of packages declares (prefer rules; plugin rules aren't known until they run). */
export function packageRuleIds(packages: readonly DeclaringPackage[]): Set<string> {
  return new Set(preferRules(packages).map((r) => r.ruleId));
}
