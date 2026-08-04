#!/usr/bin/env node
/**
 * smoke-web-install.mjs
 *
 * Proves the umbrella's core promise: a PURE-WEB consumer installing
 * `@marktiderman/genesis` never gets an unmet `react-native` peer warning.
 *
 * Why a real install and not a static check: the umbrella hard-depends on
 * `@marktiderman/genesis-ui-native`, so a web consumer pulls that package
 * transitively. If `react-native` is a NON-optional peer of ui-native, the
 * pure-web install emits an unmet-peer warning — a transitive effect the
 * workspace pack-gate cannot see (it only inspects the umbrella's own
 * manifest). The only way to catch it is to actually pack + install and
 * read the resolver's output.
 *
 * What it does:
 *   1. Builds the umbrella + its six granular deps.
 *   2. `pnpm pack`s all seven into tarballs.
 *   3. Pack-gate assertions on the umbrella tarball:
 *        - no `workspace:` protocol leaked into the packed manifest,
 *        - every `exports` subpath's dist target is present in the tarball.
 *   4. Creates a scratch project in a temp dir with ONLY web deps
 *      (`react`, `react-dom`) depending on the packed umbrella via `file:`,
 *      with `pnpm.overrides` mapping each granular dep to its local tarball
 *      (they are unpublished), and runs `pnpm install`.
 *   5. Asserts the install output contains NO unmet/missing `react-native`
 *      peer warning.
 *   6. Cleans up the temp dir.
 *
 * Exit codes: 0 clean, 1 on any assertion failure.
 *
 * Usage: node packages/genesis/scripts/smoke-web-install.mjs
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const UMBRELLA = { name: "@marktiderman/genesis", dir: "packages/genesis" };
const GRANULAR = [
  { name: "@marktiderman/genesis-core", dir: "packages/core" },
  { name: "@marktiderman/genesis-ui", dir: "packages/ui" },
  { name: "@marktiderman/genesis-design-system", dir: "packages/design-system" },
  { name: "@marktiderman/genesis-switchboard", dir: "packages/data-switchboard" },
  { name: "@marktiderman/genesis-ui-native", dir: "packages/ui-native" },
];
const ALL = [UMBRELLA, ...GRANULAR];

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: opts.cwd ?? REPO_ROOT,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  return { code: res.status ?? 1, stdout, stderr, out: stdout + stderr };
}

function fail(msg, detail) {
  console.error(`\nFAIL ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function tarballName(name, version) {
  // pnpm pack naming: @scope/pkg -> scope-pkg-<version>.tgz
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-web-smoke-"));
const tarballDir = path.join(scratch, "tarballs");
const projectDir = path.join(scratch, "project");
fs.mkdirSync(tarballDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
process.on("exit", cleanup);

try {
  console.log("== 1. Build umbrella + granular deps ==");
  for (const pkg of ALL) {
    const b = run("pnpm", ["--filter", pkg.name, "build"]);
    if (b.code !== 0) fail(`build failed for ${pkg.name}`, b.out);
    console.log(`  built ${pkg.name}`);
  }

  console.log("\n== 2. pnpm pack all seven ==");
  const tarballs = {};
  for (const pkg of ALL) {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, pkg.dir, "package.json"), "utf8")
    );
    const p = run("pnpm", ["pack", "--pack-destination", tarballDir], {
      cwd: path.join(REPO_ROOT, pkg.dir),
    });
    if (p.code !== 0) fail(`pack failed for ${pkg.name}`, p.out);
    const expected = path.join(tarballDir, tarballName(pkg.name, pkgJson.version));
    if (!fs.existsSync(expected)) fail(`packed tarball not found: ${expected}`, p.out);
    tarballs[pkg.name] = expected;
    console.log(`  packed ${pkg.name} -> ${path.basename(expected)}`);
  }

  console.log("\n== 3. Pack-gate on umbrella tarball ==");
  const extractDir = path.join(scratch, "extract");
  fs.mkdirSync(extractDir, { recursive: true });
  const x = run("tar", ["-xzf", tarballs[UMBRELLA.name], "-C", extractDir]);
  if (x.code !== 0) fail("could not extract umbrella tarball", x.out);
  const packedPkgPath = path.join(extractDir, "package", "package.json");
  const packedPkg = JSON.parse(fs.readFileSync(packedPkgPath, "utf8"));

  // 3a. no workspace: protocol leaked into the published manifest
  const leaks = Object.entries(packedPkg.dependencies ?? {}).filter(([, v]) =>
    String(v).startsWith("workspace:")
  );
  if (leaks.length) {
    fail(
      "workspace: protocol leaked into packed umbrella manifest",
      leaks.map(([k, v]) => `  ${k}: ${v}`).join("\n")
    );
  }
  console.log("  OK no workspace: leak in packed dependencies");

  // 3b. every exports subpath's dist target is present in the tarball
  const missingSubpaths = [];
  for (const [subpath, cond] of Object.entries(packedPkg.exports ?? {})) {
    for (const target of [cond.import, cond.types]) {
      if (!target) continue;
      const rel = target.replace(/^\.\//, "");
      if (!fs.existsSync(path.join(extractDir, "package", rel))) {
        missingSubpaths.push(`${subpath} -> ${target}`);
      }
    }
  }
  if (missingSubpaths.length) {
    fail("umbrella tarball missing export targets", missingSubpaths.join("\n"));
  }
  console.log(
    `  OK all ${Object.keys(packedPkg.exports ?? {}).length} export subpaths present in tarball`
  );

  console.log("\n== 4. Scratch web-only install ==");
  const projectPkg = {
    name: "genesis-web-smoke",
    version: "0.0.0",
    private: true,
    dependencies: {
      "@marktiderman/genesis": `file:${tarballs[UMBRELLA.name]}`,
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    // Granular deps are unpublished; map each to its local tarball so the
    // umbrella's transitive deps resolve. Only web runtime deps (react,
    // react-dom) are declared above — deliberately NO react-native.
    pnpm: {
      overrides: Object.fromEntries(
        GRANULAR.map((g) => [g.name, `file:${tarballs[g.name]}`])
      ),
    },
  };
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(projectPkg, null, 2)
  );

  // auto-install-peers=false is critical: with pnpm's default (true), a
  // missing NON-optional peer is silently installed and never warned about,
  // so the test could not tell an optional peer from a required one. Turning
  // it off makes an unmet required `react-native` peer surface as a warning —
  // exactly the reviewer's scenario — so this test truly discriminates the fix.
  const install = run(
    "pnpm",
    [
      "install",
      "--ignore-workspace",
      "--no-frozen-lockfile",
      "--config.auto-install-peers=false",
    ],
    { cwd: projectDir }
  );
  console.log("--- pnpm install output (scratch web project) ---");
  console.log(install.out.trimEnd());
  console.log("--- end install output ---");

  console.log("\n== 5. Assert no react-native peer warning ==");
  // Match the BARE `react-native` peer only. `(^|\s)peer react-native@`
  // catches the dependency-tree warning (`missing peer react-native@…`);
  // a trimmed line starting `react-native@` catches the "Peer dependencies
  // that should be installed" summary list. Both guards exclude sibling
  // packages like `lucide-react-native@` and `react-native-safe-area-context@`.
  const rnPeerLines = install.out.split("\n").filter((l) => {
    const t = l.trim();
    return /(^|\s)peer react-native@/.test(l) || /^react-native@/.test(t);
  });
  if (rnPeerLines.length) {
    fail(
      "unmet/missing react-native peer warning present in web-only install",
      rnPeerLines.map((l) => `  ${l.trim()}`).join("\n")
    );
  }
  console.log("  OK no unmet react-native peer warning in web-only install");

  console.log("\nPASS web-only umbrella install is react-native-clean.");
  cleanup();
  process.exit(0);
} catch (err) {
  cleanup();
  fail("unexpected error", err && err.stack ? err.stack : String(err));
}
