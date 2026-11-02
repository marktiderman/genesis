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
 * 3. Install (then, for pnpm, Genesis's release-age excludes become one entry of exact versions per
 *    package, which a frozen install reads, and a dedupe), then refresh owned files (templates, Edge Functions, skills,
 *    pgTAP tests) by a three-way decision (blocks/owned.ts), replace AGENTS.md
 *    fragments, copy skills a block gained, and report new package migrations
 *    (`genesis migrate` copies them).
 * 4. The doctor, then a summary, or with `--pr` a branch, a commit and a pull request.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { agentsFragment, ownedWrites, pinGenesisImports, sourceMigrations } from "../blocks/add.js";
import { mergeFragment } from "../blocks/agents.js";
import { catalogBlocks, findBlock, packageDir, packageVersion } from "../blocks/discover.js";
import { appBlocksSwitchedOff, blockOfSource, switchedOffNote } from "../blocks/starter-features.js";
import { readApp, readPackageFile, replaceApp, sha256 } from "../blocks/files.js";
import { starterIdentity } from "../blocks/init-native.js";
import { LOCK_FILE, parseSource, readLock, substitute, writeLock } from "../blocks/lock.js";
import { planMigrations, TESTS_DIR } from "../blocks/migrations.js";
import { copyOwned, ownedKeyProblem, refreshOwned, type RefreshOutcome } from "../blocks/owned.js";
import { localPackageNames } from "../blocks/local.js";
import { dedupeCommand, detectPackageManager, findLockfile, installCommand, run, shellLine } from "../blocks/pm.js";
import { starterDir, templatesDir } from "../blocks/templates.js";
import { bumpPackageJson, bumpSummary, normaliseReleaseAgeExcludes, pnpmReadsExactExcludes, pnpmWorkspaceFile, releaseAgeExcludeProblems, tidyLocked, UMBRELLA, type BumpChange, type BumpSkip } from "./bump-core.mjs";
import { codemodsFor, uncoveredBreaks, CODEMODS, type Codemod } from "./codemods.js";
import { applyOverlayPlans, gitUpstream, overlayChecklist, planOverlays, type OverlayPlan, type UpstreamSource } from "./overlays.js";

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
  /**
   * After the install, collapse duplicate installs (`pnpm dedupe`, `npm dedupe`; bun and yarn are
   * skipped). Default: on with the real install, off with an install function; or dedupe this way (tests).
   */
  dedupe?: boolean | ((root: string) => void);
  doctor?: boolean;
  /** Leave every owned file the app changed as it is (the new text goes to .genesis-next), without merging. */
  keepMine?: boolean;
  /** Open a pull request. */
  pr?: boolean;
  lookup?: ReleaseLookup;
  codemods?: readonly Codemod[];
  /** Where overlays' upstream source is read (default: the Genesis repository's release tags). */
  upstream?: UpstreamSource;
  /** The pnpm version the install ran (default: `pnpm --version` in the app); null when unknown. */
  pnpmVersion?: () => string | null;
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
  /** Locked blocks left out because their starter.config.ts switch is off, with why. */
  switchedOff: string[];
  newMigrations: string[];
  doctor: "passed" | "failed" | "not run";
  files: string[];
  summary: string;
  pr?: string;
  /** Each overlay rebased onto the release (overlays.ts), with its checklist. */
  overlays: OverlayPlan[];
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

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Rewrites pnpm-workspace.yaml's Genesis release-age excludes as one entry of exact versions per
 * package, without the versions the lockfile beside it no longer holds; true when it changed.
 */
function tidyReleaseAgeExcludes(file: string): boolean {
  const before = readText(file);
  if (before === null) return false;
  const dir = path.dirname(file);
  const after = normaliseReleaseAgeExcludes(before, tidyLocked(before, readText(path.join(dir, "pnpm-lock.yaml")), readText(path.join(dir, ".npmrc"))));
  if (after === before) return false;
  writeFileSync(file, after);
  return true;
}

/** The repository's top level (its real path), or null outside git. */
function gitTopLevel(root: string): string | null {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return top ? realpathSync(top) : null;
  } catch {
    return null;
  }
}

const inside = (dir: string, file: string) => {
  const rel = path.relative(dir, file);
  return rel === "" || (rel.split(path.sep)[0] !== ".." && !path.isAbsolute(rel));
};

/**
 * Where pnpm writes its excludes for an install in `root`: the nearest pnpm-workspace.yaml at or
 * above the app, as pnpm finds it, but never above the repository's top level (a file outside the
 * repository is neither rewritten nor committed by --pr); else beside the lockfile (a standalone
 * app, where pnpm creates it), or in the app when the lockfile is outside the repository.
 */
export function pnpmWorkspaceFileFor(root: string): string {
  const real = realpathSync(root);
  const top = gitTopLevel(real);
  const lockDir = findLockfile(real)?.dir;
  const fallback = lockDir && (!top || inside(top, lockDir)) ? lockDir : real;
  return pnpmWorkspaceFile(real, fallback, { exists: existsSync, join: path.join, dirname: path.dirname }, top ?? undefined);
}

