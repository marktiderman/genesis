// @vitest-environment node
/**
 * `scripts/gen-exports.mjs` rebuilds `package.json#exports` from scratch, so
 * any hand-added subpath it doesn't know about (the router adapters were
 * one) is silently deleted on the next run. `--check` regenerates in memory
 * and fails on any difference, which locks the generator and the committed
 * map together.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("gen-exports", () => {
  it("regenerates package.json exports unchanged", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/gen-exports.mjs", "--check"], {
        cwd: pkgDir,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("keeps every optional-peer subpath", () => {
    const exportsMap = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).exports;
    for (const key of [
      "./router/react-router",
      "./router/tanstack-router",
      "./rich-text",
      "./rich-text-editor",
      "./sheet-grid",
    ]) {
      expect(exportsMap).toHaveProperty([key]);
    }
  });
});
