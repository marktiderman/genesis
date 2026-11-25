// @feat:native-workbench
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkCoverage, coveredNames } from "../check-workbench-coverage.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("check-workbench-coverage", () => {
  it("reads every name a screen's covers lists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-coverage-"));
    const dir = path.join(root, "apps/native-workbench/src/workbench/screens");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.tsx"), 'export const a = { covers: ["NativeButton", "NativeSwitch"] };\nexport const b = { covers: [\n  "NativeBadge",\n] };\n');
    expect([...coveredNames(root)].sort()).toEqual(["NativeBadge", "NativeButton", "NativeSwitch"]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("passes on the repository, and reports covers names that aren't native components", () => {
    const { problems, screens, unknown } = checkCoverage(repo);
    expect(problems).toEqual([]);
    expect(screens).toBeGreaterThan(0);
    // A hook a screen shows is listed but not counted: reported, so a misspelt component can't hide.
    expect(unknown).toContain("composeHeaderOptions");
  });

  it("imports without running (no argv[1])", async () => {
    const saved = process.argv[1];
    process.argv[1] = undefined;
    try {
      await expect(import("../check-workbench-coverage.mjs?no-argv")).resolves.toBeDefined();
    } finally {
      process.argv[1] = saved;
    }
  });
});