/** `pnpm --version` in the app (its packageManager pin applies), or null. */
function pnpmVersionIn(root: string): string | null {
  try {
    return execFileSync("pnpm", ["--version"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/** pnpm's strict-mode refusal: a version younger than minimumReleaseAge, which the app set itself. */
const NOT_MATURE = "ERR_PNPM_NO_MATURE_MATCHING_VERSION";

/** The install failed because pnpm's strict mode refused young Genesis versions: a clear way on. */
export function releaseAgeError(output: string): Error | null {
  if (!output.includes(NOT_MATURE)) return null;
  const young = [...new Set([...output.matchAll(/(@marktiderman\/genesis(?:-[a-z0-9-]+)?@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) was published/g)].map((m) => m[1]!))];
  return new Error(
    [
      `pnpm refused the new Genesis versions (${NOT_MATURE}): they are younger than this app's \`minimumReleaseAge\`, and with \`minimumReleaseAge\` set, pnpm installs nothing younger (strict mode).`,
      ...(young.length ? ["", ...young.map((v) => `  ${v}`)] : []),
      "",
      "genesis upgrade doesn't loosen that for you. Either:",
      "- wait until those versions are old enough, then run genesis upgrade again; or",
      `- add them to \`minimumReleaseAgeExclude\` in pnpm-workspace.yaml, exact versions, one entry per package ('@marktiderman/genesis-ui@2.26.0 || 2.27.0'), and run genesis upgrade again.`,
      "",
      "The package.json files are already bumped; `git checkout` them to start over.",
    ].join("\n"),
  );
}

/** Runs the install with its output shown as it comes, keeping it to read pnpm's error. */
function runInstall(root: string, argv: string[]): Promise<void> {
  const [cmd, ...args] = argv;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd!, args, { cwd: root, stdio: ["inherit", "pipe", "pipe"] });
    let output = "";
    const keep = (to: NodeJS.WriteStream) => (chunk: Buffer) => {
      to.write(chunk);
      if (output.length < 1_000_000) output += chunk.toString("utf8");
    };
    child.stdout.on("data", keep(process.stdout));
    child.stderr.on("data", keep(process.stderr));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) return resolve();
      reject(releaseAgeError(output) ?? new Error(`${shellLine(argv)} failed (${signal ?? `exit code ${code}`})`));
    });
  });
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

  // Overlays: cleaned out and rebased onto the release, planned before anything is written, so a
  // conflict stops the upgrade with nothing changed.
  const upstream = options.upstream ?? gitUpstream();
  let overlays: OverlayPlan[];
  try {
    overlays = planOverlays(root, wanted, upstream);
  } finally {
    upstream.close?.();
  }
  const conflicted = overlays.filter((o) => o.conflicts.length);
  if (conflicted.length && !options.dryRun) {
    throw new Error(
      [
        `The rebase of ${conflicted.map((o) => `${o.name} onto ${o.to}`).join(", ")} conflicts; nothing was changed. Rebase these by hand (or drop what Genesis now ships), then run genesis upgrade again:`,
        ...conflicted.flatMap((o) => o.conflicts.map((f) => `  ${o.rel}/${f}`)),
        ...overlayChecklist(overlays),
      ].join("\n"),
    );
  }
  // A rebased overlay's package.json is the rebase's to write.
  for (const o of overlays) if (!o.skipped) bumped.delete(`${o.rel}/package.json`);


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
    for (const file of applyOverlayPlans(root, overlays, packageJsons(root))) files.add(file);
  }
  for (const mod of mods) {
    log(`codemod ${mod.id}: ${mod.description}`);
    const changed = await mod.run({ root, dryRun: Boolean(options.dryRun), log });
    codemodRuns.push({ id: mod.id, files: changed });
    for (const f of changed) files.add(f);
  }

  // 2. Install, keep pnpm's release-age excludes readable by a frozen install, and dedupe.
  const pm = detectPackageManager(root);
  let tidiedExcludes: string | null = null;
  const excludeWarnings: string[] = [];
  if (!options.dryRun && options.install !== false && bumped.size) {
    const workspaceFile = pm === "pnpm" ? pnpmWorkspaceFileFor(root) : null;
    const relWorkspace = workspaceFile ? path.relative(realpathSync(root), workspaceFile) : null;
    const workspaceBefore = workspaceFile ? readText(workspaceFile) : null;
    const tidy = () => {
      if (!workspaceFile || !tidyReleaseAgeExcludes(workspaceFile)) return;
      tidiedExcludes = relWorkspace;
      log(`${tidiedExcludes}: minimumReleaseAgeExclude lists each Genesis package's pinned versions in one entry, exact versions the lockfile holds`);
    };
    if (typeof options.install === "function") {
      try {
        options.install(root);
      } catch (err) {
        const e = err as { message?: unknown; stdout?: unknown; stderr?: unknown };
        throw releaseAgeError([e.message, e.stdout, e.stderr].map((x) => (x == null ? "" : String(x))).join("\n")) ?? err;
      }
    } else {
      log(`install: ${shellLine(installCommand(pm))}`);
      await runInstall(root, installCommand(pm));
    }
    tidy();
    const dedupe = options.dedupe ?? (typeof options.install === "function" ? false : true);
    const dedupeArgv = dedupeCommand(pm);
    if (typeof dedupe === "function") dedupe(root);
    else if (dedupe && dedupeArgv) {
      log(`dedupe: ${shellLine(dedupeArgv)}`);
      run(root, dedupeArgv);
    }
    if (dedupe) tidy();
    // pnpm writes its excludes here; the pull request must carry them, or CI's frozen install fails.
    if (relWorkspace && readText(workspaceFile!) !== workspaceBefore) files.add(relWorkspace);
    const after = workspaceFile ? readText(workspaceFile) : null;
    if (after !== null && /^minimumReleaseAgeExclude:/m.test(after)) {
      for (const p of releaseAgeExcludeProblems(after)) excludeWarnings.push(`${relWorkspace}: ${p}`);
      const version = (options.pnpmVersion ?? (() => pnpmVersionIn(root)))();
      if (!pnpmReadsExactExcludes(version)) {
        excludeWarnings.push(`pnpm ${version} reads minimumReleaseAgeExclude's exact versions ('name@1.0.0 || 1.1.0') as matching nothing; use pnpm 10.19 or later (packageManager in package.json), or the Genesis versions wait out minimumReleaseAge`);
      }
    }
  }

  // 3. The blocks: new migrations first (a pgTAP test isn't refreshed ahead of its migration),
  // then owned files, skills a block gained, and fragments.
  const added: string[] = [];
  const newMigrations: string[] = [];
  const warnings: string[] = [...excludeWarnings];
  const manifests = [];
  // A block whose starter.config.ts switch is off is left out: no migrations planned, no files refreshed or added.
  const catalog = catalogBlocks();
  const off = appBlocksSwitchedOff(root, catalog, Object.keys(lock.blocks));
  const switchedOff: string[] = [];
  const offManifests = [];
  for (const [id, entry] of Object.entries(lock.blocks)) {
    const feature = off.get(id);
    if (feature) {
      switchedOff.push(switchedOffNote(id, feature));
      // Read only to know which owned files are its.
      try {
        offManifests.push((await findBlock(root, id, { package: entry.package })).manifest);
      } catch {
        offManifests.push(...catalog.filter((m) => m.id === id));
      }
      continue;
    }
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
    if (offManifests.length && blockOfSource(entry.source, offManifests)) continue;
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
  if (switchedOff.length) lines.push("", "Blocks switched off (left out):", "", ...switchedOff.map((s) => `- ${s}`));
  if (newMigrations.length) lines.push("", "New package migrations (run `genesis migrate` to copy them):", "", ...newMigrations.map((m) => `- ${m}`));
  if (tidiedExcludes) lines.push("", `pnpm pinned the new Genesis versions in \`${tidiedExcludes}\`'s \`minimumReleaseAgeExclude\` (they are younger than \`minimumReleaseAge\`). Each Genesis package now has one entry listing its exact versions in the lockfile (\`'name@1.0.0 || 1.1.0'\`), which \`pnpm install --frozen-lockfile\` honours; versions the lockfile no longer holds were dropped. Never a pattern, so a future Genesis release still waits out \`minimumReleaseAge\`. Other entries are as they were.`);
  lines.push(...overlayChecklist(overlays));
  if (warnings.length) lines.push("", "Warnings:", "", ...warnings.map((w) => `- ${w}`));
  lines.push("", `\`genesis doctor\` ${doctor === "not run" ? "was not run" : doctor} after the upgrade.`);
  const summary = lines.join("\n");

  const report: UpgradeReport = { version: release.version, changes, skipped, codemods: codemodRuns, breaks, refreshed, added, switchedOff, newMigrations, doctor, files: [...files].sort(), summary, overlays };
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
  // What the overlay rebase deleted (a file gone upstream, or the whole overlay), staged as deletions.
  const overlayDirs = report.overlays.filter((o) => !o.skipped && !o.conflicts.length && (o.remove || [...o.writes.values()].includes(null))).map((o) => o.rel);
  if (overlayDirs.length) git("add", "-A", "--", ...overlayDirs);
  git("commit", "-q", "-m", `chore(deps): upgrade Genesis to ${version}`);
  git("push", "-u", "origin", branch);
  const body = path.join(mkdtempSync(path.join(tmpdir(), "genesis-pr-")), "body.md");
  writeFileSync(body, `${report.summary}\n\nOpened by \`genesis upgrade --pr\`.\n`);
  return execFileSync("gh", ["pr", "create", "--base", base, "--head", branch, "--title", `chore(deps): upgrade Genesis to ${version}`, "--body-file", body], { cwd: root, encoding: "utf8" }).trim();
}
