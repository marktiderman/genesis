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
 * One downgrade is deliberate and passes: a workspace package whose own package.json pin for that
 * dependency changed in the same diff (its package.json specifier at the base ref differs from the
 * one at head; the lockfile's specifier, which carries overrides, isn't read) to an exact, `~` or
 * `^` range that no longer admits the old version and admits every version now locked in its
 * place, as aligning with an Expo SDK does. A downgrade with no such pin change still fails.
 *
 * Usage: node scripts/check-lockfile-downgrades.mjs --base origin/main
 * Fix: `pnpm install && pnpm dedupe` on the branch, or restore the base lockfile and reinstall.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** A lockfile's text with LF line endings, so the `^…$` section patterns match a CRLF checkout too. */
const lf = (text) => text.replace(/\r\n?/g, "\n");

/** `name → versions` from the `packages:` section of a pnpm 9 lockfile. */
export function lockedVersions(lockfile) {
  const out = new Map();
  const section = lf(lockfile).split(/^packages:$/m)[1]?.split(/^\S/m)[0] ?? "";
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

/** `name@version → peer dependency names`, from the `packages:` section. */
function peerNames(lockfile) {
  const out = new Map();
  const section = lf(lockfile).split(/^packages:$/m)[1]?.split(/^\S/m)[0] ?? "";
  let key = "";
  let inPeers = false;
  for (const line of section.split("\n")) {
    let m;
    if ((m = /^ {2}(\S.*):$/.exec(line)))
      [key, inPeers] = [unquote(m[1]), false];
    else if (/^ {4}peerDependencies:$/.test(line)) inPeers = true;
    else if (/^ {4}\S/.test(line)) inPeers = false;
    else if (inPeers && (m = /^ {6}(\S+?): /.exec(line))) {
      if (!out.has(key)) out.set(key, new Set());
      out.get(key).add(unquote(m[1]));
    }
  }
  return out;
}

/**
 * What each dependent resolves each dependency to, from a pnpm 9 lockfile's `importers` and
 * `snapshots`: `dependent → dependency → versions`. A dependent is a workspace path, or a
 * package at one version (peer variants together), since a release's own dependencies are its
 * author's choice. Linked workspace packages are skipped.
 */
export function lockedEdges(lockfile) {
  const out = new Map();
  const peers = peerNames(lockfile);
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
  for (const line of lockfile.split(/\r?\n/)) {
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
        // A peer is the consumer's choice, checked on the consumer's own edge.
        if (!peers.get(dependent)?.has(unquote(m[1]))) add(unquote(m[1]), m[2]);
    }
  }
  return out;
}

/** `workspace path → package names it reaches through an alias` (`foo-v1: foo@1.5.0`), from `importers`. */
export function importerAliases(lockfile) {
  const out = new Map();
  let section = "";
  let dependent = "";
  for (const line of lockfile.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      section = line.replace(/:.*/, "");
      continue;
    }
    if (section !== "importers") continue;
    let m;
    if ((m = /^ {2}(\S.*):$/.exec(line))) dependent = unquote(m[1]);
    else if ((m = /^ {8}version: (.+)$/.exec(line))) {
      const version = unquote(m[1]).split("(")[0];
      if (!/^@?[^@\s]+@\d/.test(version)) continue;
      if (!out.has(dependent)) out.set(dependent, new Set());
      out.get(dependent).add(splitKey(version)[0]);
    }
  }
  return out;
}

/**
 * `workspace path → dependency → specifier`, from each importer's own package.json
 * (dependencies, devDependencies, optionalDependencies), read with `read(path)` (null when it
 * isn't there). The lockfile's specifiers aren't used: they carry pnpm-workspace.yaml overrides.
 */
export function manifestPins(lockfile, read) {
  const out = new Map();
  for (const [, dir] of lf(lockfile).split(/^importers:$/m)[1]?.split(/^\S/m)[0]?.matchAll(/^ {2}(\S.*):$/gm) ?? []) {
    const path = unquote(dir);
    const text = read(path === "." ? "package.json" : `${path}/package.json`);
    if (!text) continue;
    let pkg;
    try {
      pkg = JSON.parse(text);
    } catch {
      continue;
    }
    const pins = new Map();
    // A name in more than one section with different specs has no one pin to judge (null never exempts).
    for (const section of ["devDependencies", "dependencies", "optionalDependencies"])
      for (const [name, spec] of Object.entries(pkg[section] ?? {}))
        if (typeof spec === "string") pins.set(name, pins.has(name) && pins.get(name) !== spec ? null : spec);
    out.set(path, pins);
  }
  return out;
}

