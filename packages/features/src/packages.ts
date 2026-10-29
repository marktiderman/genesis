/**
 * Package layers: where each Genesis package sits, read from its package.json
 * (`"genesis": { "layer", "group", "essential", "module" }`), and the rule
 * that keeps dependencies pointing down (docs/PACKAGE-STRATEGY.md, "Layers").
 *
 * - **foundation**: what every app needs (design-system, core, ui, ui-native,
 *   features). Depends only on other foundation packages.
 * - **primitive**: a capability an app or module composes (data, AI, forms,
 *   collaboration, the native and extension shells). Depends on foundation
 *   and other primitives.
 * - **module**: a mini app a person installs and switches on per tenant
 *   (sites, support, product), built from its blocks. Depends on foundation,
 *   primitives, and only the modules it lists in `module.requiresModules`.
 * - **tooling**: the CLI and agent docs. May use anything; no runtime
 *   package imports it, nor a package's `toolingEntries`.
 *
 * Plain data and string problems, with no zod and no I/O: the repo's check
 * (`scripts/check-package-layers.mjs`) reads the workspace and calls
 * {@link packageLayerProblems}.
 */
import { cycleProblems } from "./graph";

/**
 * The package layers, bottom to top, with tooling beside them.
 *
 * @stability Beta
 */
export const PACKAGE_LAYERS = ["foundation", "primitive", "module", "tooling"] as const;
/** @stability Beta */
export type PackageLayer = (typeof PACKAGE_LAYERS)[number];

/**
 * Where a package appears on the site and in Storybook. `modules` holds every module.
 *
 * @stability Beta
 */
export const PACKAGE_GROUPS = ["core", "data", "ai", "forms", "collaboration", "shells", "modules"] as const;
/** @stability Beta */
export type PackageGroup = (typeof PACKAGE_GROUPS)[number];

/**
 * A module's card and install contract. It points at the package's blocks
 * (`genesis.blocks`), which hold the migrations, routes, nav and settings;
 * it never copies them. Which plan unlocks a module is the app's decision,
 * in its own features.ts, so there is no plan here.
 *
 * @stability Beta
 */
export interface ModuleMeta {
  /** The module's name on its card: `Sites`. */
  name: string;
  /** One sentence: what a tenant gets. */
  summary: string;
  /** Ids in this package's `genesis.blocks`, in install order. At least one. */
  blocks: readonly string[];
  /** Other modules (package names) it builds on: the only module-to-module dependencies allowed. */
  requiresModules?: readonly string[];
  /** The Postgres schema it owns, when it has tables. */
  schema?: string;
  /** How to add it: `genesis add <block>`, naming one of its own blocks (the others add the same way). */
  install: string;
  /** Its guide: a path in the package, or an https URL. */
  docs: string;
  /** Its agent skill: a `SKILL.md` path in the package. */
  skill: string;
}

/**
 * The `genesis` key of a package's package.json, as far as layers go (it also
 * holds `blocks` and `doctor`).
 *
 * @stability Beta
 */
export interface PackageMeta {
  layer: PackageLayer;
  group: PackageGroup;
  /** One of the packages every app starts with, badged on the site. Foundation or tooling only. */
  essential?: boolean;
  /** Present on a module, and only on a module. */
  module?: ModuleMeta;
  /** Entry points (`./node`) that are tooling inside a runtime package: no runtime package imports them. */
  toolingEntries?: readonly string[];
  /** Who reviews changes to it: a GitHub handle (`@octocat`) or team (`@acme/web`). Generates CODEOWNERS. */
  owner?: string;
}

/**
 * One workspace package, as the layering check reads it.
 *
 * @stability Beta
 */
export interface LayerPackage {
  /** The npm name. */
  name: string;
  /** Its package.json `genesis` value, unchecked. */
  genesis: unknown;
  /** Its package.json `exports` keys, when it has them. */
  exports?: readonly string[];
  /**
   * What it uses: dependency and peer dependency names, and the specifiers
   * its source imports (`@marktiderman/genesis-ui/data`). Anything that is
   * not another package of the set is ignored.
   */
  uses: readonly string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);
const PG_NAME = /^[a-z_][a-z0-9_]*$/;
const MODULE_KEYS = new Set(["name", "summary", "blocks", "requiresModules", "schema", "install", "docs", "skill"]);

