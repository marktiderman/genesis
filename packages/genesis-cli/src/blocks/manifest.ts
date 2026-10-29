/**
 * Block manifests: what `genesis add`, `migrate` and `upgrade` read about a
 * block, from the package that ships it. Two sources, merged:
 *
 * - `package.json` → `"genesis": { "blocks": { "<id>": { … } } }`: plain JSON
 *   the CLI reads without running package code (and the CLI's own catalog
 *   copies, so a block can be found before its package is installed). It holds
 *   what a `defineBlock` declaration can't: the Edge Functions, the packages to
 *   install, the feature entry, an AGENTS.md fragment and the manual steps.
 * - A `./blocks` export of `defineBlock` declarations that runs in Node (no
 *   React Native): its `requires`, `platforms` and `contributes` (migrations,
 *   routes, skills, privacy) are the source of truth when present.
 *
 * Every path in a manifest is package-relative and checked here, before
 * anything reads it: no absolute paths, no `..`, no backslashes.
 */
import { defineBlock, BlockError, FEATURE_PLATFORMS, type BlockDef, type BlockPrivacy, type BlockRoute, type FeaturePlatform } from "@marktiderman/genesis-features/blocks";

/** A Genesis package name: the only packages a manifest may point into. */
export const GENESIS_PACKAGE = /^@marktiderman\/genesis(-[a-z0-9-]+)?$/;
const BLOCK_ID = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
/** `0004_genesis_tenant_features.sql`: a number, then the stem the app's copy is named after. */
export const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const FUNCTION_NAME = /^[a-z0-9][a-z0-9_-]*$/;
const ROUTE = /^\/(?:[A-Za-z0-9_\-[\]().]+\/?)*$/;
const INSTALL_SPEC = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[A-Za-z0-9.^~<>=|* -]+)?$/;
const SECRET = /^[A-Z][A-Z0-9_]*$/;

export interface ManifestMigration {
  /** The package that ships it (a Genesis package). */
  package: string;
  /** Package-relative, e.g. `migrations/0004_genesis_tenant_features.sql`. */
  file: string;
  /** Package-relative pgTAP test. */
  test?: string;
}

export interface ManifestFunction {
  package: string;
  /** Package-relative folder, e.g. `functions/genesis-push-send`; its last segment is the function's name. */
  dir: string;
  /** `false` adds `[functions.<name>] verify_jwt = false` to supabase/config.toml. */
  verifyJwt?: boolean;
  /** The secrets it reads, for the manual steps. */
  secrets?: string[];
}

export interface ManifestFeature {
  name: string;
  summary: string;
  /** The feature's kind (`block` when left out). */
  kind?: string;
  keywords?: string[];
  audience?: string[];
}

export interface BlockManifest {
  id: string;
  /** The package that declares it. */
  package: string;
  /** That package's version, when known. */
  version?: string;
  requires: string[];
  platforms?: FeaturePlatform[];
  /** Genesis packages to install (default: the declaring package). */
  packages: string[];
  /** Other packages to install, with a range: `expo-notifications@~58.1.6`. */
  install: string[];
  migrations: ManifestMigration[];
  functions: ManifestFunction[];
  routes: BlockRoute[];
  /** Package-relative paths to a `SKILL.md`, each with its package. */
  skills: { package: string; path: string }[];
  /** Package-relative Markdown fragment merged into the app's AGENTS.md. */
  agents?: { package: string; path: string };
  feature?: ManifestFeature;
  /** What the person still has to do: secrets, plugin config. */
  steps: string[];
  privacy?: BlockPrivacy;
}

export class ManifestError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid block manifest:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ManifestError";
  }
}

/**
 * A package-relative path that can't leave the package: forward slashes, no
 * `.`/`..` segments, not absolute. Returns null when it isn't one.
 */
export function safeRelative(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 300) return null;
  if (/[\0\\:]/.test(value) || value.startsWith("/") || value.startsWith("~")) return null;
  const segments = value.split("/");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith("-"))) return null;
  return value;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/**
 * Check one raw manifest (from package.json, or merged with a declaration)
 * and return it whole. `home` is the declaring package.
 */
