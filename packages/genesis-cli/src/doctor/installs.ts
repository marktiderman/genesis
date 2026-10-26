/**
 * `duplicate-genesis-package`: more than one installed copy of a Genesis
 * package. Two copies are two module instances, so a provider from one is
 * invisible to hooks from the other (a nested genesis-core broke DataProvider
 * this way). Follows resolution through npm/yarn/bun trees and the pnpm and
 * bun isolated stores, workspace roots included.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { findPackageDir } from "./genesis.js";
import { satisfies } from "./semver.js";
import type { DoctorContext } from "./types.js";

const GENESIS = /^@marktiderman\/genesis(?:-[\w.-]+)?$/;

/** One physical copy of a Genesis package, and who asked for it. */
export interface GenesisInstall {
  name: string;
  version: string;
  /** Folder relative to the app root, POSIX separators. */
  dir: string;
  /** The folder's real absolute path. */
  absolutePath: string;
  /** `the app` or `<package>@<version>`, with the range it declared. */
  requiredBy: Array<{ by: string; range?: string }>;
  /**
   * Reached only through dev tooling: every path to it from the app runs through
   * a declared devDependency, or the Genesis CLI's own tree. Such a copy runs in
   * scripts and builds, not in the app.
   */
  devOnly: boolean;
  /** Reached from a declared runtime dependency of the app: it ships. */
  runtime: boolean;
}

/** Dev tools whose own dependency tree never ships, wherever the app lists them. */
const DEV_TOOLS = new Set(["@marktiderman/genesis-cli"]);
/**
 * devDependencies that are tooling, not app code: test runners, type packages,
 * linters and formatters, compilers and bundlers, Storybook, release and git
 * hooks. A bundler ships every other devDependency the app imports (a Vite or
 * Next app lists its UI there freely), so only these count as dev-only.
 */
const NON_SHIPPING =
  /^(?:@marktiderman\/genesis-cli|vitest|@vitest\/.+|jest|jest-.+|@jest\/.+|ts-jest|babel-jest|mocha|ava|c8|nyc|@playwright\/test|playwright|cypress|@testing-library\/.+|happy-dom|jsdom|msw|@types\/.+|typescript|tsx|ts-node|eslint|eslint-.+|@eslint\/.+|@typescript-eslint\/.+|typescript-eslint|prettier|prettier-.+|@biomejs\/.+|oxlint|vite|@vitejs\/.+|vite-plugin-.+|webpack|webpack-.+|rollup|@rollup\/.+|esbuild|tsup|turbo|@storybook\/.+|storybook|@changesets\/.+|husky|lint-staged|wrangler|knip|concurrently|npm-run-all2?|rimraf|cross-env|dotenv-cli)$/;

