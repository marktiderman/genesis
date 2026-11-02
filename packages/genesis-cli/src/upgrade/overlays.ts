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
 * 3. An overlay with nothing of the app's own left (source or package.json) is deleted, the app's
 *    dependency on it pins the release, and its workspace leaves the root's `workspaces` and
 *    bun.lock (or `bun install` stops on a workspace that isn't there), unless something still names its folder (a
 *    pnpm-workspace.yaml override, tsconfig paths, a vite, vitest or metro alias): then it stays.
 * 4. A merge that conflicts writes nothing at all: the upgrade stops and lists the files. A file
 *    that isn't text is never merged: upstream's copy when the app's is the base's, else a conflict.
 *
 * Planning reads and writes nothing in the app; `applyOverlayPlans` writes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { overlayUpstream } from "@marktiderman/genesis-features";
import { mergeThreeWay } from "../blocks/owned.js";
import { localPackages } from "../blocks/local.js";
import { GENESIS_PACKAGE_NAME, overlayState } from "../doctor/overlays.js";
import { localPaths, readRegister, REGISTER_PATHS } from "../upstream.js";
import { BUN_LOCK, readBunLock, removeBunLockEntries, workspaceEntries } from "../blocks/bun-lock.js";
import { findLockfile } from "../blocks/pm.js";
import { compareVersions, PLAIN } from "./bump-core.mjs";

/** The Genesis repository, whose `<name>@<version>` tags hold each release's source. */
export const GENESIS_REPOSITORY = "https://github.com/marktiderman/genesis.git";

/** A package's source at a release (path inside the package → bytes), or why it can't be read. */
export type UpstreamFiles = { files: Map<string, Buffer> } | { error: string };

export interface UpstreamSource {
  files(name: string, version: string): UpstreamFiles;
  close?(): void;
}

/** Folders that are build output or installs, never an overlay's source. */
const SKIP = new Set(["node_modules", "dist", "build", "coverage", ".turbo", ".git"]);

function walk(dir: string, rel = "", out = new Map<string, Buffer>()): Map<string, Buffer> {
  for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(dir, child, out);
    else if (entry.isFile()) out.set(child, readFileSync(path.join(dir, child)));
  }
  return out;
}

/** Text: no NUL byte, and valid UTF-8 (it reads back to the same bytes). */
export function isText(buf: Buffer): boolean {
  if (buf.subarray(0, 8000).includes(0)) return false;
  return Buffer.from(buf.toString("utf8"), "utf8").equals(buf);
}

const FETCH_TIMEOUT_MS = 120_000;

/**
 * The source at the Genesis repository's tags (`repository`, default the public one; `--genesis-repo`
 * overrides it), fetched one tag at a time (shallow) into a scratch clone and read with git alone, so
 * it runs where there is no sh or tar. Never prompts for credentials, and gives up after two minutes.
 */