export function parseManifest(home: string, id: string, raw: unknown, version?: string, options: { local?: boolean } = {}): BlockManifest {
  const problems: string[] = [];
  const at = `${home} genesis.blocks.${id}`;
  // The app's own local packages (genesis.config.json `localPackages`) declare blocks too.
  if (!GENESIS_PACKAGE.test(home) && !options.local) problems.push(`${home}: only Genesis packages (@marktiderman/genesis*) and the app's local packages declare blocks`);
  if (!BLOCK_ID.test(id)) problems.push(`${at}: "${id}" is not a feature id`);
  if (!isObject(raw)) throw new ManifestError([...problems, `${at}: must be an object`]);
  const pkgOf = (value: unknown, where: string): string => {
    if (value === undefined) return home;
    if (typeof value !== "string" || !(GENESIS_PACKAGE.test(value) || (options.local && value === home))) {
      problems.push(`${where}: package must be a Genesis package${options.local ? " or this local package" : ""}, not ${JSON.stringify(value)}`);
      return home;
    }
    return value;
  };
  const pathOf = (value: unknown, where: string): string => {
    const safe = safeRelative(value);
    if (!safe) problems.push(`${where}: ${JSON.stringify(value)} is not a plain path inside the package`);
    return safe ?? "";
  };
  const list = (key: string): unknown[] => {
    const v = raw[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      problems.push(`${at}.${key}: must be a list`);
      return [];
    }
    return v;
  };

  const requires = list("requires").filter((r): r is string => {
    const ok = typeof r === "string" && BLOCK_ID.test(r);
    if (!ok) problems.push(`${at}.requires: ${JSON.stringify(r)} is not a feature id`);
    return ok;
  });
  let platforms: FeaturePlatform[] | undefined;
  if (raw["platforms"] !== undefined) {
    platforms = list("platforms").filter((p): p is FeaturePlatform => {
      const ok = typeof p === "string" && (FEATURE_PLATFORMS as readonly string[]).includes(p);
      if (!ok) problems.push(`${at}.platforms: ${JSON.stringify(p)} is not one of ${FEATURE_PLATFORMS.join(", ")}`);
      return ok;
    });
  }
  const packages = list("packages").map((p, i) => pkgOf(p, `${at}.packages[${i}]`));
  const install = list("install").filter((s): s is string => {
    const ok = typeof s === "string" && INSTALL_SPEC.test(s) && !s.startsWith("-");
    if (!ok) problems.push(`${at}.install: ${JSON.stringify(s)} is not a package name with an optional range`);
    return ok;
  });
  const migrations = list("migrations").map((m, i): ManifestMigration => {
    const where = `${at}.migrations[${i}]`;
    if (!isObject(m)) {
      problems.push(`${where}: must be an object`);
      return { package: home, file: "" };
    }
    const file = pathOf(m["file"], `${where}.file`);
    if (file && !MIGRATION_FILE.test(file.split("/").pop()!)) problems.push(`${where}.file: "${file}" must be named NNNN_name.sql (lowercase letters, digits, _)`);
    const out: ManifestMigration = { package: pkgOf(m["package"], where), file };
    if (m["test"] !== undefined) {
      out.test = pathOf(m["test"], `${where}.test`);
      if (out.test && !/^[a-z0-9_]+\.test\.sql$/.test(out.test.split("/").pop()!.replace(/^\d{4}_/, ""))) problems.push(`${where}.test: "${out.test}" must be named [NNNN_]name.test.sql`);
    }
    return out;
  });
  const functions = list("functions").map((f, i): ManifestFunction => {
    const where = `${at}.functions[${i}]`;
    if (!isObject(f)) {
      problems.push(`${where}: must be an object`);
      return { package: home, dir: "" };
    }
    const dir = pathOf(f["dir"], `${where}.dir`);
    if (dir && !FUNCTION_NAME.test(dir.split("/").pop()!)) problems.push(`${where}.dir: the folder's name "${dir.split("/").pop()}" is not a function name`);
    const out: ManifestFunction = { package: pkgOf(f["package"], where), dir };
    if (f["verifyJwt"] !== undefined) {
      if (typeof f["verifyJwt"] !== "boolean") problems.push(`${where}.verifyJwt: must be true or false`);
      else out.verifyJwt = f["verifyJwt"];
    }
    if (f["secrets"] !== undefined) {
      if (!strings(f["secrets"]) || f["secrets"].some((s) => !SECRET.test(s))) problems.push(`${where}.secrets: must be a list of UPPER_CASE names`);
      else out.secrets = f["secrets"];
    }
    return out;
  });
  const routes = list("routes").map((r, i): BlockRoute => {
    const where = `${at}.routes[${i}]`;
    if (!isObject(r) || typeof r["path"] !== "string" || !ROUTE.test(r["path"]) || r["path"].split("/").includes("..")) {
      problems.push(`${where}: needs a path like /settings/notifications`);
      return { path: "/" };
    }
    const out: BlockRoute = { path: r["path"] };
    if (typeof r["description"] === "string") out.description = r["description"];
    if (typeof r["signedIn"] === "boolean") out.signedIn = r["signedIn"];
    return out;
  });
  const skills = list("skills").map((s, i) => {
    if (isObject(s)) return { package: pkgOf(s["package"], `${at}.skills[${i}]`), path: pathOf(s["path"], `${at}.skills[${i}].path`) };
    return { package: home, path: pathOf(s, `${at}.skills[${i}]`) };
  });
  for (const s of skills) if (s.path && !s.path.endsWith("SKILL.md")) problems.push(`${at}.skills: "${s.path}" must point at a SKILL.md`);
  let agents: BlockManifest["agents"];
  if (raw["agents"] !== undefined) {
    const a = raw["agents"];
    agents = isObject(a) ? { package: pkgOf(a["package"], `${at}.agents`), path: pathOf(a["path"], `${at}.agents.path`) } : { package: home, path: pathOf(a, `${at}.agents`) };
    if (agents.path && !agents.path.endsWith(".md")) problems.push(`${at}.agents: "${agents.path}" must be a Markdown file`);
  }
  let feature: ManifestFeature | undefined;
  if (raw["feature"] !== undefined) {
    const f = raw["feature"];
    if (!isObject(f) || typeof f["name"] !== "string" || typeof f["summary"] !== "string") problems.push(`${at}.feature: needs a name and a summary`);
    else {
      feature = { name: f["name"], summary: f["summary"] };
      // `layer` is the deprecated name of `kind`, read until the next major.
      const kind = f["kind"] ?? f["layer"];
      if (typeof kind === "string") feature.kind = kind === "primitive" ? "element" : kind;
      if (strings(f["keywords"])) feature.keywords = f["keywords"];
      if (strings(f["audience"])) feature.audience = f["audience"];
    }
  }
  const steps = list("steps").filter((s): s is string => {
    if (typeof s !== "string") problems.push(`${at}.steps: every step is a sentence`);
    return typeof s === "string";
  });
  const privacy = isObject(raw["privacy"]) ? (raw["privacy"] as BlockPrivacy) : undefined;

  // The registry's own block checks (id, requires, platforms, duplicate routes), so a manifest
  // can't say what a defineBlock declaration couldn't.
  try {
    const def: BlockDef = { id, requires, contributes: { routes, migrations: migrations.filter((m) => m.file), skills: skills.map((s) => s.path).filter(Boolean), ...(privacy ? { privacy } : {}) } };
    if (platforms) (def as { platforms?: FeaturePlatform[] }).platforms = platforms;
    defineBlock(def);
  } catch (err) {
    if (err instanceof BlockError) problems.push(...err.problems.map((p) => `${at}: ${p}`));
    else throw err;
  }
  if (problems.length) throw new ManifestError(problems);
  return {
    id,
    package: home,
    ...(version ? { version } : {}),
    requires,
    ...(platforms ? { platforms } : {}),
    packages: packages.length ? [...new Set(packages)] : [home],
    install,
    migrations,
    functions,
    routes,
    skills,
    ...(agents ? { agents } : {}),
    ...(feature ? { feature } : {}),
    steps,
    ...(privacy ? { privacy } : {}),
  };
}

