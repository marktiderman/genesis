/**
 * `genesis upgrade`'s overlay step: every overlay (an app's marked local copy of a Genesis package,
 * doctor/overlays.ts) is cleaned out and rebased onto the release the upgrade moves to.
 *
 * For each overlay whose marker `upstream` is older than the release:
 *
 * 1. Its source is diffed against the package's source at the upstream tag (the Genesis repository's
 *    `<name>@<version>` tag), and each hunk the app made is sorted for a checklist:
 *    - shipped: the new version already has it, so the rebase drops it from the overlay;
 *    - promoted: docs/genesis-upstream.md has a promoted entry for the package that lists the file:
 *      link its Genesis PR there;
 *    - kept: the app's own change, carried on; the pull request says why.
 * 2. What's left is rebased onto the new version, file by file, by a three-way merge (the upstream
 *    tag the base, the overlay one side, the new version the other). The marker's `upstream` and
 *    the overlay's version move to the new release.
 * 3. An overlay with nothing left is deleted, and the app's dependency on it pins the release.
 * 4. A merge that conflicts writes nothing at all: the upgrade stops and lists the files.
 *
 * Planning reads and writes nothing in the app; `applyOverlayPlans` writes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { overlayUpstream } from "@marktiderman/genesis-features";
import { mergeThreeWay } from "../blocks/owned.js";
import { localPackages } from "../blocks/local.js";
import { GENESIS_PACKAGE_NAME, overlayState } from "../doctor/overlays.js";
import { localPaths, readRegister, REGISTER_PATHS } from "../upstream.js";
import { compareVersions, PLAIN } from "./bump-core.mjs";

/** The Genesis repository, whose `<name>@<version>` tags hold each release's source. */
export const GENESIS_REPOSITORY = "https://github.com/marktiderman/genesis.git";

/** A package's source at a release: path inside the package → text; null when there is no such tag. */
export interface UpstreamSource {
  files(name: string, version: string): Map<string, string> | null;
  close?(): void;
}

/** Folders that are build output or installs, never an overlay's source. */
const SKIP = new Set(["node_modules", "dist", "build", "coverage", ".turbo", ".git"]);

function walk(dir: string, rel = "", out = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(dir, child, out);
    else if (entry.isFile()) out.set(child, readFileSync(path.join(dir, child), "utf8"));
  }
  return out;
}

