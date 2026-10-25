// Dependency-free, so the CLI's build config can use it too.
import { readdirSync, statSync } from "node:fs";
import * as path from "node:path";

/** Starter paths an app never gets: build output, installs, and tests that read the monorepo. */
export const STARTER_EXCLUDE = [
  /^node_modules(\/|$)/,
  /^\.expo(\/|$)/,
  /^ios(\/|$)/,
  /^android(\/|$)/,
  /^dist(\/|$)/,
  /^\.turbo(\/|$)/,
  /^expo-env\.d\.ts$/,
  /^\.env$/,
  /^\.env\.local$/,
  // Reads ../../templates to check the starter's copies against them; an app has no monorepo.
  /^__tests__\/release\.test\.ts$/,
];

/**
 * npm leaves `.gitignore` files out of a package, so the packaged starter
 * keeps them as `_gitignore`; init puts the dot back.
 */
export const PACKED_GITIGNORE = "_gitignore";

/** Every file under a folder, relative, forward slashes, sorted; `exclude` drops paths. */
export function walk(dir: string, exclude: RegExp[] = []): string[] {
  const out: string[] = [];
  const visit = (rel: string) => {
    for (const name of readdirSync(path.join(dir, rel)).sort()) {
      const child = rel ? `${rel}/${name}` : name;
      if (exclude.some((r) => r.test(child))) continue;
      const stat = statSync(path.join(dir, child));
      if (stat.isDirectory()) visit(child);
      else if (stat.isFile()) out.push(child);
    }
  };
  visit("");
  return out;
}
