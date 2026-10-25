/**
 * The CLI's catalog: every Genesis package's version and `genesis.blocks`
 * manifests, copied from the workspace when the CLI is built
 * (`dist/genesis-catalog.json`). It lets `genesis add <block>` find a block's
 * package before that package is installed, and gives the versions that were
 * released together with this CLI.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";

export interface Catalog {
  packages: Record<string, { version: string; blocks?: Record<string, unknown> }>;
}

/** Read every package.json under `packagesDir/*` into a catalog. Used by the build, and by tests in the monorepo. */
export function buildCatalog(packagesDir: string): Catalog {
  const packages: Catalog["packages"] = {};
  for (const dir of readdirSync(packagesDir).sort()) {
    const file = path.join(packagesDir, dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version?: string; private?: boolean; genesis?: { blocks?: Record<string, unknown> } };
    if (!pkg.name || !pkg.version || pkg.private || !pkg.name.startsWith("@marktiderman/genesis")) continue;
    packages[pkg.name] = { version: pkg.version, ...(pkg.genesis?.blocks ? { blocks: pkg.genesis.blocks } : {}) };
  }
  return { packages };
}
