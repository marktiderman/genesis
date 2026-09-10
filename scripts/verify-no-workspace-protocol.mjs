#!/usr/bin/env node
/**
 * verify-no-workspace-protocol.mjs
 *
 * THE 2.1.0 LESSON: @marktiderman/genesis-ui@2.1.0 (and five sibling
 * packages) were published to npm on 2026-09-10 with a literal
 * `"workspace:^"` / `"workspace:*"` string left in `dependencies` or
 * `peerDependencies`. No consumer can install a package like that —
 * `workspace:` is a pnpm-workspace-local protocol, meaningless off disk.
 *
 * MEASURED root cause: this repo's `changeset publish` (via
 * `package-manager-detector`, already used by @changesets/cli ~2.30.0)
 * correctly shells out to `pnpm publish`, which DOES rewrite `workspace:`
 * ranges to real semver at pack time — proven locally with
 * `pnpm --filter <pkg> pack` + reading the tarball's package.json. But the
 * CI release pipeline never actually got that far: every non-`genesis-cli`
 * package failed the OIDC Trusted Publisher exchange with 404 (see
 * release.yml's history), so the six packages that *did* land on npm at
 * 2026-09-10T14:37:2x were published by some path OUTSIDE this pnpm-aware
 * pipeline — almost certainly a manual `npm publish` per package, which
 * has no idea what `workspace:` means and copies the raw string verbatim.
 *
 * This script is the gate that makes that failure mode loud instead of
 * silent, regardless of how a future publish actually happens: it builds
 * the publishable set, PACKS each one for real (not `--dry-run` — the
 * dry-run JSON does not include rewritten package.json content, only the
 * file list), extracts the tarball, and fails if `dependencies`,
 * `peerDependencies` or `optionalDependencies` in the packed package.json
 * contains any value starting with `workspace:`.
 *
 * Usage:
 *   node scripts/verify-no-workspace-protocol.mjs [--skip-build]
 *
 * CI wiring: .github/workflows/release.yml, as a step between "Build
 * packages" and "Create Release PR or Publish" — so a broken range fails
 * the release job before anything reaches the registry.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");

const DEP_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listPublishablePackages() {
  const dirs = fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const pkgs = [];
  for (const dir of dirs) {
    const pkgJsonPath = path.join(PACKAGES_DIR, dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkgJson = readJson(pkgJsonPath);
    if (pkgJson.private === true) continue;
    pkgs.push({ dir, name: pkgJson.name, cwd: path.join(PACKAGES_DIR, dir) });
  }
  return pkgs;
}

function buildAllPublishable() {
  console.log(
    '\n=== Building all publishable packages (pnpm --filter "./packages/*" build) ===',
  );
  const res = spawnSync("pnpm", ["--filter", "./packages/*", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    timeout: 15 * 60 * 1000,
  });
  if (res.status !== 0) {
    throw new Error(`workspace build failed (exit ${res.status ?? "timeout"})`);
  }
}

// Untar a .tgz in-process (no shell `tar` dependency) and return the parsed
// contents of package/package.json. A minimal tar reader is enough here: npm
// and pnpm tarballs are always a single `package/` root, uncompressed-then-
// gzipped, in the plain POSIX ustar format node's own tarball tooling emits.
function readPackedPackageJson(tgzPath) {
  const gz = fs.readFileSync(tgzPath);
  const tar = zlib.gunzipSync(gz);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    // An all-zero header marks the end of the archive.
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const sizeOctal = header
      .subarray(124, 136)
      .toString("utf8")
      .replace(/\0.*$/s, "")
      .trim();
    const size = parseInt(sizeOctal, 8) || 0;
    const dataStart = offset + 512;
    if (name === "package/package.json") {
      const content = tar
        .subarray(dataStart, dataStart + size)
        .toString("utf8");
      return JSON.parse(content);
    }
    const blocks = Math.ceil(size / 512);
    offset = dataStart + blocks * 512;
  }
  throw new Error(`package/package.json not found in ${tgzPath}`);
}

function packForReal(pkg, destDir) {
  const res = spawnSync("pnpm", ["pack", "--pack-destination", destDir], {
    cwd: pkg.cwd,
    encoding: "utf8",
    timeout: 60 * 1000,
  });
  if (res.status !== 0) {
    throw new Error(
      `pnpm pack failed for ${pkg.name}: ${res.stderr || res.stdout}`,
    );
  }
  const lastLine = res.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  const tgzPath = fs.existsSync(lastLine)
    ? lastLine
    : path.join(destDir, `${lastLine}`);
  if (!fs.existsSync(tgzPath)) {
    // Fall back to scanning destDir for the single new .tgz — pnpm's stdout
    // format has changed across versions.
    const candidates = fs
      .readdirSync(destDir)
      .filter((f) => f.endsWith(".tgz"));
    if (candidates.length !== 1) {
      throw new Error(
        `could not locate packed tarball for ${pkg.name} in ${destDir} (stdout: ${res.stdout})`,
      );
    }
    return path.join(destDir, candidates[0]);
  }
  return tgzPath;
}

export function findWorkspaceProtocolDeps(packageJson) {
  const problems = [];
  for (const field of DEP_FIELDS) {
    const deps = packageJson[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        problems.push(`${field}.${name} = "${range}"`);
      }
    }
  }
  return problems;
}

function main() {
  const skipBuild = process.argv.includes("--skip-build");
  const all = listPublishablePackages();
  if (all.length === 0) {
    console.error(
      "::error::No publishable packages found under packages/* — check PACKAGES_DIR.",
    );
    process.exit(1);
  }

  console.log(
    `Workspace-protocol guard for: ${all.map((p) => p.name).join(", ")}`,
  );

  if (skipBuild) {
    console.log("\n=== Skipping build (--skip-build, testing only) ===");
  } else {
    try {
      buildAllPublishable();
    } catch (err) {
      console.error(
        `\n::error::Workspace-protocol guard FAILED — ${err.message}`,
      );
      process.exit(1);
    }
  }

  const destDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "genesis-workspace-protocol-"),
  );
  const failures = [];
  try {
    for (const pkg of all) {
      try {
        const tgzPath = packForReal(pkg, destDir);
        const packedPackageJson = readPackedPackageJson(tgzPath);
        const problems = findWorkspaceProtocolDeps(packedPackageJson);
        if (problems.length === 0) {
          console.log(
            `PASS: ${pkg.name} — no workspace: protocol in the packed package.json.`,
          );
        } else {
          failures.push({ pkg: pkg.name, problems });
        }
      } catch (err) {
        failures.push({ pkg: pkg.name, problems: [err.message] });
      }
    }
  } finally {
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(
      "\n::error::Workspace-protocol guard FAILED — the following package(s) would publish an unresolvable dependency:",
    );
    for (const f of failures) {
      console.error(`\n  ${f.pkg}:`);
      for (const p of f.problems) console.error(`    - ${p}`);
    }
    console.error(
      "\nThis is the 2.1.0 failure mode: a packed package.json still carrying the pnpm-workspace-local `workspace:` protocol.",
    );
    console.error(
      "If this fires from a manual/local publish, use `pnpm publish` (not `npm publish`) so pnpm rewrites the range at pack time.",
    );
    process.exit(1);
  }

  console.log(
    `\nWorkspace-protocol guard: PASS (${all.length} package(s) verified).`,
  );
}

// Only run when invoked directly (`node scripts/verify-no-workspace-protocol.mjs`),
// not when imported by a test — the pure `findWorkspaceProtocolDeps` above is
// unit-tested in scripts/__tests__/verify-no-workspace-protocol.test.mjs.
if (process.argv[1] === __filename) {
  main();
}
