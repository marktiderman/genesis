/**
 * `@marktiderman/genesis-features` is now `@marktiderman/genesis-config` (genesis-features 0.10.0,
 * the first release of the deprecated alias). The same source publishes under the new name, and the
 * old one re-exports it for two minor versions. This codemod moves an app over:
 *
 * - every string literal that names the package or one of its subpaths, in the app's scripts
 *   (imports, `export … from`, `import()`, `require`, `vi.mock`, a bundler's list of names);
 * - each package.json's dependency on it (dependencies, devDependencies, peerDependencies,
 *   optionalDependencies), renamed in place to genesis-config with a range for the genesis-config
 *   the app has installed (the alias depends on it, so `genesis upgrade` has just installed one).
 *
 * The doctor's `deprecated-import` rule reports any import of the old name that is left.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { appScripts } from "./app-scripts.js";
import type { Codemod } from "./codemods.js";

export const OLD_FEATURES_PACKAGE = "@marktiderman/genesis-features";
export const CONFIG_PACKAGE = "@marktiderman/genesis-config";

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".output", ".turbo", ".expo", "coverage", "ios", "android"]);

/** A quoted specifier of the old package or one of its subpaths: `"@marktiderman/genesis-features/gate"`. */
const OLD_SPECIFIER = /(["'`])@marktiderman\/genesis-features(?=(?:\/[^"'`\s]*)?\1)/g;

/** The text with every quoted genesis-features specifier moved to genesis-config. */
export function rewriteFeaturesSpecifiers(text: string): string {
  return text.replace(OLD_SPECIFIER, `$1${CONFIG_PACKAGE}`);
}

/** Every package.json in the app (the root and each workspace package), app-relative. */
function packageJsonFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(path.join(dir, entry.name));
      } else if (entry.name === "package.json") {
        out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}

/**
 * The range to write for genesis-config: `^` the version installed beside the app (looking up from
 * `dir`, as Node resolves), else the alias's own dependency range on it, else the old range.
 */
export function configRangeFor(root: string, dir: string, oldRange: string): string {
  for (let at = path.resolve(dir); ; at = path.dirname(at)) {
    const installed = path.join(at, "node_modules", CONFIG_PACKAGE, "package.json");
    if (existsSync(installed)) {
      const version = (JSON.parse(readFileSync(installed, "utf8")) as { version?: string }).version;
      if (version) return `^${version}`;
    }
    const alias = path.join(at, "node_modules", OLD_FEATURES_PACKAGE, "package.json");
    if (existsSync(alias)) {
      const range = (JSON.parse(readFileSync(alias, "utf8")) as { dependencies?: Record<string, string> }).dependencies?.[CONFIG_PACKAGE];
      if (range && !range.startsWith("workspace:")) return range;
    }
    if (at === path.resolve(root) || path.dirname(at) === at) break;
  }
  return oldRange;
}

/**
 * One package.json's text with its genesis-features dependency renamed in place (same position,
 * same indent). When genesis-config is already listed in that field, the old entry just goes.
 * `rangeFor` turns the old range into the new one; a `workspace:` or `link:` range is kept as is.
 */
export function renameFeaturesDependency(raw: string, rangeFor: (oldRange: string) => string): string {
  const json = JSON.parse(raw) as Record<string, unknown>;
  let changed = false;
  for (const field of DEP_FIELDS) {
    const deps = json[field];
    if (!deps || typeof deps !== "object" || !(OLD_FEATURES_PACKAGE in deps)) continue;
    const entries = Object.entries(deps as Record<string, string>);
    const hasConfig = entries.some(([name]) => name === CONFIG_PACKAGE);
    const next: Array<[string, string]> = [];
    for (const [name, range] of entries) {
      if (name !== OLD_FEATURES_PACKAGE) next.push([name, range]);
      else if (!hasConfig) next.push([CONFIG_PACKAGE, /^(?:workspace|link|file):/.test(range) ? range : rangeFor(range)]);
    }
    json[field] = Object.fromEntries(next);
    changed = true;
  }
  if (!changed) return raw;
  const indent = /^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ";
  return `${JSON.stringify(json, null, indent)}${raw.endsWith("\n") ? "\n" : ""}`;
}

export const featuresRenamedConfig: Codemod = {
  id: "genesis-features-renamed-genesis-config",
  package: OLD_FEATURES_PACKAGE,
  version: "0.10.0",
  description: "@marktiderman/genesis-features is now @marktiderman/genesis-config: rewrites its imports (and subpaths) and the package.json dependency.",
  run({ root, dryRun, log }) {
    const changed: string[] = [];
    for (const rel of appScripts(root)) {
      const abs = path.join(root, rel);
      const text = readFileSync(abs, "utf8");
      if (!text.includes(OLD_FEATURES_PACKAGE)) continue;
      const next = rewriteFeaturesSpecifiers(text);
      if (next === text) continue;
      changed.push(rel);
      if (!dryRun) writeFileSync(abs, next);
    }
    for (const rel of packageJsonFiles(root)) {
      const abs = path.join(root, rel);
      const raw = readFileSync(abs, "utf8");
      if (!raw.includes(OLD_FEATURES_PACKAGE)) continue;
      const next = renameFeaturesDependency(raw, (old) => configRangeFor(root, path.dirname(abs), old));
      if (next === raw) continue;
      changed.push(rel);
      if (!dryRun) writeFileSync(abs, next);
    }
    if (changed.length) log(`  ${OLD_FEATURES_PACKAGE} → ${CONFIG_PACKAGE}: feature ids, features.json, flags.json and the AGENTS.md block keep their format.`);
    return changed;
  },
};