export function gitUpstream(repository: string = GENESIS_REPOSITORY): UpstreamSource {
  let clone: string | null = null;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  const git = (args: string[], input?: string) =>
    execFileSync("git", args, { cwd: clone!, env, input, timeout: FETCH_TIMEOUT_MS, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 });
  const why = (err: unknown) => {
    const e = err as { code?: string; signal?: string; stderr?: Buffer | string; message?: string };
    if (e.code === "ETIMEDOUT" || e.signal === "SIGTERM") return `timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
    const text = String(e.stderr || e.message || err).trim().split("\n").filter(Boolean);
    return text.slice(-2).join(" ") || "git failed";
  };
  return {
    files(name, version) {
      const tag = `${name}@${version}`;
      try {
        if (!clone) {
          clone = mkdtempSync(path.join(tmpdir(), "genesis-upstream-"));
          git(["init", "-q"]);
        }
        git(["fetch", "-q", "--no-tags", "--depth", "1", repository, `+refs/tags/${tag}:refs/tags/${tag}`]);
      } catch (err) {
        return { error: `couldn't fetch the tag ${tag} from ${repository}: ${why(err)}` };
      }
      try {
        // The package's folder at that tag: the one package.json that names it.
        const manifests = git(["ls-tree", "-r", "--name-only", tag]).toString("utf8").split("\n").filter((f) => /^[^/]+\/[^/]+\/package\.json$/.test(f));
        const manifest = manifests.find((f) => {
          try {
            return (JSON.parse(git(["show", `${tag}:${f}`]).toString("utf8")) as { name?: string }).name === name;
          } catch {
            return false;
          }
        });
        if (!manifest) return { error: `the tag ${tag} has no package named ${name}` };
        const dir = path.posix.dirname(manifest);
        const entries = git(["ls-tree", "-r", "-z", tag, "--", `${dir}/`])
          .toString("utf8")
          .split("\0")
          .filter(Boolean)
          .map((line) => /^\d+ blob ([0-9a-f]+)\t(.*)$/s.exec(line))
          .filter((m): m is RegExpExecArray => m !== null)
          .map((m) => ({ sha: m[1]!, file: m[2]!.slice(dir.length + 1) }))
          .filter((e) => !e.file.split("/").some((part) => SKIP.has(part)));
        const files = new Map<string, Buffer>();
        if (entries.length) {
          // One `git cat-file --batch` for every blob: "<sha> blob <size>\n<bytes>\n" each.
          const out = git(["cat-file", "--batch"], entries.map((e) => e.sha).join("\n") + "\n");
          let at = 0;
          for (const e of entries) {
            const nl = out.indexOf(10, at);
            const size = Number(out.subarray(at, nl).toString("utf8").split(" ")[2]);
            files.set(e.file, Buffer.from(out.subarray(nl + 1, nl + 1 + size)));
            at = nl + 1 + size + 1;
          }
        }
        return { files };
      } catch (err) {
        return { error: `couldn't read ${name} at the tag ${tag}: ${why(err)}` };
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
  /** Lines in the upstream tag's file, as git diff reports them ("4", "2-3", "after 4"), or "new file", "fields …". */
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
  /** Files whose rebase conflicts (overlay-relative); the upgrade stops when any. */
  conflicts: string[];
  /** The overlay after the rebase: path → bytes (null deletes it). Empty when `remove`. */
  writes: Map<string, Buffer | null>;
  /** Nothing of the app's own is left: the overlay is deleted and the release pinned (`pins`). */
  remove: boolean;
  /** For `remove`: each app package.json that names the overlay, as it becomes (app-relative path → text). */
  pins: Map<string, string>;
  /** Nothing of the app's own is left, but the overlay stays: why (something still names its folder). */
  stays?: string;
  /** When the upstream source couldn't be read, the overlay is left alone and this says why. */
  skipped?: string;
}

interface Hunk {
  at: string;
  start: number;
  count: number;
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
        const start = Number(head[1]);
        const count = head[2] === undefined ? 1 : Number(head[2]);
        current = { at: count === 0 ? `after ${start}` : count === 1 ? `${start}` : `${start}-${start + count - 1}`, start, count, removed: [], added: [] };
        hunks.push(current);
      } else if (current && line.startsWith("-") && !line.startsWith("---")) current.removed.push(line.slice(1));
      else if (current && line.startsWith("+") && !line.startsWith("+++")) current.added.push(line.slice(1));
    }
    return hunks;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Shipped: upstream made the same change at the same place (the same lines of the base replaced by
 * the same lines), which is exactly what the three-way merge takes cleanly from both sides. Anything
 * else, a line that merely appears somewhere in the new version included, is the app's own.
 */
