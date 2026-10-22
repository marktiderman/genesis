import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFeatureOutputs, checkFeatureOutputs } from "../node";
import { features, flags } from "./fixture";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "genesis-features-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/tasks.ts"), "");
  writeFileSync(join(root, "AGENTS.md"), "# Agents\n\nHand-written.\n");
  return root;
}

describe("build and check", () => {
  it("fails before a build, passes after, and fails again when the registry moves on", () => {
    const root = repo();
    const options = { root, features, flags, json: "features.json", today: "2026-10-22" };
    expect(checkFeatureOutputs(options).errors).toEqual([
      "AGENTS.md is stale. Run `genesis features build` and commit the result.",
      "features.json is stale. Run `genesis features build` and commit the result.",
    ]);

    expect(buildFeatureOutputs(options)).toEqual(["AGENTS.md", "features.json"]);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toMatch(/^# Agents\n\nHand-written\.\n\n<!-- genesis-features:start -->/);
    expect(checkFeatureOutputs(options)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(buildFeatureOutputs(options)).toEqual([]);

    const moved = { ...features, tasks: { ...features.tasks, status: "retired" as const } };
    expect(checkFeatureOutputs({ ...options, features: moved }).ok).toBe(false);
  });

  it("ignores hand edits outside the block but not inside it", () => {
    const root = repo();
    const options = { root, features, flags };
    buildFeatureOutputs(options);
    const file = join(root, "AGENTS.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("Hand-written.", "Edited."));
    expect(checkFeatureOutputs(options).ok).toBe(true);
    writeFileSync(file, readFileSync(file, "utf8").replace("| Tasks |", "| Taskz |"));
    expect(checkFeatureOutputs(options).ok).toBe(false);
  });

  it("fails on a missing code path and warns on an expired flag", () => {
    const root = repo();
    const broken = { ...features, wins: { ...features.wins, links: { code: ["src/gone.ts"], docs: ["docs/none.md"] } } };
    const options = { root, features: broken, flags, today: "2027-01-01" };
    buildFeatureOutputs(options);
    const result = checkFeatureOutputs(options);
    expect(result.errors).toEqual(["wins.links.code: src/gone.ts doesn't exist", "wins.links.docs: docs/none.md doesn't exist"]);
    expect(result.warnings).toEqual(["wins_v2 expired on 2026-12-01: remove it or move the date"]);
  });

  it("reports a missing AGENTS.md", () => {
    const root = mkdtempSync(join(tmpdir(), "genesis-features-"));
    writeFileSync(join(root, "keep"), "");
    expect(checkFeatureOutputs({ root, features: {}, agents: "AGENTS.md" }).errors).toEqual([
      "AGENTS.md is missing. Run `genesis features build`.",
    ]);
  });
});
