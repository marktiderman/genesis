/**
 * `genesis upgrade`: move every `@marktiderman/genesis*` dependency to one
 * Genesis release together, then bring the files Genesis owns in the app up
 * to that release.
 *
 * 1. The release: the umbrella's `versions.json` for the version asked for
 *    (default npm `latest`), as the genesis-upgrade workflow reads it; the
 *    bump itself is the workflow's own code (bump-core.mjs).
 * 2. Codemods, only for a package that moves across a version a codemod is
 *    declared for (codemods.ts).
 * 3. Install, then refresh owned files (templates, Edge Functions, skills,
 *    pgTAP tests) by a three-way decision (blocks/owned.ts), replace AGENTS.md
 *    fragments, copy skills a block gained, and report new package migrations
 *    (`genesis migrate` copies them).
 * 4. The doctor, then a summary, or with `--pr` a branch, a commit and a pull request.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { agentsFragment, ownedWrites, pinGenesisImports, sourceMigrations } from "../blocks/add.js";
import { mergeFragment } from "../blocks/agents.js";
import { findBlock, packageDir, packageVersion } from "../blocks/discover.js";
import { readApp, readPackageFile, replaceApp, sha256 } from "../blocks/files.js";
import { starterIdentity } from "../blocks/init-native.js";
import { LOCK_FILE, parseSource, readLock, substitute, writeLock } from "../blocks/lock.js";
import { planMigrations, TESTS_DIR } from "../blocks/migrations.js";
import { copyOwned, ownedKeyProblem, refreshOwned, type RefreshOutcome } from "../blocks/owned.js";
import { localPackageNames } from "../blocks/local.js";
import { detectPackageManager, installCommand, run, shellLine } from "../blocks/pm.js";
import { starterDir, templatesDir } from "../blocks/templates.js";
import { bumpPackageJson, bumpSummary, UMBRELLA, type BumpChange, type BumpSkip } from "./bump-core.mjs";
import { codemodsFor, uncoveredBreaks, CODEMODS, type Codemod } from "./codemods.js";

export interface ReleaseLookup {
  /** The umbrella's version and versions.json for a version or dist-tag. */
  release(target: string): { version: string; packages: Record<string, string> };
  /** npm `latest` of a package the umbrella doesn't list, or null. */
  latest(name: string): string | null;
}

export interface UpgradeOptions {
  root: string;
  /** An exact umbrella version or a dist-tag. Default `latest`. */
  version?: string;
  /** Read the release from this versions.json instead of npm. */
  manifest?: string;
  dryRun?: boolean;
  /** Reinstall after the bump (default true), or install this way (tests). */
  install?: boolean | ((root: string) => void);
  doctor?: boolean;
  /** Leave every owned file the app changed as it is (the new text goes to .genesis-next), without merging. */
  keepMine?: boolean;
  /** Open a pull request. */
  pr?: boolean;
  lookup?: ReleaseLookup;
  codemods?: readonly Codemod[];
  log?: (msg: string) => void;
}

export interface UpgradeReport {
  version: string;
  changes: BumpChange[];
  skipped: BumpSkip[];
  codemods: { id: string; files: string[] }[];
  breaks: BumpChange[];
  refreshed: RefreshOutcome[];
  added: string[];
  newMigrations: string[];
  doctor: "passed" | "failed" | "not run";
  files: string[];
  summary: string;
  pr?: string;
}

const EXACT_OR_TAG = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