function shippedBy(upstreamHunks: Hunk[]) {
  return (h: Hunk) => upstreamHunks.some((u) => u.start === h.start && u.count === h.count && u.added.length === h.added.length && u.added.every((l, i) => l === h.added[i]));
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
export function planOverlays(root: string, wanted: (name: string) => string | null | undefined, upstream: UpstreamSource, manifests: readonly string[] = ["package.json"]): OverlayPlan[] {
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
    const plan: OverlayPlan = { name: pkg.name, rel: pkg.rel, from, to, hunks: [], conflicts: [], writes: new Map(), remove: false, pins: new Map() };
    plans.push(plan);
    const baseRead = upstream.files(pkg.name, from);
    const nextRead = "files" in baseRead ? upstream.files(pkg.name, to) : baseRead;
    if (!("files" in baseRead) || !("files" in nextRead)) {
      plan.skipped = `${"error" in baseRead ? baseRead.error : (nextRead as { error: string }).error}; the overlay is left as it is: rebase it by hand`;
      continue;
    }
    const base = baseRead.files;
    const next = nextRead.files;
    const mine = walk(pkg.dir);
    const promoted = promotions(root, pkg.name);
    const verdict = (file: string): Pick<OverlayHunk, "verdict" | "entry" | "pr"> => {
      const appPath = `${pkg.rel}/${file}`;
      const p = promoted.find((e) => e.paths.some((q) => q === appPath || q === pkg.rel || appPath.startsWith(`${q.replace(/\/+$/, "")}/`)));
      return p ? { verdict: "promoted", entry: p.id, ...(p.pr ? { pr: p.pr } : {}) } : { verdict: "kept" };
    };

    let own = false;
    for (const file of [...new Set([...mine.keys(), ...next.keys()])].sort()) {
      const m = mine.get(file);
      const b = base.get(file);
      const t = next.get(file);
      const text = [m, b, t].every((x) => x === undefined || isText(x));
      let result: Buffer | null | undefined; // undefined: leave the file as it is

      if (file === "package.json" && m && t && text) {
        // Merged as JSON (the overlay's own version, marker and ranges sit beside upstream's lines).
        let merged: string;
        try {
          merged = rebasedManifest(JSON.stringify(mergeJson(JSON.parse(b?.toString("utf8") ?? "{}"), JSON.parse(m.toString("utf8")), JSON.parse(t.toString("utf8"))), null, 2) + "\n", pkg.name, to, wanted, t.toString("utf8"));
        } catch {
          plan.conflicts.push(file);
          continue;
        }
        const fields = ownManifestFields(merged, t.toString("utf8"));
        if (fields.length) {
          own = true;
          plan.hunks.push({ file, at: `fields ${fields.join(", ")}`, ...verdict(file) });
        }
        if (merged !== m.toString("utf8")) plan.writes.set(file, Buffer.from(merged));
        continue;
      }

      // 1. The app's own hunks, sorted (text files the app carries and changed).
      if (m && text && (b === undefined || !m.equals(b))) {
        if (b === undefined) {
          plan.hunks.push({ file, at: "new file", ...(t?.equals(m) ? { verdict: "shipped" as const } : verdict(file)) });
        } else {
          const isShipped = shippedBy(t ? diffHunks(b.toString("utf8"), t.toString("utf8")) : []);
          for (const hunk of diffHunks(b.toString("utf8"), m.toString("utf8"))) plan.hunks.push({ file, at: hunk.at, ...(isShipped(hunk) ? { verdict: "shipped" as const } : verdict(file)) });
        }
      } else if (m && !text && (b === undefined || !m.equals(b))) {
        plan.hunks.push({ file, at: b === undefined ? "new file" : "binary", ...(t?.equals(m) ? { verdict: "shipped" as const } : verdict(file)) });
      }

      // 2. The rebase.
      if (m === undefined) {
        // Not in the overlay: a file the app chose not to carry stays out; a new upstream file comes in.
        if (b === undefined && t !== undefined) result = t;
      } else if (t === undefined) {
        // Gone upstream: dropped, unless the app changed it.
        if (b !== undefined) {
          if (m.equals(b)) result = null;
          else plan.conflicts.push(file);
        }
      } else if (m.equals(t)) {
        result = undefined;
      } else if (!text) {
        // Not text: never merged. Upstream's copy when the app's is the base's, else the app's own change.
        if (b !== undefined && m.equals(b)) result = t;
        else plan.conflicts.push(file);
      } else {
        const merged = mergeThreeWay(m.toString("utf8"), b?.toString("utf8") ?? "", t.toString("utf8"));
        if (!merged || !merged.clean) plan.conflicts.push(file);
        else result = Buffer.from(merged.text);
      }
      const after = result === undefined ? m : result ?? undefined;
      if (after !== undefined && !after.equals(t ?? Buffer.alloc(0)) || (after !== undefined && t === undefined)) own = true;
      if (result !== undefined && !(result && m && result.equals(m))) plan.writes.set(file, result);
    }

    if (plan.conflicts.length || own) continue;
    // Nothing of the app's own is left: delete it, unless something still names its folder.
    const references = folderReferences(root, plan);
    if (references.length) {
      plan.stays = `nothing of the app's own is left, but ${references.join(", ")} still name ${plan.rel}: drop that, then delete the overlay and pin ${plan.name}@${to}`;
      continue;
    }
    const pins = planPins(root, plan, manifests);
    if (typeof pins === "string") {
      plan.stays = pins;
      continue;
    }
    plan.remove = true;
    plan.pins = pins;
    plan.writes.clear();
  }
  return plans;
}