/**
 * Whether a package.json specifier admits `v`: an exact version, `~` or `^`. Null for anything
 * else (a wider range, a tag, a protocol), which this check can't judge and never exempts.
 */
export function specifierTakes(spec, v) {
  const m = /^(~|\^|=)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(spec.trim());
  if (!m) return null;
  const [op, want] = [m[1] ?? "=", m[2]];
  if (op === "=") return compare(v, want) === 0;
  if (compare(v, want) < 0) return false;
  const [pv, pw] = [parts(v), parts(want)];
  const [x, y] = [pv.nums, pw.nums];
  // As semver: a range takes a prerelease only when it names one on the same x.y.z.
  if (pv.pre.length && !(pw.pre.length && x.join(".") === y.join("."))) return false;
  if (op === "~") return x[0] === y[0] && x[1] === y[1];
  // `^0.0.3` takes only 0.0.3 (and `^0.0.3-rc.1` its prereleases up to 0.0.3); sameRange never
  // takes a 0.0.x.
  return y[0] === 0 && y[1] === 0 ? x.join(".") === y.join(".") : sameRange(v, want);
}

/**
 * `downgrades`: a dependent that resolved a dependency to a version on the base branch and now
 * gets only older ones in that version's caret range, so it moved back. `copies`: an added
 * version older than a compatible base one, that isn't simply the upgrade of a base copy it
 * replaced, and isn't one of those downgrades.
 */
export function lockfileDowngrades(base, head, pins = {}) {
  /** `name@version` moved back → the older version and the dependents it moved for. */
  const moved = new Map();
  /**
   * `name@version` moved back by a deliberate pin → the versions that pin chose: not a downgrade,
   * and a chosen version is never a copy to dedupe, whatever newer copy another importer keeps (any
   * other older copy still is).
   */
  const lowered = new Map();
  const after = lockedEdges(head);
  const aliased = [importerAliases(base), importerAliases(head)];
  /**
   * The workspace package.json's own pin (never the lockfile's specifier, which carries
   * pnpm-workspace.yaml overrides) changed in this diff, no longer admits `h`, and admits every
   * version the lockfile now has in its place (`kept`), so the pin, not an override, chose them.
   * A name the importer also reaches through an alias isn't judged by the direct pin.
   */
  const pinLowered = (dependent, name, h, kept) => {
    if (aliased.some((a) => a.get(dependent)?.has(name))) return false;
    const was = pins.before?.get(dependent)?.get(name);
    const now = pins.after?.get(dependent)?.get(name);
    return (
      !!was &&
      !!now &&
      was !== now &&
      specifierTakes(now, h) === false &&
      kept.every((v) => specifierTakes(now, v) === true)
    );
  };
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
        if (pinLowered(dependent, name, h, kept)) {
          if (!lowered.has(key)) lowered.set(key, new Set());
          for (const v of kept) lowered.get(key).add(v);
          continue;
        }
        if (!moved.has(key)) moved.set(key, { name, h, to: new Set(), by: [] });
        moved.get(key).to.add(newest(kept));
        moved.get(key).by.push(dependent);
      }
    }
  }
  const before = lockedVersions(base);
  /** Every `name@version` a deliberate pin chose: never a copy to dedupe, whichever newer copy stays. */
  const chosen = new Set([...lowered].flatMap(([key, vs]) => [...vs].map((v) => `${key.slice(0, key.lastIndexOf("@"))}@${v}`)));
  const copies = [];
  for (const [name, versions] of lockedVersions(head)) {
    const had = before.get(name);
    if (!had) continue;
    for (const v of versions) {
      if (had.has(v) || chosen.has(`${name}@${v}`)) continue;
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
  const baseLock = execFileSync("git", ["show", `${base}:pnpm-lock.yaml`], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  const headLock = readFileSync("pnpm-lock.yaml", "utf8");
  const atBase = (file) => {
    try {
      return execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  };
  const atHead = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);
  const { downgrades, copies } = lockfileDowngrades(baseLock, headLock, {
    before: manifestPins(baseLock, atBase),
    after: manifestPins(headLock, atHead),
  });
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