/** The raw `genesis.blocks` object of a package.json, or `{}`. */
export function rawBlocksOf(packageJson: unknown): Record<string, unknown> {
  if (!isObject(packageJson) || !isObject(packageJson["genesis"])) return {};
  const blocks = packageJson["genesis"]["blocks"];
  return isObject(blocks) ? blocks : {};
}

/**
 * A `defineBlock` declaration as raw manifest fields. Its contributions win
 * over package.json for what both can say; package.json adds the rest.
 */
export function declarationFields(block: BlockDef): Record<string, unknown> {
  const c = block.contributes ?? {};
  return {
    ...(block.requires ? { requires: [...block.requires] } : {}),
    ...(block.platforms ? { platforms: [...block.platforms] } : {}),
    ...(c.migrations ? { migrations: c.migrations.map((m) => ({ ...m })) } : {}),
    ...(c.routes ? { routes: c.routes.map((r) => ({ ...r })) } : {}),
    ...(c.skills ? { skills: [...c.skills] } : {}),
    ...(c.privacy ? { privacy: c.privacy } : {}),
  };
}

/** Is this exported value a block declaration? */
export function isBlockDef(value: unknown): value is BlockDef {
  return isObject(value) && typeof value["id"] === "string" && BLOCK_ID.test(value["id"]) && (value["contributes"] === undefined || isObject(value["contributes"])) && (isObject(value["contributes"]) || Array.isArray(value["requires"]));
}
