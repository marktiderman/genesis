/**
 * `duplicate-genesis-package`: more than one installed copy of a Genesis
 * package. Two copies are two module instances, so a provider from one is
 * invisible to hooks from the other (a nested genesis-core broke DataProvider
 * this way). Reads npm/bun/yarn nested `node_modules` and pnpm's `.pnpm` store.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { findPackageDir } from "./genesis.js";
import { satisfies } from "./semver.js";
import type { DoctorContext } from "./types.js";

const GENESIS = /^@marktiderman\/genesis(?:-[\w.-]+)?$/;
const MAX_DEPTH = 8;

/** One physical copy of a Genesis package, and who asked for it. */
export interface GenesisInstall {
  name: string;
  version: string;
  /** Folder relative to the app root, POSIX separators. */
  dir: string;
  /** `the app` or `<package>@<version>`, with the range it declared. */
  requiredBy: Array<{ by: string; range?: string }>;
}

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

/** Every installed copy of every Genesis package, by name. */
export function genesisInstalls(root: string): Map<string, GenesisInstall[]> {
  const copies = new Map<string, GenesisInstall>();
  const rel = (abs: string) => path.relative(root, abs).split(path.sep).join("/") || ".";
  const record = (dir: string, by: string, range: string | undefined) => {
    const key = real(dir);
    let copy = copies.get(key);
    if (!copy) {
      const m = readManifest(dir);
      if (!m?.name || !GENESIS.test(m.name)) return;
      copy = { name: m.name, version: String(m.version ?? "unknown"), dir: rel(dir), requiredBy: [] };
      copies.set(key, copy);
    }
    if (!copy.requiredBy.some((r) => r.by === by)) copy.requiredBy.push({ by, ...(range ? { range } : {}) });
  };

  // pnpm: each store entry is one copy; the symlinks in other entries' node_modules say who depends on it.
  const store = path.join(root, "node_modules", ".pnpm");
  if (existsSync(store)) {
    for (const entry of readdirSync(store)) {
      const nm = path.join(store, entry, "node_modules");
      if (!existsSync(nm)) continue;
      let owner: { label: string; manifest: Manifest | null } | null = null;
      const links: string[] = [];
      for (const pkg of packagesIn(nm)) {
        if (lstatSync(pkg).isSymbolicLink()) links.push(pkg);
        else {
          const m = readManifest(pkg);
          owner = { label: `${m?.name}@${m?.version}`, manifest: m };
          if (m?.name && GENESIS.test(m.name) && !copies.has(real(pkg))) {
            copies.set(real(pkg), { name: m.name, version: String(m.version ?? "unknown"), dir: rel(pkg), requiredBy: [] });
          }
        }
      }
      for (const link of links) {
        const name = path.relative(nm, link).split(path.sep).join("/");
        if (GENESIS.test(name)) record(link, owner?.label ?? entry, rangeIn(owner?.manifest ?? null, name));
      }
    }
  }

  // Nested node_modules (npm, bun, yarn), and the app's own top-level links under pnpm.
  const app = readManifest(root);
  const seen = new Set<string>();
  const walk = (nodeModules: string, by: string, manifest: Manifest | null, depth: number) => {
    for (const pkg of packagesIn(nodeModules)) {
      const name = path.relative(nodeModules, pkg).split(path.sep).join("/");
      if (GENESIS.test(name)) {
        const range = rangeIn(manifest, name);
        record(pkg, depth === 0 && !range ? "hoisted, not a direct dependency" : by, range);
      }
      const key = real(pkg);
      if (seen.has(key) || depth >= MAX_DEPTH || key.includes(`${path.sep}.pnpm${path.sep}`)) continue;
      seen.add(key);
      const nested = path.join(pkg, "node_modules");
      if (existsSync(nested)) {
        const m = readManifest(pkg);
        walk(nested, `${m?.name ?? name}@${m?.version ?? "?"}`, m, depth + 1);
      }
    }
  };
  walk(path.join(root, "node_modules"), "the app", app, 0);
  // A copy found only nested says nothing about who wanted the top-level one; parents' ranges fill that in.
  for (const copy of copies.values()) {
    if (copy.requiredBy.length === 0) copy.requiredBy.push({ by: "a dependency" });
  }

  const byName = new Map<string, GenesisInstall[]>();
  for (const copy of copies.values()) byName.set(copy.name, [...(byName.get(copy.name) ?? []), copy]);
  for (const list of byName.values()) list.sort((a, b) => a.dir.split("/").length - b.dir.split("/").length || a.dir.localeCompare(b.dir));
  return byName;
}

export function checkDuplicatePackages(ctx: DoctorContext): void {
  for (const [name, copies] of genesisInstalls(ctx.root)) {
    if (copies.length < 2) continue;
    const where = copies
      .map((c) => `${c.version} at ${c.dir} (${c.requiredBy.map((r) => `${r.by}${r.range ? ` wants ${r.range}` : ""}`).join("; ")})`)
      .join(", ");
    ctx.report({
      rule: "duplicate-genesis-package",
      level: "warn",
      file: "package.json",
      subject: name,
      message:
        `${name} is installed ${copies.length} times: ${where}. Each copy is its own module, so a provider from one ` +
        `(DataProvider, the shell's contexts) is invisible to hooks from another. Align the ranges so one copy satisfies them all, ` +
        `or add an override/resolution`,
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
      const dir = path.join(ctx.root, copy.dir);
      const peers = readManifest(dir)?.peerDependencies ?? {};
      for (const [peer, range] of Object.entries(peers)) {
        if (!GENESIS.test(peer)) continue;
        const peerDir = findPackageDir(dir, peer);
        const installed = peerDir && readManifest(peerDir)?.version;
        if (!peerDir || !installed) continue;
        if (satisfies(installed, range) !== false) continue;
        ctx.report({
          rule: "peer-range-mismatch",
          level: "warn",
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