/** The fields of the overlay's rebased package.json that differ from upstream's, past the overlay's own (version, private, the marker, and the published ranges a source copy needs). */
function ownManifestFields(mergedText: string, upstreamText: string): string[] {
  const mine = JSON.parse(mergedText) as Record<string, unknown>;
  const theirs = JSON.parse(upstreamText) as Record<string, unknown>;
  for (const json of [mine, theirs]) {
    delete json.version;
    delete json.private;
    const genesis = json.genesis as Record<string, unknown> | undefined;
    if (genesis) {
      delete genesis.overlay;
      if (!Object.keys(genesis).length) delete json.genesis;
    }
  }
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const ours = mine[section] as Record<string, unknown> | undefined;
    const up = theirs[section] as Record<string, unknown> | undefined;
    if (!ours || !up) continue;
    for (const [dep, spec] of Object.entries(up)) if (typeof spec === "string" && spec.startsWith("workspace:") && typeof ours[dep] === "string") ours[dep] = spec;
  }
  const sorted = (v: unknown): unknown => (isObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : Array.isArray(v) ? v.map(sorted) : v);
  return [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].filter((k) => JSON.stringify(sorted(mine[k])) !== JSON.stringify(sorted(theirs[k]))).sort();
}

/** Files that name the overlay's folder (or override the package to a local copy), so deleting it would break them. */
function folderReferences(root: string, plan: OverlayPlan): string[] {
  const found: string[] = [];
  const candidates = readdirSync(root).filter((f) => /^(pnpm-workspace\.yaml|tsconfig(\..+)?\.json|jsconfig\.json|(vite|vitest|metro)\.config\.[cm]?[jt]s|babel\.config\.[cm]?js|\.babelrc)$/.test(f));
  const folder = new RegExp(`(^|[^\\w./-])(\\.\\/)?${plan.rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
  const escapedName = plan.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const file of candidates.sort()) {
    let text: string;
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    if (folder.test(text)) found.push(file);
    else if (file === "pnpm-workspace.yaml" && new RegExp(`['"]?${escapedName}['"]?\\s*:\\s*['"]?(workspace:|link:|file:)`).test(text)) found.push(`${file} (an override of ${plan.name})`);
  }
  return found;
}

/**
 * For a removed overlay: each app package.json whose dependency points at it (workspace:, or a
 * file:/link: resolved from that package.json's own folder) pins the release, its override to the
 * overlay goes, and a `workspaces` entry naming its folder goes (bun and npm stop on a workspace that
 * isn't there). A string when a package.json can't be read (the overlay then stays).
 */
function planPins(root: string, plan: OverlayPlan, manifests: readonly string[]): Map<string, string> | string {
  const pins = new Map<string, string>();
  for (const file of manifests) {
    const abs = path.join(root, file);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    const pinned = pinManifest(root, plan, file, text);
    if (pinned === undefined) {
      return `nothing of the app's own is left, but ${file} isn't valid JSON, so its dependency on ${plan.name} can't be pinned: fix it, then run genesis upgrade again`;
    }
    if (pinned !== null) pins.set(file, pinned);
  }
  return pins;
}

/** `text` (the app's `file`) with the removed overlay pinned and unlisted; null when nothing changes, undefined when it isn't JSON. */
function pinManifest(root: string, plan: OverlayPlan, file: string, text: string): string | null | undefined {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const overlay = path.resolve(root, plan.rel);
  const here = path.dirname(path.join(root, file));
  const local = (spec: unknown) =>
    typeof spec === "string" &&
    (spec.startsWith("workspace:") || (/^(file|link):/.test(spec) && path.resolve(here, spec.slice(5)) === overlay));
  let touched = false;
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const deps = json[section] as Record<string, unknown> | undefined;
    if (deps && local(deps[plan.name])) {
      deps[plan.name] = plan.to;
      touched = true;
    }
  }
  for (const o of [json.overrides, json.resolutions, (json.pnpm as { overrides?: unknown } | undefined)?.overrides]) {
    if (isObject(o) && local(o[plan.name])) {
      delete o[plan.name];
      touched = true;
    }
  }
  // A workspaces entry that names the folder itself (a glob such as packages/* simply matches one fewer).
  const names = (entry: unknown) => typeof entry === "string" && path.resolve(here, entry) === overlay;
  const ws = json.workspaces;
  const list = Array.isArray(ws) ? ws : isObject(ws) && Array.isArray(ws.packages) ? (ws.packages as unknown[]) : null;
  if (list?.some(names)) {
    const kept = list.filter((entry) => !names(entry));
    if (Array.isArray(ws)) json.workspaces = kept;
    else (ws as Record<string, unknown>).packages = kept;
    touched = true;
  }
  if (!touched) return null;
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
  return JSON.stringify(json, null, indent) + (text.endsWith("\n") ? "\n" : "");
}

