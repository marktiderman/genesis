#!/usr/bin/env node
/**
 * check-lockfile-downgrades.mjs: fails when pnpm-lock.yaml replaces a package's version with an
 * older one in the same caret range (same major; same minor on 0.x; 0.0.x never), and warns when
 * it adds an older copy beside the newer one (a dependency may pin it exactly). Both are how a
 * regenerated lockfile moves unrelated packages back: Dependabot's cooldown resolves every
 * package to a release at least a week old, not only the one it bumps.
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

const parts = (v) => {
  const [core, pre] = v.split("-", 2);
  return { nums: core.split(".").map(Number), pre };
};
/** Negative when a < b. A prerelease sorts before its release. */
const compare = (a, b) => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++)
    if (x.nums[i] !== y.nums[i]) return (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
};
const sameRange = (a, b) => {
  const [x, y] = [parts(a).nums, parts(b).nums];
  // ^1.2.3 takes any 1.x; ^0.2.3 any 0.2.x; ^0.0.3 only 0.0.3.
  return x[0] === y[0] && (x[0] !== 0 || (x[1] === y[1] && x[1] !== 0));
};

/**
 * Added versions older than a compatible base one: `downgrades` when the newer one is gone,
 * `copies` when it stays.
 */
export function lockfileDowngrades(base, head) {
  const before = lockedVersions(base);
  const downgrades = [];
  const copies = [];
  for (const [name, versions] of lockedVersions(head)) {
    const had = before.get(name);
    if (!had) continue;
    for (const v of versions) {
      if (had.has(v)) continue;
      const newer = [...had]
        .filter((h) => sameRange(h, v) && compare(h, v) > 0)
        .sort(compare)
        .pop();
      if (!newer) continue;
      (versions.has(newer) ? copies : downgrades).push(
        `${name}: adds ${v}, older than ${newer} on the base branch`,
      );
    }
  }
  return { downgrades, copies };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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
