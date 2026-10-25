/**
 * Finding blocks: in the Genesis packages the app has installed (their
 * package.json manifests and `./blocks` declarations), then in the CLI's
 * catalog of every Genesis package, so a block can be added before its package
 * is installed. Nothing is hard-coded per block: a package that declares one
 * is found.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { buildCatalog, type Catalog } from "./catalog.js";
import { inside } from "./files.js";
import { declarationFields, GENESIS_PACKAGE, isBlockDef, ManifestError, parseManifest, rawBlocksOf, safeRelative, type BlockManifest } from "./manifest.js";

export const CLI_PACKAGE = "@marktiderman/genesis-cli";

/** This CLI's own package folder (dist/.. when built, src/blocks/../.. in tests). */
export function cliPackageDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const file = path.join(dir, "package.json");
    if (existsSync(file) && (JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name === CLI_PACKAGE) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Can't find the genesis-cli package folder.");
    dir = parent;
  }
}

/** The monorepo's packages folder, when this CLI runs from a Genesis checkout. */
export function workspacePackagesDir(): string | null {
  const dir = path.resolve(cliPackageDir(), "..");
  return existsSync(path.join(dir, "features", "package.json")) && existsSync(path.join(dir, "..", "pnpm-workspace.yaml")) ? dir : null;
}

let catalogCache: Catalog | undefined;

/** The catalog built with this CLI; in a Genesis checkout, read live from the workspace. */
export function readCatalog(): Catalog {
  if (catalogCache) return catalogCache;
  const workspace = workspacePackagesDir();
  if (workspace) return (catalogCache = buildCatalog(workspace));
  const file = path.join(cliPackageDir(), "dist", "genesis-catalog.json");
  catalogCache = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Catalog) : { packages: {} };
  return catalogCache;
}

/** Every Genesis package installed for the app (nearest node_modules first), by name. */
export function installedGenesis(root: string): Map<string, string> {
  const found = new Map<string, string>();
  let dir = path.resolve(root);
  for (;;) {
    const scope = path.join(dir, "node_modules", "@marktiderman");
    if (existsSync(scope)) {
      for (const entry of readdirSync(scope)) {
        const name = `@marktiderman/${entry}`;
        if (!GENESIS_PACKAGE.test(name) || found.has(name)) continue;
        if (existsSync(path.join(scope, entry, "package.json"))) found.set(name, path.join(scope, entry));
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return found;
    dir = parent;
  }
}

/** Where a package's files are read from: the app's install, or this CLI itself. */
export function packageDir(root: string, name: string): string | null {
  const installed = installedGenesis(root).get(name);
  if (installed) return installed;
  if (name === CLI_PACKAGE) return cliPackageDir();
  return null;
}

export function packageVersion(dir: string): string | undefined {
  return (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version?: string }).version;
}

/** One package's `./blocks` declarations, when it ships that entry and it loads in Node. */
async function declarationsOf(dir: string, warnings: string[]): Promise<Record<string, Record<string, unknown>>> {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { name: string; exports?: Record<string, unknown> };
  const entry = pkg.exports?.["./blocks"];
  const target = typeof entry === "string" ? entry : entry && typeof entry === "object" ? ((entry as Record<string, unknown>)["import"] ?? (entry as Record<string, unknown>)["default"]) : undefined;
  if (typeof target !== "string") return {};
  const rel = safeRelative(target.replace(/^\.\//, ""));
  const file = rel && path.join(dir, ...rel.split("/"));
  if (!file || !inside(dir, file) || !existsSync(file)) return {};
  try {
    const jiti = createJiti(path.join(dir, "package.json"), { moduleCache: false });
    const mod = (await jiti.import(file)) as Record<string, unknown>;
    const out: Record<string, Record<string, unknown>> = {};
    for (const value of Object.values(mod)) if (isBlockDef(value)) out[value.id] = declarationFields(value);
    return out;
  } catch (err) {
    warnings.push(`${pkg.name}/blocks didn't load in Node (${err instanceof Error ? err.message.split("\n")[0] : String(err)}); using its package.json manifest only.`);
    return {};
  }
}

/** Every block one installed package declares. */
export async function blocksOfInstalled(dir: string, warnings: string[] = []): Promise<BlockManifest[]> {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { name: string; version?: string };
  const raw = rawBlocksOf(pkg);
  const declared = await declarationsOf(dir, warnings);
  const ids = new Set([...Object.keys(raw), ...Object.keys(declared)]);
  const out: BlockManifest[] = [];
  for (const id of [...ids].sort()) {
    const fromJson = (raw[id] ?? {}) as Record<string, unknown>;
    // The declaration is the source of truth for what it says; package.json adds the rest.
    const manifest = tryParse(() => parseManifest(pkg.name, id, { ...fromJson, ...declared[id] }, pkg.version), warnings);
    if (manifest) out.push(manifest);
  }
  return out;
}

export interface FoundBlock {
  manifest: BlockManifest;
  /** Read from the app's installed package, or from the CLI's catalog. */
  from: "installed" | "catalog";
}

/** Every block known: installed packages first, then the catalog for packages the app doesn't have. */
export async function allBlocks(root: string, warnings: string[] = []): Promise<FoundBlock[]> {
  const out: FoundBlock[] = [];
  const installed = installedGenesis(root);
  for (const [, dir] of installed) for (const manifest of await blocksOfInstalled(dir, warnings)) out.push({ manifest, from: "installed" });
  for (const [name, entry] of Object.entries(readCatalog().packages)) {
    if (installed.has(name)) continue;
    for (const [id, raw] of Object.entries(entry.blocks ?? {})) {
      const manifest = tryParse(() => parseManifest(name, id, raw, entry.version), warnings);
      if (manifest) out.push({ manifest, from: "catalog" });
    }
  }
  return out;
}

/** A bad manifest is reported and skipped, so one package's mistake doesn't stop every other block. */
function tryParse(parse: () => BlockManifest, warnings: string[]): BlockManifest | null {
  try {
    return parse();
  } catch (err) {
    if (!(err instanceof ManifestError)) throw err;
    warnings.push(err.message);
    return null;
  }
}

/** One block by id. Two packages declaring the same id is an error. */
export async function findBlock(root: string, id: string, options: { package?: string; warnings?: string[] } = {}): Promise<FoundBlock> {
  const all = (await allBlocks(root, options.warnings)).filter((b) => b.manifest.id === id && (!options.package || b.manifest.package === options.package));
  if (all.length === 0) {
    const known = [...new Set((await allBlocks(root)).map((b) => b.manifest.id))].sort();
    throw new Error(`No Genesis package declares a block "${id}"${options.package ? ` in ${options.package}` : ""}. Known blocks: ${known.join(", ") || "none"}.`);
  }
  if (all.length > 1) throw new Error(`"${id}" is declared by ${all.map((b) => b.manifest.package).join(" and ")}; pass --package to pick one.`);
  return all[0]!;
}