/**
 * A package's layer metadata, or null when it has none valid. Problems go in
 * `problems`, each prefixed with the package name.
 *
 * @stability Beta
 */
export function readPackageMeta(name: string, genesis: unknown, problems: string[] = [], exportsKeys?: readonly string[]): PackageMeta | null {
  const at = `${name} genesis`;
  if (!isObject(genesis)) {
    problems.push(`${at}: missing; every package declares "genesis": { "layer", "group" }`);
    return null;
  }
  const before = problems.length;
  const { layer, group, essential, module, toolingEntries, owner } = genesis;
  if (owner !== undefined && (typeof owner !== "string" || !/^@[A-Za-z0-9-]+(\/[A-Za-z0-9._-]+)?$/.test(owner))) {
    problems.push(`${at}.owner: must be a GitHub handle or team, like "@octocat" or "@acme/web"`);
  }
  if (!(PACKAGE_LAYERS as readonly unknown[]).includes(layer)) problems.push(`${at}.layer: must be one of ${PACKAGE_LAYERS.join(", ")}, not ${JSON.stringify(layer)}`);
  if (!(PACKAGE_GROUPS as readonly unknown[]).includes(group)) problems.push(`${at}.group: must be one of ${PACKAGE_GROUPS.join(", ")}, not ${JSON.stringify(group)}`);
  if (essential !== undefined && typeof essential !== "boolean") problems.push(`${at}.essential: must be true or false`);
  if (essential === true && layer !== "foundation" && layer !== "tooling") problems.push(`${at}.essential: only a foundation or tooling package is essential, not a ${String(layer)}`);
  if ((layer === "module") !== (group === "modules")) problems.push(`${at}.group: a module is in the "modules" group, and only a module is`);
  if (layer === "module" && module === undefined) problems.push(`${at}.module: a module declares its card and install (name, summary, blocks, install, docs, skill)`);
  if (layer !== "module" && module !== undefined) problems.push(`${at}.module: only a package with layer "module" has one`);
  if (module !== undefined) moduleProblems(at, genesis, module, problems);
  if (toolingEntries !== undefined) {
    if (!isTextList(toolingEntries) || toolingEntries.some((e) => !e.startsWith("./"))) problems.push(`${at}.toolingEntries: must be a list of entry points like "./node"`);
    else if (exportsKeys) for (const e of toolingEntries) if (!exportsKeys.includes(e)) problems.push(`${at}.toolingEntries: "${e}" is not in the package's exports`);
  }
  return problems.length === before ? (genesis as unknown as PackageMeta) : null;
}

function moduleProblems(at: string, genesis: Record<string, unknown>, module: unknown, problems: string[]): void {
  const where = `${at}.module`;
  if (!isObject(module)) {
    problems.push(`${where}: must be an object`);
    return;
  }
  for (const key of Object.keys(module)) if (!MODULE_KEYS.has(key)) problems.push(`${where}.${key}: unknown key (one of ${[...MODULE_KEYS].join(", ")})`);
  for (const key of ["name", "summary", "install", "docs", "skill"] as const) if (!isText(module[key])) problems.push(`${where}.${key}: required text`);
  const declared = isObject(genesis["blocks"]) ? Object.keys(genesis["blocks"]) : [];
  const blocks = module["blocks"];
  if (!isTextList(blocks) || blocks.length === 0) problems.push(`${where}.blocks: list at least one id from genesis.blocks`);
  else for (const id of blocks) if (!declared.includes(id)) problems.push(`${where}.blocks: "${id}" is not in genesis.blocks`);
  const requiresModules = module["requiresModules"];
  if (requiresModules !== undefined && !isTextList(requiresModules)) problems.push(`${where}.requiresModules: must be a list of package names`);
  const schema = module["schema"];
  if (schema !== undefined && !(typeof schema === "string" && PG_NAME.test(schema))) problems.push(`${where}.schema: must be a Postgres schema name`);
  const install = module["install"];
  if (isText(install)) {
    const words = install.trim().split(/\s+/);
    if (words.length !== 3 || words[0] !== "genesis" || words[1] !== "add") problems.push(`${where}.install: must be "genesis add <block>", not ${JSON.stringify(install)}`);
    else if (isTextList(blocks) && !blocks.includes(words[2]!)) problems.push(`${where}.install: "${words[2]}" is not one of the module's blocks`);
  }
  const docs = module["docs"];
  if (isText(docs) && !docs.startsWith("https://") && !isPackagePath(docs)) problems.push(`${where}.docs: a path in the package or an https URL, not ${JSON.stringify(docs)}`);
  const skill = module["skill"];
  if (isText(skill) && !(isPackagePath(skill) && skill.endsWith("SKILL.md"))) problems.push(`${where}.skill: a SKILL.md path in the package, not ${JSON.stringify(skill)}`);
}

