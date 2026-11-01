#!/usr/bin/env node
/**
 * check-lockfile-downgrades.mjs: fails when pnpm-lock.yaml moves a dependent (a workspace package,
 * or a package at one version) from a version to an older one in the same caret range
 * (same major; same minor on 0.x; 0.0.x never), and warns when it adds an older copy beside a
 * newer one (a dependency may pin it exactly). Raising every copy, as a security bump does, is
 * neither; nor is an older pinned copy left behind when the newer one's dependent moved to a new
 * major. Both are how a regenerated lockfile moves unrelated packages back: Dependabot's cooldown
 * resolves every package to a release at least a week old, not only the one it bumps.
 *
 * Usage: node scripts/check-lockfile-downgrades.mjs --base origin/main
 * Fix: `pnpm install && pnpm dedupe` on the branch, or restore the base lockfile and reinstall.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** `name → versions` from the `packages:` section of a pnpm 9 lockfile. */
export function lockedVersions(lockfile) {
  const out = new Map();
  const section = lockfile.split(/^packages:$/m)[1]?.split(/^\S/m)[0] ?? "";
  for (const [, name, version] of section.matchAll(
    /^ {2}'?(@?[^@\s']+)@([^'():\s]+)'?:$/gm,
  )) {
    if (!out.has(name)) out.set(name, new Set());
    out.get(name).add(version);
  }
  return out;
}

/** A version's numbers and prerelease identifiers; `+build` metadata never counts. */
const parts = (v) => {
  const core = v.split("+")[0];
  const dash = core.indexOf("-");
  return {
    nums: (dash < 0 ? core : core.slice(0, dash)).split(".").map(Number),
    pre: dash < 0 ? [] : core.slice(dash + 1).split("."),
  };
};
/** Semver precedence of two prerelease identifiers: numbers by value, below any word. */
const compareId = (a, b) => {
  const [x, y] = [/^\d+$/.test(a), /^\d+$/.test(b)];
  if (x && y) return Number(a) - Number(b);
  if (x !== y) return x ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};
/** Semver precedence: negative when a < b. A prerelease sorts before its release. */
export const compare = (a, b) => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++)
    if (x.nums[i] !== y.nums[i]) return (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const order = compareId(x.pre[i], y.pre[i]);
    if (order) return order;
  }
  return x.pre.length - y.pre.length;
};
const sameRange = (a, b) => {
  const [x, y] = [parts(a).nums, parts(b).nums];
  // ^1.2.3 takes any 1.x; ^0.2.3 any 0.2.x; ^0.0.3 only 0.0.3.
  return x[0] === y[0] && (x[0] !== 0 || (x[1] === y[1] && x[1] !== 0));
};
const newest = (versions) => [...versions].sort(compare).pop();
/** The versions in `list` that `v`'s caret range takes. */
const range = (v, list) => [...list].filter((w) => sameRange(v, w));

const unquote = (s) => s.replace(/^'(.*)'$/, "$1");
/** `name@version(peers)` as name and version. */
const splitKey = (key) => {
  const at = key.indexOf("@", 1);
  return [key.slice(0, at), key.slice(at + 1).split("(")[0]];
};

/**
 * What each dependent resolves each dependency to, from a pnpm 9 lockfile's `importers` and
 * `snapshots`: `dependent → dependency → versions`. A dependent is a workspace path, or a
 * package at one version (peer variants together), since a release's own dependencies are its
 * author's choice. Linked workspace packages are skipped.
 */