/** The source at the Genesis repository's tags, fetched one tag at a time (shallow) into a scratch clone. */
export function gitUpstream(repository: string = GENESIS_REPOSITORY): UpstreamSource {
  let clone: string | null = null;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: clone!, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  return {
    files(name, version) {
      if (!clone) {
        clone = mkdtempSync(path.join(tmpdir(), "genesis-upstream-"));
        git("init", "-q");
      }
      const tag = `${name}@${version}`;
      try {
        git("fetch", "-q", "--depth", "1", repository, `+refs/tags/${tag}:refs/tags/${tag}`);
      } catch {
        return null;
      }
      // The package's folder at that tag: the one package.json that names it.
      const manifests = git("ls-tree", "-r", "--name-only", tag).split("\n").filter((f) => /^[^/]+\/[^/]+\/package\.json$/.test(f));
      const dir = manifests.find((f) => {
        try {
          return (JSON.parse(git("show", `${tag}:${f}`)) as { name?: string }).name === name;
        } catch {
          return false;
        }
      });
      if (!dir) return null;
      const pkgDir = path.posix.dirname(dir);
      const out = mkdtempSync(path.join(tmpdir(), "genesis-upstream-tree-"));
      try {
        execFileSync("sh", ["-c", 'git archive --format=tar "$1" "$2" | tar -x -C "$3"', "sh", tag, pkgDir, out], { cwd: clone, stdio: ["ignore", "ignore", "pipe"] });
        return walk(path.join(out, pkgDir));
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    close() {
      if (clone) rmSync(clone, { recursive: true, force: true });
      clone = null;
    },
  };
}

export type HunkVerdict = "shipped" | "promoted" | "kept";

export interface OverlayHunk {
  file: string;
  /** Lines in the upstream tag's file (1-based start, count), as git diff reports them. */
  at: string;
  verdict: HunkVerdict;
  /** For promoted: the register entry, and its Genesis PR link when the entry has one. */
  entry?: string;
  pr?: string;
}

export interface OverlayPlan {
  name: string;
  /** App-relative folder. */
  rel: string;
  from: string;
  to: string;
  hunks: OverlayHunk[];
  /** Files whose three-way merge conflicts (overlay-relative); the upgrade stops when any. */
  conflicts: string[];
  /** The overlay after the rebase: path → text (null deletes it). Empty when `remove`. */
  writes: Map<string, string | null>;
  /** Nothing of the app's own is left: the overlay is deleted and the release pinned. */
  remove: boolean;
  /** When the upstream tag couldn't be read, the overlay is left alone and this says why. */
  skipped?: string;
}

interface Hunk {
  at: string;
  removed: string[];
  added: string[];
}

/** The hunks of `after` against `before` (no context). */
export function diffHunks(before: string, after: string): Hunk[] {
  if (before === after) return [];
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-diff-"));
  try {
    writeFileSync(path.join(dir, "a"), before);
    writeFileSync(path.join(dir, "b"), after);
    let out = "";
    try {
      out = execFileSync("git", ["diff", "--no-index", "--no-color", "-U0", "a", "b"], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
      out = String((err as { stdout?: unknown }).stdout ?? ""); // exit 1: the files differ
    }
    const hunks: Hunk[] = [];
    let current: Hunk | null = null;
    for (const line of out.split("\n")) {
      const head = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
      if (head) {
        current = { at: head[2] === undefined || head[2] === "1" ? head[1]! : `${head[1]}-${Number(head[1]) + Number(head[2]) - 1}`, removed: [], added: [] };
        if (head[2] === "0") current.at = `after ${head[1]}`;
        hunks.push(current);
      } else if (current && line.startsWith("-") && !line.startsWith("---")) current.removed.push(line.slice(1));
      else if (current && line.startsWith("+") && !line.startsWith("+++")) current.added.push(line.slice(1));
    }
    return hunks;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const block = (lines: string[]) => lines.join("\n");
const meaningful = (lines: string[]) => lines.some((l) => l.trim());

/** Whether the new version already carries a hunk: it has what the hunk added and lost what it removed. */
function shipped(hunk: Hunk, next: string | undefined): boolean {
  if (next === undefined) return !meaningful(hunk.added);
  const hasAdded = !meaningful(hunk.added) || next.includes(block(hunk.added));
  const lostRemoved = !meaningful(hunk.removed) || !next.includes(block(hunk.removed));
  return hasAdded && lostRemoved;
}

interface Promotion {
  id: string;
  paths: string[];
  pr?: string;
}

/** The register's promoted entries for a package, with the Genesis PR a row links (if any). */
function promotions(root: string, name: string): Promotion[] {
  const file = REGISTER_PATHS.find((p) => existsSync(path.join(root, p)));
  if (!file) return [];
  const text = readFileSync(path.join(root, file), "utf8");
  const rows = text.split("\n");
  return readRegister(text)
    .entries.filter((e) => e.status === "promoted" && e.package === name)
    .map((e) => {
      const row = rows.find((r) => r.split("|").map((c) => c.trim())[1] === e.id) ?? "";
      const pr = /https:\/\/github\.com\/marktiderman\/genesis\/pull\/\d+/.exec(row)?.[0];
      return { id: e.id, paths: localPaths(e.local), ...(pr ? { pr } : {}) };
    });
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A three-way merge of JSON values: what upstream changed is taken, unless the app changed it too (the app's wins). */
export function mergeJson(base: unknown, mine: unknown, theirs: unknown): unknown {
  if (isObject(base) && isObject(mine) && isObject(theirs)) {
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const inMine = key in mine;
      const inBase = key in base;
      if (!(key in theirs)) {
        // Upstream dropped it: gone unless the app changed it.
        if (inMine && (!inBase || !same(mine[key], base[key]))) out[key] = mine[key];
        continue;
      }
      if (!inMine) {
        // The app dropped it: stays dropped, unless upstream only now added it.
        if (!inBase) out[key] = theirs[key];
        continue;
      }
      out[key] = inBase ? mergeJson(base[key], mine[key], theirs[key]) : mine[key];
    }
    return out;
  }
  return same(mine, base) ? theirs : mine;
}

const LOCAL_SUFFIX = /[+-]local\.(0|[1-9]\d*)$/;

/**
 * The overlay's package.json after the rebase: the merged text, with the marker and version on the
 * new release, and each dependency the new version takes from the workspace set to the release's
 * published version (as a source copy needs).
 */
function rebasedManifest(text: string, name: string, to: string, released: (dep: string) => string | null | undefined, nextText: string | undefined): string {
  const json = JSON.parse(text) as Record<string, unknown> & { version?: string; genesis?: { overlay?: { upstream?: string } } };
  const next = nextText ? (JSON.parse(nextText) as Record<string, Record<string, string> | undefined>) : {};
  const n = LOCAL_SUFFIX.exec(typeof json.version === "string" ? json.version : "")?.[1] ?? "1";
  json.version = `${to}+local.${n}`;
  if (json.genesis?.overlay) json.genesis.overlay.upstream = `${name}@${to}`;
  for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = json[section] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const [dep, spec] of Object.entries(deps)) {
      if (!spec.startsWith("workspace:") && !next[section]?.[dep]?.startsWith("workspace:")) continue;
      const v = released(dep);
      if (v && PLAIN.test(v)) deps[dep] = `^${v}`;
    }
  }
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
  return JSON.stringify(json, null, indent) + (text.endsWith("\n") ? "\n" : "");
}

/** The overlays that need rebasing onto the release, and how; writes nothing. */
export function planOverlays(root: string, wanted: (name: string) => string | null | undefined, upstream: UpstreamSource): OverlayPlan[] {
  const plans: OverlayPlan[] = [];
  let packages;
  try {
    packages = localPackages(root);
  } catch {
    return plans; // the doctor reports a broken localPackages
  }
  for (const pkg of packages) {
    if (!GENESIS_PACKAGE_NAME.test(pkg.name)) continue;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path.join(pkg.dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const state = overlayState(pkg.name, json);
    if (state.kind !== "marked") continue;
    const from = overlayUpstream(state.marker).version;
    const to = wanted(pkg.name);
    if (!to || !PLAIN.test(to) || compareVersions(to, from) <= 0) continue;
    const plan: OverlayPlan = { name: pkg.name, rel: pkg.rel, from, to, hunks: [], conflicts: [], writes: new Map(), remove: false };
    plans.push(plan);
    const base = upstream.files(pkg.name, from);
    const next = base && upstream.files(pkg.name, to);
    if (!base || !next) {
      plan.skipped = `no source for ${pkg.name}@${base ? to : from} in the Genesis repository's tags; rebase it by hand`;
      continue;
    }
    const mine = walk(pkg.dir);
    const promoted = promotions(root, pkg.name);
    const promotedFor = (file: string) => {
      const appPath = `${pkg.rel}/${file}`;
      return promoted.find((p) => p.paths.some((q) => q === appPath || q === pkg.rel || appPath.startsWith(`${q.replace(/\/+$/, "")}/`)));
    };

    // 1. The app's own hunks, sorted.
    for (const [file, text] of mine) {
      if (file === "package.json") continue;
      for (const hunk of diffHunks(base.get(file) ?? "", text)) {
        const at = base.has(file) ? hunk.at : "new file";
        if (shipped(hunk, next.get(file))) plan.hunks.push({ file, at, verdict: "shipped" });
        else {
          const p = promotedFor(file);
          plan.hunks.push(p ? { file, at, verdict: "promoted", entry: p.id, ...(p.pr ? { pr: p.pr } : {}) } : { file, at, verdict: "kept" });
        }
      }
    }

    // 2. The rebase, file by file.
    const files = new Set([...mine.keys(), ...next.keys()]);
    let own = false;
    for (const file of [...files].sort()) {
      const m = mine.get(file);
      const b = base.get(file);
      const t = next.get(file);
      let result: string | null | undefined; // undefined: leave the file as it is
      if (m === undefined) {
        // Not in the overlay: a file the app chose not to carry stays out; a new upstream file comes in.
        if (b === undefined && t !== undefined) result = t;
      } else if (t === undefined) {
        // Gone upstream: dropped, unless the app changed it.
        if (b === undefined) result = undefined;
        else if (m === b) result = null;
        else plan.conflicts.push(file);
      } else if (file === "package.json") {
        // Merged as JSON (the overlay's own version, marker and ranges sit beside upstream's lines).
        try {
          result = JSON.stringify(mergeJson(JSON.parse(b ?? "{}"), JSON.parse(m), JSON.parse(t)), null, 2) + "\n";
        } catch {
          plan.conflicts.push(file);
        }
      } else if (m === t) {
        result = undefined;
      } else {
        const merged = mergeThreeWay(m, b ?? "", t);
        if (!merged || !merged.clean) plan.conflicts.push(file);
        else result = merged.text;
      }
      const after = result === undefined ? m : result ?? undefined;
      if (file === "package.json") {
        if (after !== undefined) result = rebasedManifest(after, pkg.name, plan.to, wanted, t);
      } else if (after !== undefined && after !== t) own = true;
      if (result !== undefined && result !== m) plan.writes.set(file, result);
    }
    if (!plan.conflicts.length && !own) {
      plan.remove = true;
      plan.writes.clear();
    }
  }
  return plans;
}

/** Writes the rebased overlays (none may conflict): files, deletions, and for a removed overlay the app's dependency pinned. Returns app-relative paths changed. */
export function applyOverlayPlans(root: string, plans: OverlayPlan[], manifests: string[]): string[] {
  const changed: string[] = [];
  for (const plan of plans) {
    if (plan.skipped || plan.conflicts.length) continue;
    const dir = path.join(root, plan.rel);
    if (plan.remove) {
      rmSync(dir, { recursive: true, force: true });
      changed.push(`${plan.rel}/package.json`);
      changed.push(...pinRelease(root, plan, manifests));
      continue;
    }
    for (const [file, text] of plan.writes) {
      const target = path.join(dir, file);
      if (text === null) rmSync(target, { force: true });
      else {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, text);
      }
      changed.push(`${plan.rel}/${file}`);
    }
  }
  return changed;
}

/** A removed overlay's wiring: the dependency on it pins the release, and the override to it goes. */
function pinRelease(root: string, plan: OverlayPlan, manifests: string[]): string[] {
  const changed: string[] = [];
  const local = (spec: unknown) => typeof spec === "string" && (spec.startsWith("workspace:") || ((spec.startsWith("file:") || spec.startsWith("link:")) && path.resolve(root, spec.slice(5)) === path.resolve(root, plan.rel)));
  for (const file of manifests) {
    const abs = path.join(root, file);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    const json = JSON.parse(text) as Record<string, unknown>;
    let touched = false;
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const deps = json[section] as Record<string, unknown> | undefined;
      if (deps && local(deps[plan.name])) {
        deps[plan.name] = plan.to;
        touched = true;
      }
    }
    const overrides = [json.overrides, json.resolutions, (json.pnpm as { overrides?: unknown } | undefined)?.overrides];
    for (const o of overrides) {
      const map = o as Record<string, unknown> | undefined;
      if (map && typeof map === "object" && local(map[plan.name])) {
        delete map[plan.name];
        touched = true;
      }
    }
    if (!touched) continue;
    const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
    writeFileSync(abs, JSON.stringify(json, null, indent) + (text.endsWith("\n") ? "\n" : ""));
    changed.push(file);
  }
  return changed;
}

/** The checklist for the summary and the pull request: an upgrade PR isn't done until it is. */
export function overlayChecklist(plans: OverlayPlan[]): string[] {
  if (!plans.length) return [];
  const lines = ["", "Overlays (an upgrade PR isn't done until this checklist is):"];
  for (const plan of plans) {
    lines.push("", `${plan.name} (${plan.rel}), ${plan.from} → ${plan.to}:`, "");
    if (plan.skipped) {
      lines.push(`- [ ] ${plan.skipped}`);
      continue;
    }
    for (const h of plan.hunks) {
      const where = `\`${h.file}\` ${h.at === "new file" ? "(new file)" : `lines ${h.at}`}`;
      if (h.verdict === "shipped") lines.push(`- [x] ${where}: already shipped in ${plan.to}; dropped from the overlay`);
      else if (h.verdict === "promoted") lines.push(h.pr ? `- [x] ${where}: promoted (${h.entry}, ${h.pr})` : `- [ ] ${where}: promoted (${h.entry}); link its Genesis PR in docs/genesis-upstream.md`);
      else lines.push(`- [ ] ${where}: kept; say why here`);
    }
    if (!plan.hunks.length) lines.push("- [x] no changes of the app's own");
    if (plan.conflicts.length) lines.push(`- [ ] rebase conflicts, nothing written; rebase by hand onto ${plan.to}: ${plan.conflicts.map((f) => `\`${plan.rel}/${f}\``).join(", ")}`);
    else if (plan.remove) lines.push(`- [x] nothing of the app's own is left: the overlay is deleted and ${plan.name} pinned to ${plan.to} (drop it from localPackages if it is listed by name)`);
    else lines.push(`- [x] rebased onto ${plan.to}; the marker's upstream is ${plan.name}@${plan.to}`);
  }
  return lines;
}
