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
 * Each copy records which roots reach it: the app's declared runtime
 * dependencies (`runtime`), hoisted packages nobody declared (they could be
 * anyone's), and the dev roots (declared devDependencies, and the Genesis CLI
 * wherever it's listed). Only a copy reached from dev roots alone is `devOnly`.
 * An app with no runtime dependencies at all (everything in devDependencies, as
 * a bundled SPA may list them) has its devDependencies taken as runtime.
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
      const deps = { ...manifest.peerDependencies, ...manifest.optionalDependencies, ...manifest.dependencies };
      for (const [name, range] of Object.entries(deps)) {
        const dir = findPackageDir(from, name);
        if (dir) visit(dir, label, range);
      }
    }
  };
  const rootsOf = (deps: Record<string, string | undefined>, by: string) =>
    Object.entries(deps).flatMap(([name, range]) => {
      const dir = findPackageDir(root, name);
      return dir ? [{ dir, by, ...(range ? { range } : {}) }] : [];
    });

  const app = readManifest(root);
  let runtimeDeps: Record<string, string> = { ...app?.peerDependencies, ...app?.optionalDependencies, ...app?.dependencies };
  let devDeps = Object.fromEntries(Object.entries(app?.devDependencies ?? {}).filter(([n]) => !(n in runtimeDeps)));
  // A bundled app (a Vite SPA) may list everything as devDependencies: then they are what ships.
  if (Object.keys(runtimeDeps).length === 0) {
    runtimeDeps = Object.fromEntries(Object.entries(devDeps).filter(([n]) => !DEV_TOOLS.has(n)));
    devDeps = Object.fromEntries(Object.entries(devDeps).filter(([n]) => DEV_TOOLS.has(n)));
  }
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
  for (const tool of DEV_TOOLS) if (!(tool in devRoots)) devRoots[tool] = runtimeDeps[tool];
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