/** What `applyOverlayPlans` did to bun.lock, for the summary. */
export interface OverlayLockEdit {
  /** The lockfile, app-relative (it may sit above the app). */
  file: string;
  /** The removed workspace folders, as the lockfile names them. */
  workspaces: string[];
}

/**
 * Writes the rebased overlays (none may conflict); a removed overlay's pins first (onto each
 * package.json as it is now, so the bump and other overlays' pins stay), then its folder, then its
 * workspace in bun.lock. Returns app-relative paths changed.
 */
export function applyOverlayPlans(root: string, plans: OverlayPlan[], lockEdits: OverlayLockEdit[] = []): string[] {
  const changed: string[] = [];
  const removedFolders: string[] = [];
  for (const plan of plans) {
    if (plan.skipped || plan.conflicts.length) continue;
    const dir = path.join(root, plan.rel);
    if (plan.remove) {
      for (const file of plan.pins.keys()) {
        const abs = path.join(root, file);
        const now = existsSync(abs) ? readFileSync(abs, "utf8") : null;
        const text = now === null ? plan.pins.get(file)! : pinManifest(root, plan, file, now);
        if (typeof text !== "string") continue;
        writeFileSync(abs, text);
        changed.push(file);
      }
      rmSync(dir, { recursive: true, force: true });
      changed.push(`${plan.rel}/package.json`);
      removedFolders.push(dir);
      continue;
    }
    for (const [file, bytes] of plan.writes) {
      const target = path.join(dir, file);
      if (bytes === null) rmSync(target, { force: true });
      else {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      }
      changed.push(`${plan.rel}/${file}`);
    }
  }
  const edit = removedFolders.length ? dropRemovedWorkspaces(root, removedFolders) : null;
  if (edit) {
    lockEdits.push(edit);
    if (!edit.file.startsWith("..")) changed.push(edit.file);
  }
  return [...new Set(changed)];
}

/** Removes deleted overlays' workspaces from the bun.lock at or above the app; what it removed, or null. */
function dropRemovedWorkspaces(root: string, folders: string[]): OverlayLockEdit | null {
  const found = findLockfile(root);
  if (found?.pm !== "bun") return null;
  const text = readBunLock(found.dir);
  if (text === null) return null;
  const workspaces: string[] = [];
  const packages: string[] = [];
  try {
    for (const folder of folders) {
      const entries = workspaceEntries(text, path.relative(found.dir, folder).split(path.sep).join("/"));
      workspaces.push(...entries.workspaces);
      packages.push(...entries.packages);
    }
  } catch {
    return null; // a bun.lock this can't read: bun install reports it
  }
  if (!workspaces.length && !packages.length) return null;
  writeFileSync(path.join(found.dir, BUN_LOCK), removeBunLockEntries(text, { workspaces, packages }));
  return { file: path.relative(root, path.join(found.dir, BUN_LOCK)).split(path.sep).join("/"), workspaces };
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
      const where = `\`${h.file}\` ${h.at === "new file" ? "(new file)" : h.at === "binary" ? "(not text)" : h.at.startsWith("fields ") ? `(${h.at})` : `lines ${h.at}`}`;
      if (h.verdict === "shipped") lines.push(`- [x] ${where}: already shipped in ${plan.to}; dropped from the overlay`);
      else if (h.verdict === "promoted") lines.push(h.pr ? `- [x] ${where}: promoted (${h.entry}, ${h.pr})` : `- [ ] ${where}: promoted (${h.entry}); link its Genesis PR in docs/genesis-upstream.md`);
      else lines.push(`- [ ] ${where}: kept; say why here`);
    }
    if (!plan.hunks.length) lines.push("- [x] no changes of the app's own");
    if (plan.conflicts.length) lines.push(`- [ ] rebase conflicts, nothing written; rebase by hand onto ${plan.to}: ${plan.conflicts.map((f) => `\`${plan.rel}/${f}\``).join(", ")}`);
    else if (plan.remove) lines.push(`- [x] nothing of the app's own is left: the overlay is deleted and ${plan.name} pinned to ${plan.to} (drop it from localPackages if it is listed by name)`);
    else if (plan.stays) lines.push(`- [ ] ${plan.stays}`);
    else lines.push(`- [x] rebased onto ${plan.to}; the marker's upstream is ${plan.name}@${plan.to}`);
  }
  return lines;
}
