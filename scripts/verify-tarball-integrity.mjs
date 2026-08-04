#!/usr/bin/env node
/**
 * verify-tarball-integrity.mjs
 *
 * THE 0.2.1 LESSON (fix c812291, "Build the umbrella in Release; republish
 * 0.2.2"): the Release workflow's build filter (`@marktiderman/genesis-*`)
 * matched every granular package but NOT the umbrella package itself
 * (`@marktiderman/genesis` — no `-suffix`), so `changeset publish` packed
 * an UNBUILT umbrella: the 0.2.1 npm tarball shipped 2 files
 * (package.json + README), no `dist/`, no `.d.ts`. Nothing caught it until
 * a consumer's install broke on a missing entrypoint.
 *
 * This script is the CI gate that would have caught it before publish: for
 * every PUBLISHABLE package (`private !== true` under packages/*) in scope,
 * build it, then run `npm pack --dry-run --json` and assert the resulting
 * tarball actually contains a `dist/` entry AND at least one `.d.ts` (or
 * `.d.cts` / `.d.mts`) file. A missing package fails LOUD with the full
 * tarball file list — never a silent skip.
 *
 * Usage:
 *   node scripts/verify-tarball-integrity.mjs [options]
 *
 * Options:
 *   --all                 Check every publishable package under packages/*,
 *                          regardless of what changed. Used when the diff
 *                          touches release machinery (release.yml,
 *                          pnpm-workspace.yaml, .changeset/config.json, the
 *                          root package.json) or when running locally.
 *   --package <name-or-dir>
 *                          Check exactly this package (may repeat). Overrides
 *                          diff detection. Accepts either the npm package
 *                          name (`@marktiderman/genesis-core`) or its
 *                          directory name (`core`).
 *   --base <ref>           Git ref to diff against when neither --all nor
 *                          --package is given. Defaults to `origin/main`.
 *
 * With no flags at all, the script diffs the working tree against --base
 * and packs only the packages whose directory changed (fast path for a
 * normal PR) — unless the diff also touches release machinery, in which
 * case it silently upgrades to --all (a release-machinery change can affect
 * every package's publish, not just the ones with source edits). The BUILD
 * step always builds the whole publishable set first (unless --skip-build):
 * pnpm's --filter does not traverse peerDependencies, so packing a package
 * in isolation can fail its dts step against an unbuilt sibling.
 *
 * CI wiring: .github/workflows/tarball-integrity.yml
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');

const RELEASE_MACHINERY_FILES = [
  '.github/workflows/release.yml',
  'pnpm-workspace.yaml',
  '.changeset/config.json',
  'package.json',
];

function parseArgs(argv) {
  const opts = { all: false, packages: [], base: 'origin/main', skipBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') {
      opts.all = true;
    } else if (a === '--package') {
      opts.packages.push(argv[++i]);
    } else if (a === '--base') {
      opts.base = argv[++i];
    } else if (a === '--skip-build') {
      // TESTING ONLY — never pass this in CI. Skips the build step so the
      // assertion can be exercised against a deliberately-stale/missing
      // dist/ (e.g. to prove the gate catches the 0.2.1 failure mode:
      // `rm -rf packages/genesis/dist && node scripts/verify-tarball-integrity.mjs --package genesis --skip-build`).
      opts.skipBuild = true;
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listPublishablePackages() {
  const dirs = fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const pkgs = [];
  for (const dir of dirs) {
    const pkgJsonPath = path.join(PACKAGES_DIR, dir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkgJson = readJson(pkgJsonPath);
    if (pkgJson.private === true) continue;
    pkgs.push({ dir, name: pkgJson.name, cwd: path.join(PACKAGES_DIR, dir) });
  }
  return pkgs;
}

// `--no-renames` for the same two reasons as design-system-coverage.mjs:
//   1. tarball-integrity.yml checks out with `filter: blob:none`. Rename
//      detection reads blob CONTENTS, so on a partial clone it lazily fetches
//      base-side blobs and the diff hard-fails when that fetch fails. Without
//      rename detection the diff walks trees only and needs no blobs at all.
//   2. With rename detection on, `--name-only` prints ONLY a rename's
//      destination path - so a file MOVED from packages/a/ to packages/b/
//      leaves packages/a unchecked even though its tarball contents changed.
// A failed diff here already falls back to --all, so this is about cost and
// precision rather than a false PASS.
function gitChangedFiles(base) {
  try {
    const out = execFileSync('git', ['diff', '--no-renames', '--name-only', `${base}...HEAD`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    console.error(`::warning::could not compute git diff against ${base} (${err.message}); falling back to --all.`);
    return null;
  }
}

function resolveTargets(opts, all) {
  if (opts.packages.length > 0) {
    const wanted = new Set(opts.packages);
    const matched = all.filter((p) => wanted.has(p.name) || wanted.has(p.dir));
    const missing = [...wanted].filter((w) => !matched.some((p) => p.name === w || p.dir === w));
    if (missing.length > 0) {
      console.error(`::error::--package requested unknown package(s): ${missing.join(', ')}`);
      process.exit(2);
    }
    return matched;
  }
  if (opts.all) return all;

  const changed = gitChangedFiles(opts.base);
  if (changed === null) return all; // diff failed — fail toward the safer, fuller check

  const touchesReleaseMachinery = changed.some((f) => RELEASE_MACHINERY_FILES.includes(f));
  if (touchesReleaseMachinery) {
    console.log('Release machinery touched — checking ALL publishable packages.');
    return all;
  }

  const touched = all.filter((p) => changed.some((f) => f.startsWith(`packages/${p.dir}/`)));
  if (touched.length === 0) {
    console.log('No publishable package touched by this diff — nothing to check.');
  }
  return touched;
}

// Build EVERY publishable package (pnpm orders them topologically) before packing
// any of them. A package's `dts` build resolves its imports of sibling workspace
// packages against THEIR built types (dist/*.d.ts). Some siblings are declared as
// peerDependencies (e.g. ui-native -> genesis-core), and pnpm's dependency-aware
// --filter does NOT traverse peerDependencies -- so building a single changed package
// in isolation fails its dts step with TS2307 the moment it peer-imports an unbuilt
// sibling. Building the whole publishable set guarantees every peer's types exist.
// The fast path is preserved for PACKING (only changed targets are packed below).
function buildAllPublishable() {
  console.log(`\n=== Building all publishable packages (pnpm --filter "./packages/*" build) ===`);
  const res = spawnSync('pnpm', ['--filter', './packages/*', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: 15 * 60 * 1000,
  });
  if (res.status !== 0) {
    throw new Error(`workspace build failed (exit ${res.status ?? 'timeout'})`);
  }
}

function packDryRun(pkg) {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: pkg.cwd,
    encoding: 'utf8',
    timeout: 60 * 1000,
  });
  if (res.status !== 0) {
    throw new Error(`npm pack --dry-run failed for ${pkg.name}: ${res.stderr || res.stdout}`);
  }
  const parsed = JSON.parse(res.stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = (entry.files || []).map((f) => f.path);
  return files;
}

function assertTarballHasDistAndTypes(pkg, files) {
  const hasDist = files.some((f) => f === 'dist' || f.startsWith('dist/'));
  const hasTypes = files.some((f) => /\.d\.(ts|cts|mts)$/.test(f));
  const problems = [];
  if (!hasDist) problems.push('no dist/ entry');
  if (!hasTypes) problems.push('no .d.ts (or .d.cts/.d.mts) entry');
  return { ok: problems.length === 0, problems };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = listPublishablePackages();
  if (all.length === 0) {
    console.error('::error::No publishable packages found under packages/* — check PACKAGES_DIR.');
    process.exit(1);
  }

  const targets = resolveTargets(opts, all);
  if (targets.length === 0) {
    console.log('Tarball integrity: nothing to check. PASS (no-op).');
    return;
  }

  console.log(`Tarball integrity check for: ${targets.map((p) => p.name).join(', ')}`);

  if (opts.skipBuild) {
    console.log('\n=== Skipping build (--skip-build, testing only) ===');
  } else {
    try {
      buildAllPublishable();
    } catch (err) {
      // Route a build failure through the same loud ::error:: contract the
      // per-package pack failures use below, instead of surfacing as an
      // uncaught exception (raw stack trace, no GitHub Actions annotation).
      console.error(`\n::error::Tarball integrity check FAILED — ${err.message}`);
      process.exit(1);
    }
  }

  const failures = [];
  for (const pkg of targets) {
    try {
      const files = packDryRun(pkg);
      const { ok, problems } = assertTarballHasDistAndTypes(pkg, files);
      if (ok) {
        console.log(`PASS: ${pkg.name} — tarball has dist/ and a .d.ts file.`);
      } else {
        failures.push({ pkg: pkg.name, problems, files });
      }
    } catch (err) {
      failures.push({ pkg: pkg.name, problems: [err.message], files: [] });
    }
  }

  if (failures.length > 0) {
    console.error('\n::error::Tarball integrity check FAILED — the following package(s) would publish a broken tarball:');
    for (const f of failures) {
      console.error(`\n  ${f.pkg}:`);
      for (const p of f.problems) console.error(`    - ${p}`);
      if (f.files.length > 0) {
        console.error(`    tarball contents (${f.files.length} files): ${f.files.slice(0, 40).join(', ')}${f.files.length > 40 ? ', …' : ''}`);
      }
    }
    console.error('\nThis is the 0.2.1 failure mode: a publishable package packed without dist/ or types.');
    process.exit(1);
  }

  console.log(`\nTarball integrity: PASS (${targets.length} package(s) verified).`);
}

main();
