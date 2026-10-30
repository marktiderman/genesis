#!/usr/bin/env node
/**
 * check-package-layers.mjs: the package layering check (feature `package-layering`,
 * docs/PACKAGE-STRATEGY.md "Layers"). Fails when:
 *
 *   1. a package's `genesis` metadata (layer, group, essential, module) is missing or invalid;
 *   2. a dependency points the wrong way: foundation → foundation; primitive → foundation or
 *      primitive; module → foundation, primitive or a module it lists in
 *      `genesis.module.requiresModules`; tooling → anything; nothing outside tooling uses a
 *      tooling package or a package's `toolingEntries`;
 *   3. there is a dependency cycle among the runtime packages;
 *   4. a module's docs or skill is missing, or its skill isn't in the package's `files`.
 *
 * "Uses" is a package's dependencies and peer dependencies plus every Genesis specifier its
 * source imports (tests and stories aside), so an undeclared import is still an edge.
 * The rules themselves are `packageLayerProblems` in genesis-features (built first).
 *
 *   node scripts/check-package-layers.mjs [--root <dir>] [--list]
 *
 * Exit 0 clean, 1 problems. Wired into ci.yml and `pnpm lint:genesis`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/marktiderman/genesis/blob/main/";
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs)$/;
const SKIP_FILE = /(?:\.test|\.spec|\.stories)\.[cm]?[jt]sx?$|\.d\.ts$/;
const SKIP_DIR = new Set(["node_modules", "dist", "__tests__", "__mocks__", "test", "tests", "fixtures"]);
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'](@marktiderman\/genesis[^"']*)["']/g;

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return SKIP_DIR.has(name) ? [] : sourceFiles(p);
    return SOURCE.test(name) && !SKIP_FILE.test(name) ? [p] : [];
  });
}

/** Every package under `<root>/packages`, as the layering rules read it. */
export function readWorkspace(root) {
  const dir = path.join(root, "packages");
  return readdirSync(dir)
    .filter((d) => existsSync(path.join(dir, d, "package.json")))
    .sort()
    .map((d) => {
      const pkgDir = path.join(dir, d);
      const json = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
      const declared = Object.keys({ ...json.dependencies, ...json.peerDependencies, ...json.optionalDependencies });
      const imported = sourceFiles(path.join(pkgDir, "src")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(IMPORT)].map((m) => m[1]));
      return {
        dir: pkgDir,
        json,
        layer: {
          name: json.name,
          genesis: json.genesis,
          exports: json.exports && typeof json.exports === "object" ? Object.keys(json.exports) : undefined,
          uses: [...new Set([...declared, ...imported])].sort(),
          optionalPeers: Object.entries(json.peerDependenciesMeta ?? {}).filter(([, m]) => m && m.optional === true).map(([n]) => n).sort(),
        },
      };
    });
}

/** Rule 4: a module's docs and skill exist, and its skill ships. */
export function moduleFileProblems(root, pkgs) {
  const problems = [];
  for (const { dir, json } of pkgs) {
    const mod = json.genesis?.module;
    if (!mod || typeof mod !== "object") continue;
    const at = `${json.name} genesis.module`;
    if (typeof mod.docs === "string") {
      const file = mod.docs.startsWith(REPO) ? path.join(root, mod.docs.slice(REPO.length).split("#")[0]) : mod.docs.startsWith("https://") ? null : path.join(dir, mod.docs);
      if (file && !existsSync(file)) problems.push(`${at}.docs: ${mod.docs} doesn't exist`);
    }
    if (typeof mod.skill === "string") {
      if (!existsSync(path.join(dir, mod.skill))) problems.push(`${at}.skill: ${mod.skill} doesn't exist in the package`);
      else if (Array.isArray(json.files) && !json.files.some((f) => f === mod.skill || mod.skill.startsWith(`${f.replace(/\/$/, "")}/`))) {
        problems.push(`${at}.skill: ${mod.skill} isn't in the package's "files", so it doesn't ship`);
      }
    }
  }
  return problems;
}

export async function checkPackageLayers(root) {
  const features = pathToFileURL(path.join(root, "packages", "features", "dist", "index.js")).href;
  if (!existsSync(fileURLToPath(features))) throw new Error("genesis-features isn't built: run pnpm build:packages first");
  const { packageLayerProblems } = await import(features);
  const pkgs = readWorkspace(root);
  return { pkgs, problems: [...packageLayerProblems(pkgs.map((p) => p.layer)), ...moduleFileProblems(root, pkgs)] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--root");
  const root = path.resolve(at >= 0 ? args[at + 1] : path.join(HERE, ".."));
  const { pkgs, problems } = await checkPackageLayers(root);
  if (args.includes("--list")) {
    for (const { json } of pkgs) console.log(`${(json.genesis?.layer ?? "?").padEnd(11)} ${(json.genesis?.group ?? "?").padEnd(14)} ${json.name}`);
  }
  if (problems.length) {
    console.error(`Package layering: ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    console.error("\nSee docs/PACKAGE-STRATEGY.md, \"Layers\". A module may use another module only when genesis.module.requiresModules lists it.");
    process.exit(1);
  }
  console.log(`Package layering: ${pkgs.length} packages, every dependency points down.`);
}
