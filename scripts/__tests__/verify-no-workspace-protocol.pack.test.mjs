/**
 * Regression test for the per-package pack destination fix in
 * scripts/verify-no-workspace-protocol.mjs.
 *
 * THE BUG: `packForReal` used to pack every package into one shared
 * destination directory. The fallback directory scan (used when pnpm's
 * stdout doesn't parse to a tarball path we recognise) lists every `.tgz`
 * in that directory and requires exactly one match — with a shared
 * directory, the second package's scan sees the first package's leftover
 * tarball too, `candidates.length !== 1`, and the guard throws for every
 * package after the first.
 *
 * THE FIX: each package now packs into its own subdirectory
 * (`path.join(parentDir, sanitizedName)`), so the scan is unambiguous by
 * construction regardless of pack order or count.
 *
 * This test packs two real fixture packages in sequence into one shared
 * parentDir (mirroring how `main()` loops over `all` with one shared
 * `destDir`) and asserts both resolve to their OWN tarball, with the
 * correct name inside, and to distinct directories.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  packForReal,
  readPackedPackageJson,
} from "../verify-no-workspace-protocol.mjs";

let workDir;

function makeFixturePackage(name) {
  const cwd = path.join(workDir, name);
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify({ name, version: "1.0.0", files: ["index.js"] }, null, 2),
  );
  fs.writeFileSync(path.join(cwd, "index.js"), "module.exports = {};\n");
  return { dir: name, name, cwd };
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-pack-fixture-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

// pnpm must actually be resolvable on PATH for this test to exercise the
// real spawnSync path (not the pure unit-tested findWorkspaceProtocolDeps).
// Skip cleanly rather than fail red if pnpm genuinely is not on PATH.
const pnpmAvailable =
  spawnSync("pnpm", ["--version"], { encoding: "utf8" }).status === 0;

describe.skipIf(!pnpmAvailable)(
  "packForReal — per-package destination directory",
  () => {
    it("packs two packages in sequence into one shared parentDir without collision", () => {
      const parentDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "genesis-pack-dest-"),
      );
      try {
        const pkgA = makeFixturePackage("fixture-pack-a");
        const pkgB = makeFixturePackage("fixture-pack-b");

        const tgzA = packForReal(pkgA, parentDir);
        const tgzB = packForReal(pkgB, parentDir);

        // Each tarball landed in its own subdirectory of parentDir, not a
        // shared one — this is the fix under test.
        expect(path.dirname(tgzA)).not.toBe(path.dirname(tgzB));
        expect(path.dirname(tgzA)).toBe(path.join(parentDir, "fixture-pack-a"));
        expect(path.dirname(tgzB)).toBe(path.join(parentDir, "fixture-pack-b"));

        // Each subdirectory holds exactly one tarball — the invariant the
        // candidates.length !== 1 fallback check depends on.
        expect(
          fs.readdirSync(path.dirname(tgzA)).filter((f) => f.endsWith(".tgz")),
        ).toHaveLength(1);
        expect(
          fs.readdirSync(path.dirname(tgzB)).filter((f) => f.endsWith(".tgz")),
        ).toHaveLength(1);

        // And each tarball actually contains ITS OWN package.json, not the
        // other package's (the corruption the shared-directory bug risked).
        expect(readPackedPackageJson(tgzA).name).toBe("fixture-pack-a");
        expect(readPackedPackageJson(tgzB).name).toBe("fixture-pack-b");
      } finally {
        fs.rmSync(parentDir, { recursive: true, force: true });
      }
    });
  },
);
