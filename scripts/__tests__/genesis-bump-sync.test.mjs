// @feat:cli-upgrade
// The genesis-upgrade workflow runs the same bump as `genesis upgrade`: it embeds
// packages/genesis-cli/src/upgrade/bump-core.mjs. This fails when the embedded copy drifts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { CORE, embed, WORKFLOW } from "../sync-genesis-bump.mjs";

describe("genesis-upgrade.yml's bump", () => {
  it("embeds the current bump-core.mjs (run node scripts/sync-genesis-bump.mjs)", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    expect(embed(workflow, readFileSync(CORE, "utf8"))).toBe(workflow);
  });

  it("is a module node can parse", () => {
    const script = parse(readFileSync(WORKFLOW, "utf8")).env.GENESIS_BUMP;
    expect(script).toContain("bumpPackageJson(file, readFileSync(file");
    const dir = mkdtempSync(path.join(tmpdir(), "genesis-bump-"));
    try {
      const file = path.join(dir, "bump.mjs");
      writeFileSync(file, script);
      execFileSync(process.execPath, ["--check", file]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
