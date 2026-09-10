/**
 * Regression test for the unique `--out` pack path fix in
 * scripts/verify-no-workspace-protocol.mjs.
 *
 * THE BUG: `packForReal` used to share one `--pack-destination` directory and
 * resolve the tarball via stdout / a directory scan. Empty stdout made
 * `path.join(destDir, "")` equal the mkdir'd directory (existsSync true,
 * not a file). With a shared dir, a fallback scan after the first package
 * also saw 2+ `.tgz` files and threw.
 *
 * THE FIX: each package packs to an absolute `--out` path under its own
 * subdirectory (`…/<sanitizedName>/package.tgz`), validated as a real file.
 *
 * This test packs two real fixture packages in sequence into one shared
 * parentDir (mirroring how `main()` loops over `all` with one shared
 * temp root) and asserts both resolve to their OWN tarball, with the
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
  "packForReal — unique absolute --out path",
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

        // Each package wrote to its own absolute --out path under parentDir.
        expect(tgzA).toBe(
          path.join(parentDir, "fixture-pack-a", "package.tgz"),
        );
        expect(tgzB).toBe(
          path.join(parentDir, "fixture-pack-b", "package.tgz"),
        );
        expect(fs.statSync(tgzA).isFile()).toBe(true);
        expect(fs.statSync(tgzB).isFile()).toBe(true);
        expect(path.dirname(tgzA)).not.toBe(path.dirname(tgzB));

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