/** A plain package-relative path: forward slashes, no `.`/`..`, not absolute. */
function isPackagePath(value: string): boolean {
  if (/[\0\\:]/.test(value) || value.startsWith("/") || value.startsWith("~")) return false;
  return value.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** `@scope/name/sub/path` → `@scope/name`, `name/sub` → `name`. */
function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/**
 * Every layering problem across a set of packages, as strings:
 *
 * 1. each package's metadata is valid ({@link readPackageMeta});
 * 2. what it uses points down: foundation → foundation; primitive →
 *    foundation or primitive; module → foundation, primitive, or a module it
 *    lists in `requiresModules`; tooling → anything; and nothing outside
 *    tooling uses a tooling package or another package's `toolingEntries`;
 * 3. no cycles among the runtime packages.
 *
 * (Every module's docs and skill existing on disk is the caller's to check;
 * schema ownership is a follow-up, `package-schema-ownership`.)
 *
 * @stability Beta
 */
export function packageLayerProblems(packages: readonly LayerPackage[]): string[] {
  const problems: string[] = [];
  const metas = new Map<string, PackageMeta>();
  for (const pkg of packages) {
    const meta = readPackageMeta(pkg.name, pkg.genesis, problems, pkg.exports);
    if (meta) metas.set(pkg.name, meta);
  }
  for (const [name, meta] of metas) {
    for (const req of meta.module?.requiresModules ?? []) {
      if (req === name) problems.push(`${name} genesis.module.requiresModules: a module can't require itself`);
      else if (metas.get(req)?.layer !== "module") problems.push(`${name} genesis.module.requiresModules: "${req}" is not a module`);
    }
  }

  const graph: Record<string, { requires: string[] }> = {};
  for (const pkg of packages) {
    const meta = metas.get(pkg.name);
    if (!meta) continue;
    const edges = new Set<string>();
    for (const spec of new Set(pkg.uses)) {
      const target = packageOf(spec);
      if (target === pkg.name) continue;
      const to = metas.get(target);
      if (!to || meta.layer === "tooling") continue;
      const sub = spec.length > target.length ? `.${spec.slice(target.length)}` : ".";
      if (to.layer === "tooling") problems.push(`${pkg.name} (${meta.layer}) uses ${target}, which is tooling: no runtime package depends on tooling`);
      else if (to.toolingEntries?.includes(sub)) problems.push(`${pkg.name} (${meta.layer}) imports ${spec}, a tooling entry point of ${target}`);
      else if (!allowed(meta, to, target)) problems.push(`${pkg.name} (${meta.layer}) uses ${target} (${to.layer}): ${rule(meta)}`);
      // Only allowed edges go in the cycle search: a wrong-way edge is already reported.
      else edges.add(target);
    }
    if (meta.layer !== "tooling") graph[pkg.name] = { requires: [...edges].sort() };
  }
  for (const cycle of cycleProblems(graph)) problems.push(`dependency cycle:${cycle.slice(cycle.indexOf(": a cycle:") + ": a cycle:".length)}`);
  return problems;
}

function allowed(from: PackageMeta, to: PackageMeta, target: string): boolean {
  switch (from.layer) {
    case "foundation":
      return to.layer === "foundation";
    case "primitive":
      return to.layer === "foundation" || to.layer === "primitive";
    case "module":
      return to.layer !== "module" || (from.module?.requiresModules ?? []).includes(target);
    case "tooling":
      return true;
  }
}

function rule(from: PackageMeta): string {
  switch (from.layer) {
    case "foundation":
      return "a foundation package depends only on foundation packages";
    case "primitive":
      return "a primitive depends only on foundation packages and other primitives (never a module)";
    case "module":
      return "a module depends on another module only when genesis.module.requiresModules lists it";
    default:
      return "";
  }
}
