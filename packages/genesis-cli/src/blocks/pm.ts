/**
 * The app's package manager and the versions Genesis packages install at:
 * the installed umbrella's release manifest (`versions.json`), else the
 * versions released with this CLI.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { readReleaseManifest } from "../doctor/versions.js";
import { readCatalog } from "./discover.js";

export type PackageManager = "pnpm" | "bun" | "yarn" | "npm";

/** The nearest lockfile at or above the app: its package manager and folder (the install root). */
export function findLockfile(root: string): { pm: PackageManager; dir: string } | null {
  let dir = path.resolve(root);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-lock.yaml"))) return { pm: "pnpm", dir };
    if (existsSync(path.join(dir, "bun.lock")) || existsSync(path.join(dir, "bun.lockb"))) return { pm: "bun", dir };
    if (existsSync(path.join(dir, "yarn.lock"))) return { pm: "yarn", dir };
    if (existsSync(path.join(dir, "package-lock.json"))) return { pm: "npm", dir };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** From the nearest lockfile at or above the app; npm when there is none. */
export function detectPackageManager(root: string): PackageManager {
  return findLockfile(root)?.pm ?? "npm";
}

export function addCommand(pm: PackageManager, specs: string[], dev = false): string[] {
  const flag = dev ? ["-D"] : [];
  if (pm === "npm") return ["npm", "install", ...flag, ...specs];
  return [pm, "add", ...flag, ...specs];
}

export function installCommand(pm: PackageManager): string[] {
  return pm === "yarn" ? ["yarn", "install"] : [pm, "install"];
}

/**
 * Collapses packages installed at more than one version where one would do, or null when the
 * package manager has no such command Genesis runs (bun has none; yarn's differs by version).
 */
export function dedupeCommand(pm: PackageManager): string[] | null {
  if (pm === "pnpm") return ["pnpm", "dedupe"];
  if (pm === "npm") return ["npm", "dedupe"];
  return null;
}

/** The version a Genesis package installs at, and where that came from. */
export function pinnedVersion(root: string, name: string): { version: string; from: string } | null {
  const release = readReleaseManifest(root);
  const fromRelease = release?.packages[name] ?? (name === "@marktiderman/genesis" ? release?.version : undefined);
  if (release && fromRelease) return { version: fromRelease, from: `@marktiderman/genesis ${release.version}` };
  const fromCli = readCatalog().packages[name]?.version;
  if (fromCli) return { version: fromCli, from: "this CLI's release" };
  return null;
}

/** Run a command in the app, showing its output. */
export function run(root: string, argv: string[]): void {
  const [cmd, ...args] = argv;
  execFileSync(cmd!, args, { cwd: root, stdio: "inherit" });
}

export const shellLine = (argv: string[]) => argv.map((a) => (/^[\w@./:^~=-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`)).join(" ");
