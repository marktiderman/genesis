/**
 * Local packages: an app's own workspace packages that Genesis treats like its
 * own. genesis.config.json lists them under `localPackages`, as app-relative
 * folders or folders ending in `/*`:
 *
 *   { "localPackages": ["packages/*"] }
 *
 * A local package declares blocks the same way a Genesis package does (a
 * `genesis.blocks` manifest in package.json and a `./blocks` export), and
 * `genesis add`, `genesis migrate` and `genesis doctor` read them beside the
 * installed Genesis packages. Nothing is installed or published: the package
 * lives in the app's repository.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import { inside } from "./files.js";

export const LOCAL_PACKAGES_KEY = "localPackages";

/** One local package. */
export interface LocalPackage {
  name: string;
  /** Absolute folder. */
  dir: string;
  /** App-relative folder, POSIX form. */
  rel: string;
  version?: string;
}

/** A local-packages entry that can't be used. */
export class LocalPackagesError extends Error {
  override name = "LocalPackagesError";
}

/** The `localPackages` globs, validated: app-relative folders, optionally ending in `/*`. */
export function validateLocalPackages(raw: unknown, source = "genesis.config.json"): string[] {
  if (!Array.isArray(raw)) throw new LocalPackagesError(`${source}: ${LOCAL_PACKAGES_KEY} must be a list of folders`);
  return raw.map((entry, i) => {
    const where = `${source}: ${LOCAL_PACKAGES_KEY}[${i}]`;
    if (typeof entry !== "string" || !entry.trim()) throw new LocalPackagesError(`${where} must be a non-empty folder`);
    if (path.isAbsolute(entry) || /^[A-Za-z]:[\\/]/.test(entry)) throw new LocalPackagesError(`${where} must be relative to the app ("${entry}")`);
    const norm = path.posix.normalize(entry.replace(/\\/g, "/")).replace(/\/+$/, "");
    if (norm === "." || norm === ".." || norm.startsWith("../")) throw new LocalPackagesError(`${where} must be a folder inside the app ("${entry}")`);
    const parts = norm.split("/");
    if (parts.some((p, k) => p.includes("*") && (p !== "*" || k !== parts.length - 1))) {
      throw new LocalPackagesError(`${where}: only a final "/*" is supported ("${entry}")`);
    }
    if (parts.includes("node_modules")) throw new LocalPackagesError(`${where} can't point into node_modules ("${entry}")`);
    return norm;
  });
}

/** The globs from `<root>/genesis.config.json`, or none. */
export function localPackageGlobs(root: string): string[] {
  const file = path.join(root, "genesis.config.json");
  if (!existsSync(file)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new LocalPackagesError(`${file} is not valid JSON: ${(err as Error).message}`);
  }
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[LOCAL_PACKAGES_KEY] : undefined;
  return value === undefined ? [] : validateLocalPackages(value, file);
}

const cache = new Map<string, LocalPackage[]>();

/**
 * The app's local packages, sorted by folder. A folder without a package.json,
 * or one that resolves outside the app (a symlink), is skipped. Two folders
 * with the same package name is an error.
 */
export function localPackages(root: string): LocalPackage[] {
  const appRoot = path.resolve(root);
  const globs = localPackageGlobs(appRoot);
  const key = `${appRoot}\n${globs.join("\n")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dirs = new Set<string>();
  for (const glob of globs) {
    if (glob.endsWith("/*") || glob === "*") {
      const parent = path.join(appRoot, glob === "*" ? "" : glob.slice(0, -2));
      if (!existsSync(parent) || !statSync(parent).isDirectory()) continue;
      for (const entry of readdirSync(parent).sort()) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        dirs.add(path.join(parent, entry));
      }
    } else {
      dirs.add(path.join(appRoot, glob));
    }
  }
  const real = realpathSync(appRoot);
  const out: LocalPackage[] = [];
  const byName = new Map<string, string>();
  for (const dir of [...dirs].sort()) {
    const manifest = path.join(dir, "package.json");
    if (!existsSync(manifest)) continue;
    if (!inside(real, realpathSync(dir))) continue;
    let pkg: { name?: unknown; version?: unknown };
    try {
      pkg = JSON.parse(readFileSync(manifest, "utf8")) as typeof pkg;
    } catch (err) {
      throw new LocalPackagesError(`${manifest} is not valid JSON: ${(err as Error).message}`);
    }
    if (typeof pkg.name !== "string" || !pkg.name) throw new LocalPackagesError(`${manifest}: a local package needs a name`);
    const rel = path.relative(appRoot, dir).split(path.sep).join("/");
    const other = byName.get(pkg.name);
    if (other) throw new LocalPackagesError(`${other} and ${rel} are both named ${pkg.name}`);
    byName.set(pkg.name, rel);
    out.push({ name: pkg.name, dir, rel, ...(typeof pkg.version === "string" ? { version: pkg.version } : {}) });
  }
  cache.set(key, out);
  return out;
}

/** The names of the app's local packages. */
export function localPackageNames(root: string): Set<string> {
  return new Set(localPackages(root).map((p) => p.name));
}

/** One local package by name, or undefined. */
export function localPackage(root: string, name: string): LocalPackage | undefined {
  return localPackages(root).find((p) => p.name === name);
}

/** Forget what was read (tests, and a long-running process after the config changes). */
export function clearLocalPackagesCache(): void {
  cache.clear();
}