interface Manifest {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const readManifest = (dir: string): Manifest | null => {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
};
const rangeIn = (m: Manifest | null, name: string) =>
  m?.dependencies?.[name] ?? m?.optionalDependencies?.[name] ?? m?.peerDependencies?.[name] ?? m?.devDependencies?.[name];
const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** An app with one of these beside its package.json has an install of its own. */
const LOCKFILES = ["bun.lock", "bun.lockb", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"];

/** The node_modules folder a package folder sits in (`…/node_modules` for `…/node_modules/@scope/name`). */
function nodeModulesOf(dir: string): string {
  const parent = path.dirname(dir);
  return path.basename(parent).startsWith("@") ? path.dirname(parent) : parent;
}

/** Package folders directly in a node_modules folder (scoped ones included), skipping `.bin`, `.pnpm` and the like. */
function packagesIn(nodeModules: string): string[] {
  if (!existsSync(nodeModules)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(nodeModules)) {
    if (entry.startsWith(".")) continue;
    const p = path.join(nodeModules, entry);
    if (entry.startsWith("@")) {
      try {
        for (const sub of readdirSync(p)) out.push(path.join(p, sub));
      } catch {
        // not a folder
      }
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * Every installed copy of every Genesis package the app can load, by name.
 *
 * Follows resolution, not folder layout: from each top-level package in the
 * app's `node_modules` (and the app's own dependencies), each dependency is
 * resolved the way Node does, from the real folder of the package asking. That
 * covers npm/yarn/bun hoisted and nested trees, pnpm's `.pnpm` store (in the
 * app or at a workspace root above a sub-app) and bun's isolated `.bun` store,
 * where a package's dependencies are its siblings in the store entry. Copies
 * nothing resolves to are left out: they never load.
 *
 * Each copy records which roots reach it: the app's declared dependencies
 * (`runtime`; devDependencies included, since a bundler ships what the app
 * imports from them), hoisted packages nobody declared (they could be anyone's),
 * and the dev roots: declared tooling (test runners, type packages, linters,
 * bundlers, the Genesis CLI wherever it's listed), whose trees never ship. Only
 * a copy reached from dev roots alone is `devOnly`.
 */
export function genesisInstalls(root: string): Map<string, GenesisInstall[]> {
  const copies = new Map<string, GenesisInstall>();
  // Real paths on both sides, so a store reached through a link (or macOS's /var → /private/var) reads plainly.
  const realRoot = real(root);
  const rel = (abs: string) => path.relative(realRoot, abs).split(path.sep).join("/") || ".";
  type Root = "runtime" | "hoisted" | "dev";
  const via = new Map<string, Set<Root>>();
  const record = (real: string, manifest: Manifest, by: string, range: string | undefined, root: Root) => {
    let copy = copies.get(real);
    if (!copy) {
      copy = { name: manifest.name!, version: String(manifest.version ?? "unknown"), dir: rel(real), absolutePath: real, requiredBy: [], devOnly: false, runtime: false };
      copies.set(real, copy);
      via.set(real, new Set());
    }
    via.get(real)!.add(root);
    if (!copy.requiredBy.some((r) => r.by === by)) copy.requiredBy.push({ by, ...(range ? { range } : {}) });
  };

  /** Follow resolution from `roots`, tagging every Genesis copy reached with `kind`. Each kind is its own walk. */
  const walk = (kind: Root, roots: Array<{ dir: string; by: string; range?: string }>) => {
    const expanded = new Set<string>();
    const queue: Array<{ real: string; manifest: Manifest; label: string }> = [];
    const visit = (dir: string, by: string, range: string | undefined) => {
      const manifest = readManifest(dir);
      if (!manifest?.name) return;
      // The CLI's tree is dev tooling's, wherever it's reached from.
      if (kind !== "dev" && DEV_TOOLS.has(manifest.name)) return;
      const realDir = real(dir);
      if (GENESIS.test(manifest.name)) record(realDir, manifest, by, range, kind);
      if (expanded.has(realDir)) return;
      expanded.add(realDir);
      queue.push({ real: realDir, manifest, label: `${manifest.name}@${manifest.version ?? "?"}` });
    };
    for (const r of roots) visit(r.dir, r.by, r.range);
    while (queue.length) {
      const { real: from, manifest, label } = queue.shift()!;
      const deps = { ...manifest.optionalDependencies, ...manifest.dependencies };
      for (const [name, range] of Object.entries(deps)) {
        const dir = findPackageDir(from, name);
        if (dir) visit(dir, label, range);
      }
      for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
        if (name in deps) continue;
        const dir = peerOf(from, name);
        if (dir) visit(dir, label, range);
      }
    }
  };
  /**
   * Where a peer dependency comes from: the host app provides peers. One the app
   * declares resolves as Node would from the package; one it doesn't is met only
   * by a copy the app's own install holds (a sibling in the same node_modules,
   * as pnpm and bun link peers, or anything under the app's folder). A copy
   * found only by walking up past the app (a parent app's node_modules) is an
   * unmet peer, not part of this app's graph. That boundary holds only for an app
   * with its own install (its own lockfile): a workspace member shares the root's
   * install, where hoisted peers are real.
   */
  const peerOf = (from: string, name: string): string | null => {
    const dir = findPackageDir(from, name);
    if (!dir) return null;
    if (!ownInstall || name in declared) return dir;
    const realDir = real(dir);
    if (realDir.startsWith(realRoot + path.sep)) return dir;
    return nodeModulesOf(realDir) === nodeModulesOf(from) ? dir : null;
  };
  const rootsOf = (deps: Record<string, string | undefined>, by: string) =>
    Object.entries(deps).flatMap(([name, range]) => {
      const dir = findPackageDir(root, name);
      return dir ? [{ dir, by, ...(range ? { range } : {}) }] : [];
    });

  const app = readManifest(root);
  const ownInstall = LOCKFILES.some((f) => existsSync(path.join(root, f)));
  const declared = { ...app?.devDependencies, ...app?.peerDependencies, ...app?.optionalDependencies, ...app?.dependencies };
  // A devDependency ships when the app bundles it, and the doctor can't tell for sure which apps
  // bundle: so every devDependency counts as runtime except tooling (NON_SHIPPING), whose tree never ships.
  const declaredDev = Object.entries(app?.devDependencies ?? {});
  const runtimeDeps: Record<string, string> = {
    ...Object.fromEntries(declaredDev.filter(([n]) => !NON_SHIPPING.test(n))),
    ...app?.peerDependencies,
    ...app?.optionalDependencies,
    ...app?.dependencies,
  };
  const devDeps = Object.fromEntries(declaredDev.filter(([n]) => NON_SHIPPING.test(n) && !(n in runtimeDeps)));
  walk("runtime", rootsOf(runtimeDeps, "the app"));
  // Hoisted packages nobody in the app declared are loadable too, but could be anyone's.
  const top = path.join(root, "node_modules");
  walk(
    "hoisted",
    packagesIn(top)
      .filter((dir) => {
        const name = path.relative(top, dir).split(path.sep).join("/");
        return !(name in runtimeDeps) && !(name in devDeps);
      })
      .map((dir) => ({ dir, by: "hoisted, not a direct dependency" })),
  );
  const devRoots: Record<string, string | undefined> = { ...devDeps };
  // The CLI's tree when the app declares it (anywhere): one found only in a parent's node_modules isn't this app's.
  for (const tool of DEV_TOOLS) if (!(tool in devRoots) && tool in runtimeDeps) devRoots[tool] = runtimeDeps[tool];
  walk("dev", rootsOf(devRoots, "the app (dev)"));
  for (const [key, copy] of copies) {
    const kinds = via.get(key)!;
    copy.runtime = kinds.has("runtime");
    copy.devOnly = kinds.size === 1 && kinds.has("dev");
  }

  const byName = new Map<string, GenesisInstall[]>();
  for (const copy of copies.values()) byName.set(copy.name, [...(byName.get(copy.name) ?? []), copy]);
  for (const list of byName.values()) list.sort((a, b) => a.dir.split("/").length - b.dir.split("/").length || a.dir.localeCompare(b.dir));
  return byName;
}

export function checkDuplicatePackages(ctx: DoctorContext): void {
  const describe = (c: GenesisInstall) =>
    `${c.version} at ${c.dir} (${c.requiredBy.map((r) => `${r.by}${r.range ? ` wants ${r.range}` : ""}`).join("; ")})`;
  for (const [name, copies] of genesisInstalls(ctx.root)) {
    if (copies.length < 2) continue;
    // Info only when exactly one copy provably ships (a declared runtime dependency reaches it) and every
    // other is reached only through dev tooling. Anything else, an undeclared hoisted path included, warns.
    const shipping = copies.filter((c) => c.runtime);
    if (!(shipping.length === 1 && copies.every((c) => c === shipping[0] || c.devOnly))) {
      ctx.report({
        rule: "duplicate-genesis-package",
        level: "warn",
        file: "package.json",
        subject: name,
        message:
          `${name} is installed ${copies.length} times: ${copies.map((c) => `${describe(c)}${c.devOnly ? " [dev only]" : ""}`).join(", ")}. ` +
          `Each copy is its own module, so a provider from one (DataProvider, the shell's contexts) is invisible to hooks from another. ` +
          `Align the ranges so one copy satisfies them all, or add an override/resolution`,
      });
      continue;
    }
    // One copy ships; the others only run in dev tooling (the CLI, devDependencies). Worth knowing, never a failure.
    ctx.report({
      rule: "duplicate-genesis-package",
      level: "info",
      file: "package.json",
      subject: name,
      message:
        `${name} has dev-only copies beside the one the app loads: ${copies.filter((c) => c.devOnly).map(describe).join(", ")}. ` +
        `They run in tooling, not the app, so they can't split its contexts; upgrade the tool to drop them`,
    });
  }
}

/**
 * `peer-range-mismatch`: an installed Genesis package's peer range on another
 * Genesis package that the copy it resolves doesn't satisfy. The peer is looked
 * up from the package's own folder, the way Node resolves it.
 */
export function checkPeerRanges(ctx: DoctorContext): void {
  const rel = (abs: string) => path.relative(ctx.root, abs).split(path.sep).join("/");
  for (const copies of genesisInstalls(ctx.root).values()) {
    for (const copy of copies) {
      const dir = copy.absolutePath;
      const peers = readManifest(dir)?.peerDependencies ?? {};
      for (const [peer, range] of Object.entries(peers)) {
        if (!GENESIS.test(peer)) continue;
        const peerDir = findPackageDir(dir, peer);
        const installed = peerDir && readManifest(peerDir)?.version;
        if (!peerDir || !installed) continue;
        if (satisfies(installed, range) !== false) continue;
        ctx.report({
          rule: "peer-range-mismatch",
          // A dev tool's own tree (the CLI's) doesn't run in the app.
          level: copy.devOnly ? "info" : "warn",
          file: "package.json",
          subject: `${copy.name}>${peer}`,
          message:
            `${copy.name}@${copy.version} (${copy.dir}) wants ${peer} ${range}, but ${installed} is installed (${rel(peerDir)}). ` +
            `Install a ${peer} in that range, or a ${copy.name} release built against ${installed}`,
        });
      }
    }
  }
}
