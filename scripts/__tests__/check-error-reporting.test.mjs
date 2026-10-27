/**
 * scripts/check-error-reporting.mjs: package code reports caught errors through
 * genesis-core's reportError (never a bare console.error/warn) and never swallows
 * one in an empty catch. The last test runs the check on the repo itself, so CI's
 * script tests enforce it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepo, scanSource } from "../check-error-reporting.mjs";

describe("scanSource", () => {
  it("finds console.error and console.warn, not console.log", () => {
    const found = scanSource(['console.error("a");', "console.warn('b', e);", 'console.log("c");'].join("\n"));
    expect(found.console.map((h) => h.line)).toEqual([1, 2]);
  });

  it("skips calls in comments and calls carrying a marker within three lines above", () => {
    const source = [
      "/**",
      " * Default console.error(...) in development.",
      " */",
      "// console.warn(old)",
      "const x = 1; // then console.warn(x)",
      "// genesis-allow-console: a development hint",
      "if (dev)",
      "  console.warn('hint');",
      "",
      "",
      "",
      "console.error('unmarked: the marker is four lines up');",
    ].join("\n");
    const found = scanSource(source);
    expect(found.marked).toBe(1);
    expect(found.console.map((h) => h.line)).toEqual([12]);
  });

  it("flags an empty catch, with or without a binding, but not one that says why", () => {
    const source = ["try { a(); } catch {}", "try { b(); } catch (e) { }", "try { c(); } catch {", "  // the cache is optional", "}"].join("\n");
    expect(scanSource(source).emptyCatch.map((h) => h.line)).toEqual([1, 2]);
  });
});

describe("checkRepo", () => {
  function repo(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-error-reporting-"));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
  }

  it("fails a new console call, passes an allow-listed one within its count, and ignores tests", () => {
    const root = repo({
      "packages/a/src/new.ts": "console.warn('x');",
      "packages/a/src/old.ts": "console.warn('x');",
      "packages/a/src/__tests__/t.test.ts": "console.error('fine');",
      "packages/a/src/x.test.ts": "console.error('fine');",
    });
    const { problems } = checkRepo(root, [{ path: "packages/a/src/old.ts", max: 1, reason: "r" }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^packages\/a\/src\/new\.ts:1: console\.error\/warn/);
  });

  it("fails a file over its allowed count, and an entry that matches nothing any more", () => {
    const root = repo({ "packages/a/src/old.ts": "console.warn('x');\nconsole.error('y');" });
    const { problems } = checkRepo(root, [
      { path: "packages/a/src/old.ts", max: 1, reason: "r" },
      { path: "packages/a/src/gone.ts", max: 1, reason: "r" },
    ]);
    expect(problems.some((p) => p.includes("at most 1"))).toBe(true);
    expect(problems.some((p) => p.includes('"packages/a/src/gone.ts" matches no console call'))).toBe(true);
  });

  it("fails an empty catch even in an allow-listed file", () => {
    const root = repo({ "packages/a/src/cli.ts": "console.warn('out');\ntry { x(); } catch {}" });
    const { problems } = checkRepo(root, [{ path: "packages/a/src/", reason: "cli" }]);
    expect(problems).toEqual([expect.stringMatching(/cli\.ts:2: empty catch block/)]);
  });

  it("passes on this repository", () => {
    const { problems, scanned } = checkRepo();
    expect(scanned).toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });
});