function npm(args: string[], cwd: string): string {
  return execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** The workflow's lookup: npm view for the version, the published tarball for versions.json. */
export function npmLookup(cwd: string): ReleaseLookup {
  const latest = new Map<string, string | null>();
  return {
    release(target) {
      if (!EXACT_OR_TAG.test(target)) throw new Error(`--version must be an exact version or a dist-tag, not "${target}"`);
      const version = JSON.parse(npm(["view", `${UMBRELLA}@${target}`, "version", "--json"], cwd) || "null") as unknown;
      if (typeof version !== "string") throw new Error(`${UMBRELLA}@${target} is not one published version`);
      const tmp = mkdtempSync(path.join(tmpdir(), "genesis-umbrella-"));
      try {
        const [packed] = JSON.parse(npm(["pack", `${UMBRELLA}@${version}`, "--pack-destination", tmp, "--json"], cwd)) as { filename: string }[];
        execFileSync("tar", ["-xzf", path.join(tmp, packed!.filename), "-C", tmp, "package/dist/versions.json"]);
        const manifest = JSON.parse(readFileSync(path.join(tmp, "package/dist/versions.json"), "utf8")) as { version: string; packages: Record<string, string> };
        if (manifest.version !== version) throw new Error(`${UMBRELLA}@${version} ships a versions.json for ${manifest.version}`);
        return manifest;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    latest(name) {
      if (!latest.has(name)) {
        let v: unknown = null;
        try {
          v = JSON.parse(npm(["view", `${name}@latest`, "version", "--json"], cwd) || "null");
        } catch {
          // Not published.
        }
        latest.set(name, typeof v === "string" ? v : null);
      }
      return latest.get(name)!;
    },
  };
}

/** Every tracked package.json at or below the app (git), or just its own outside git. */
function packageJsons(root: string): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", ":(glob)**/package.json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const files = out.split("\0").filter(Boolean);
    if (files.length) return files;
  } catch {
    // Not a git repository.
  }
  return existsSync(path.join(root, "package.json")) ? ["package.json"] : [];
}

/** An owned file's source text now, with the app's substitutions applied; null when it can't be read. */
function sourceText(root: string, source: string, substitutions: Record<string, string> | undefined): string | null {
  const { package: pkg, path: rel } = parseSource(source);
  const dir = packageDir(root, pkg);
  if (!dir) return null;
  try {
    if (pkg === "@marktiderman/genesis-cli" && rel.startsWith("templates/")) {
      const templates = templatesDir(dir);
      const text = readPackageFile(templates, rel.slice("templates/".length));
      return text === null ? null : substitute(text, substitutions);
    }
    const text = readPackageFile(dir, rel);
    if (text === null) return null;
    // An Edge Function's npm imports name the installed versions, as `genesis add` wrote them.
    return substitute(rel.startsWith("functions/") ? pinGenesisImports(root, text) : text, substitutions);
  } catch {
    return null;
  }
}

export async function runUpgrade(options: UpgradeOptions): Promise<UpgradeReport> {
  const root = path.resolve(options.root);
  const log = options.log ?? (() => {});
  const lookup = options.lookup ?? npmLookup(root);
  const release = options.manifest
    ? (JSON.parse(readFileSync(path.resolve(options.manifest), "utf8")) as { version: string; packages: Record<string, string> })
    : lookup.release(options.version ?? "latest");
  const pinned: Record<string, string> = { [UMBRELLA]: release.version, ...release.packages };
  const wanted = (name: string) => pinned[name] ?? lookup.latest(name);
  // Checked before anything is written, so a --pr run that can't open a pull request changes nothing.
  const prBase = options.pr && !options.dryRun ? checkPullRequest(root, release.version) : undefined;
  const next = new Set<string>();

  // 1. The bump (the workflow's code).
  const changes: BumpChange[] = [];
  const skipped: BumpSkip[] = [];
  const bumped = new Map<string, string>();
  for (const file of packageJsons(root)) {
    const text = readApp(root, file);
    if (text === null) continue;
    const result = bumpPackageJson(file, text, wanted);
    changes.push(...result.changes);
    skipped.push(...result.skipped);
    if (result.text !== null) bumped.set(file, result.text);
  }
  const mods = codemodsFor(changes, options.codemods ?? CODEMODS);
  const breaks = uncoveredBreaks(changes, options.codemods ?? CODEMODS);


  // Owned files' base text, from what is installed now (before the upgrade replaces it).
  const lock = readLock(root);
  checkSubstitutions(lock.substitutions);
  const bases = new Map<string, string>();
  for (const [file, entry] of Object.entries(lock.files)) {
    if (ownedKeyProblem(file, entry.source, localPackageNames(root))) continue;
    const text = sourceText(root, entry.source, lock.substitutions);
    if (text !== null && sha256(text) === entry.sha256) bases.set(file, text);
  }

  const files = new Set<string>();
  const codemodRuns: UpgradeReport["codemods"] = [];
  if (!options.dryRun) {
    for (const [file, text] of bumped) {
      replaceApp(root, file, text);
      files.add(file);
    }
  }
  for (const mod of mods) {
    log(`codemod ${mod.id}: ${mod.description}`);
    const changed = await mod.run({ root, dryRun: Boolean(options.dryRun), log });
    codemodRuns.push({ id: mod.id, files: changed });
    for (const f of changed) files.add(f);
  }

  // 2. Install.
  const pm = detectPackageManager(root);
  if (!options.dryRun && options.install !== false && bumped.size) {
    if (typeof options.install === "function") options.install(root);
    else {
      log(`install: ${shellLine(installCommand(pm))}`);
      run(root, installCommand(pm));
    }
  }

  // 3. The blocks: new migrations first (a pgTAP test isn't refreshed ahead of its migration),
  // then owned files, skills a block gained, and fragments.
  const added: string[] = [];
  const newMigrations: string[] = [];
  const warnings: string[] = [];
  const manifests = [];
  for (const [id, entry] of Object.entries(lock.blocks)) {
    try {
      const { manifest } = await findBlock(root, id, { package: entry.package, warnings });
      manifests.push(manifest);
      for (const row of planMigrations(root, sourceMigrations(root, manifest), { now: new Date(), tests: false, ...(lock.migrations ? { copied: lock.migrations } : {}) }).rows) {
        if (row.state === "new") newMigrations.push(`${row.package} ${row.file}`);
      }
      if (manifest.version && manifest.version !== entry.version) lock.blocks[id] = { ...entry, version: manifest.version };
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }
  const refreshed: RefreshOutcome[] = [];
  for (const [file, entry] of Object.entries(lock.files)) {
    if (newMigrations.length && file.startsWith(`${TESTS_DIR}/`)) {
      refreshed.push({ path: file, outcome: "deferred", detail: "new package migrations are waiting: run genesis migrate, then genesis upgrade again" });
      continue;
    }
    const problem = ownedKeyProblem(file, entry.source, localPackageNames(root));
    const theirs = problem ? null : sourceText(root, entry.source, lock.substitutions);
    const dir = problem ? null : packageDir(root, parseSource(entry.source).package);
    const version = dir ? packageVersion(dir) : undefined;
    const outcome = refreshOwned(root, lock, { path: file, theirs, base: bases.get(file) ?? null, ...(version ? { version } : {}) }, { ...(options.dryRun ? { dryRun: true } : {}), ...(options.keepMine ? { keepMine: true } : {}) });
    refreshed.push(outcome);
    if (outcome.outcome === "updated" || outcome.outcome === "merged") files.add(file);
    if ((outcome.outcome === "conflict" || outcome.outcome === "kept-mine") && !outcome.detail?.includes("already there")) next.add(`${file}.genesis-next`);
  }
  for (const manifest of manifests) {
    for (const w of ownedWrites(root, manifest, warnings)) {
      if (lock.files[w.path]) continue;
      const outcome = copyOwned(root, lock, { ...w, content: substitute(w.content, lock.substitutions) }, options.dryRun);
      if (outcome === "created") {
        added.push(w.path);
        files.add(w.path);
      }
    }
    const fragment = agentsFragment(root, manifest);
    if (fragment) {
      const before = readApp(root, "AGENTS.md");
      const after = mergeFragment(before, manifest.id, fragment.text, fragment.source);
      if (after !== before) {
        if (!options.dryRun) replaceApp(root, "AGENTS.md", after);
        files.add("AGENTS.md");
      }
    }
  }
  if (!options.dryRun) {
    const before = readApp(root, LOCK_FILE);
    writeLock(root, lock);
    if (readApp(root, LOCK_FILE) !== before) files.add(LOCK_FILE);
  }

  // 4. The doctor.
  let doctor: UpgradeReport["doctor"] = "not run";
  if (options.doctor !== false) {
    try {
      const { runDoctor, formatReport } = await import("../doctor/index.js");
      const result = await runDoctor({ root });
      log(formatReport(result));
      doctor = result.ok ? "passed" : "failed";
    } catch (err) {
      log(`genesis doctor couldn't run: ${err instanceof Error ? err.message : String(err)}`);
      doctor = "failed";
    }
  }

  const lines = [bumpSummary(release.version, changes, skipped)];
  if (codemodRuns.length) lines.push("", "Codemods:", "", ...codemodRuns.map((c) => `- ${c.id}${c.files.length ? `: ${c.files.join(", ")}` : ""}`));
  if (breaks.length) lines.push("", "Major moves with no codemod (read their changelogs):", "", ...breaks.map((b) => `- \`${b.name}\` ${b.from} → ${b.to}`));
  const touched = refreshed.filter((r) => r.outcome !== "unchanged");
  if (touched.length || added.length) {
    lines.push("", options.dryRun ? "Files Genesis owns (against the packages installed now; a real run compares with the new versions after the install):" : "Files Genesis owns:", "", ...touched.map((r) => `- ${r.path}: ${r.outcome}${r.detail ? ` (${r.detail})` : ""}`), ...added.map((a) => `- ${a}: added`));
  }
  if (next.size) lines.push("", "Review and delete these before merging (not committed by --pr):", "", ...[...next].map((n) => `- ${n}`));
  if (lock.substitutions && Object.keys(lock.substitutions).length) lines.push("", `Templates renamed with genesis.lock.json's substitutions: ${Object.entries(lock.substitutions).map(([a, b]) => `${a} → ${b}`).join(", ")}.`);
  if (newMigrations.length) lines.push("", "New package migrations (run `genesis migrate` to copy them):", "", ...newMigrations.map((m) => `- ${m}`));
  if (warnings.length) lines.push("", "Warnings:", "", ...warnings.map((w) => `- ${w}`));
  lines.push("", `\`genesis doctor\` ${doctor === "not run" ? "was not run" : doctor} after the upgrade.`);
  const summary = lines.join("\n");

  const report: UpgradeReport = { version: release.version, changes, skipped, codemods: codemodRuns, breaks, refreshed, added, newMigrations, doctor, files: [...files].sort(), summary };
  if (options.pr && !options.dryRun && files.size) report.pr = openPullRequest(root, release.version, report, prBase!);
  return report;
}

const SUBSTITUTION_VALUE = /^[A-Za-z0-9][A-Za-z0-9 .+-]{0,59}$/;

/**
 * The lock's substitutions rename templates, so only the starter's own values
 * (read from the starter this CLI ships) may be replaced, each with a plain name.
 */
function checkSubstitutions(substitutions: Record<string, string> | undefined): void {
  if (!substitutions || !Object.keys(substitutions).length) return;
  let allowed: string[];
  try {
    const was = starterIdentity(readFileSync(path.join(starterDir(), "starter.config.ts"), "utf8"));
    allowed = [was.name, was.slug, was.scheme, was.bundleId];
  } catch {
    allowed = [];
  }
  for (const [from, to] of Object.entries(substitutions)) {
    if (!allowed.includes(from) || !SUBSTITUTION_VALUE.test(to)) {
      throw new Error(`genesis.lock.json: the substitution ${JSON.stringify(from)} → ${JSON.stringify(to)} isn't one of the starter's names with a plain value; fix the lock by hand.`);
    }
  }
}

/** Before anything is written: a --pr run needs a clean tree, a branch to start from, and a free branch name. */
function checkPullRequest(root: string, version: string): string {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git("status", "--porcelain")) throw new Error("--pr needs a clean working tree (commit or stash your changes first).");
  const base = git("rev-parse", "--abbrev-ref", "HEAD");
  if (base === "HEAD") throw new Error("--pr needs a branch checked out, not a detached HEAD.");
  const branch = `genesis-upgrade/${version}`;
  git("check-ref-format", "--branch", branch);
  let exists = true;
  try {
    git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`);
  } catch {
    exists = false;
  }
  if (exists) throw new Error(`The branch ${branch} already exists; delete it or merge its pull request first.`);
  return base;
}

/** A branch of its own, one commit of the upgrade's files and the lockfile, pushed, and a pull request. */
function openPullRequest(root: string, version: string, report: UpgradeReport, base: string): string {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const branch = `genesis-upgrade/${version}`;
  git("switch", "-c", branch);
  // The lockfile may be in a folder above the app (a workspace), up to the repository's root.
  const top = git("rev-parse", "--show-toplevel");
  const lockfiles: string[] = [];
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    for (const f of ["pnpm-lock.yaml", "bun.lock", "bun.lockb", "package-lock.json", "yarn.lock"]) if (existsSync(path.join(dir, f))) lockfiles.push(path.relative(root, path.join(dir, f)));
    if (lockfiles.length || dir === top || path.dirname(dir) === dir) break;
  }
  const paths = [...report.files.filter((f) => existsSync(path.join(root, f))), ...lockfiles];
  git("add", "--", ...paths);
  git("commit", "-q", "-m", `chore(deps): upgrade Genesis to ${version}`);
  git("push", "-u", "origin", branch);
  const body = path.join(mkdtempSync(path.join(tmpdir(), "genesis-pr-")), "body.md");
  writeFileSync(body, `${report.summary}\n\nOpened by \`genesis upgrade --pr\`.\n`);
  return execFileSync("gh", ["pr", "create", "--base", base, "--head", branch, "--title", `chore(deps): upgrade Genesis to ${version}`, "--body-file", body], { cwd: root, encoding: "utf8" }).trim();
}