export function lockedEdges(lockfile) {
  const out = new Map();
  let section = "";
  let dependent = "";
  let dependency = "";
  const add = (name, value) => {
    let version = unquote(value).split("(")[0];
    // An alias (`string-width-cjs: string-width@4.2.3`) resolves to the package it names.
    if (/^@?[^@\s]+@\d/.test(version)) [name, version] = splitKey(version);
    if (!/^\d/.test(version)) return;
    if (!out.has(dependent)) out.set(dependent, new Map());
    const deps = out.get(dependent);
    if (!deps.has(name)) deps.set(name, new Set());
    deps.get(name).add(version);
  };
  for (const line of lockfile.split("\n")) {
    if (/^\S/.test(line)) {
      section = line.replace(/:.*/, "");
      continue;
    }
    let m;
    if (section === "importers") {
      if ((m = /^ {2}(\S.*):$/.exec(line))) dependent = unquote(m[1]);
      else if ((m = /^ {6}(\S.*):$/.exec(line))) dependency = unquote(m[1]);
      else if ((m = /^ {8}version: (.+)$/.exec(line))) add(dependency, m[1]);
    } else if (section === "snapshots") {
      if ((m = /^ {2}(\S.*?):(?: \{\})?$/.exec(line))) {
        dependent = splitKey(unquote(m[1])).join("@");
      } else if ((m = /^ {6}([^\s-].*?): (.+)$/.exec(line)))
        add(unquote(m[1]), m[2]);
    }
  }
  return out;
}

/**
 * `downgrades`: a dependent that resolved a dependency to a version on the base branch and now
 * gets only older ones in that version's caret range, so it moved back. `copies`: an added
 * version older than a compatible base one, that isn't simply the upgrade of a base copy it
 * replaced, and isn't one of those downgrades.
 */
export function lockfileDowngrades(base, head) {
  /** `name@version` moved back → the older version and the dependents it moved for. */
  const moved = new Map();
  const after = lockedEdges(head);
  for (const [dependent, deps] of lockedEdges(base)) {
    const now = after.get(dependent);
    if (!now) continue;
    for (const [name, had] of deps) {
      const versions = now.get(name);
      if (!versions) continue;
      for (const h of had) {
        if (versions.has(h)) continue;
        const kept = range(h, versions);
        // Nothing in its range: the dependent moved to a new major, or dropped this copy.
        if (!kept.length || kept.some((v) => compare(v, h) >= 0)) continue;
        const key = `${name}@${h}`;
        if (!moved.has(key)) moved.set(key, { name, h, to: new Set(), by: [] });
        moved.get(key).to.add(newest(kept));
        moved.get(key).by.push(dependent);
      }
    }
  }
  const before = lockedVersions(base);
  const copies = [];
  for (const [name, versions] of lockedVersions(head)) {
    const had = before.get(name);
    if (!had) continue;
    for (const v of versions) {
      if (had.has(v)) continue;
      const compatible = range(v, had);
      const newer = newest(
        compatible.filter(
          (h) => compare(h, v) > 0 && !moved.has(`${name}@${h}`),
        ),
      );
      if (!newer) continue;
      const upgrade = compatible.some(
        (h) => !versions.has(h) && compare(h, v) < 0,
      );
      if (!upgrade)
        copies.push(
          `${name}: adds ${v}, older than ${newer} on the base branch`,
        );
    }
  }
  const downgrades = [...moved.values()].map(
    ({ name, h, to, by }) =>
      `${name}: replaces ${h} with ${[...to].sort(compare).join(", ")}, an older release, for ${by.join(", ")}`,
  );
  return { downgrades, copies };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const base = process.argv[process.argv.indexOf("--base") + 1];
  if (!process.argv.includes("--base") || !base) {
    console.error("usage: check-lockfile-downgrades.mjs --base <ref>");
    process.exit(2);
  }
  const { downgrades, copies } = lockfileDowngrades(
    execFileSync("git", ["show", `${base}:pnpm-lock.yaml`], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
    }),
    readFileSync("pnpm-lock.yaml", "utf8"),
  );
  if (copies.length) {
    console.warn(
      `pnpm-lock.yaml adds older copies (fine when a dependency pins one; otherwise \`pnpm dedupe\`):\n  ${copies.join("\n  ")}`,
    );
  }
  if (downgrades.length) {
    console.error(
      `pnpm-lock.yaml moves packages back against ${base}:\n  ${downgrades.join("\n  ")}`,
    );
    console.error(
      "Run `pnpm install && pnpm dedupe`, or restore the base lockfile and reinstall.",
    );
    process.exit(1);
  }
  console.log(`check-lockfile-downgrades: OK against ${base}`);
}
