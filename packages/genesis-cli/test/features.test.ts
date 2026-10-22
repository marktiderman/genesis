// @feat:feature-registry
/**
 * `genesis features build|check` against a throwaway repo. The registry is
 * TypeScript (type annotations included) to prove the loader strips types;
 * it doesn't import genesis-features, so the test needs no built dist.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatFeature, runFeaturesBuild, runFeaturesCheck, runFeaturesFind } from "../src/features";

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "genesis-features-cli-"));
  created.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const registry = (status: string) => `
type Status = "live" | "beta";
const status: Status = "${status}" as Status;
export const features = {
  tasks: { name: "Tasks", summary: "Next steps.", status, owner: "mark", apps: ["web"], audience: ["client"], acceptance: ["Ticks off."], reviewedAt: "2026-10-22", links: { code: ["src/tasks.ts"] } },
};
`;
const off = { agents: false as const, json: false as const, skill: false as const, claude: false as const };

describe("genesis features", () => {
  it("builds the AGENTS.md block, then checks it, from src/features.ts", async () => {
    const root = repo({ "src/features.ts": registry("live"), "src/tasks.ts": "", "AGENTS.md": "# Agents\n" });
    const options = { dir: root };
    expect((await runFeaturesCheck(options)).ok).toBe(false);
    expect(await runFeaturesBuild(options)).toEqual(["AGENTS.md", "features.json", ".claude/skills/features/SKILL.md", "CLAUDE.md"]);
    const doc = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(doc).toContain("Every feature is in `src/features.ts`: 1 features (1 live).");
    expect(await runFeaturesCheck(options)).toMatchObject({ ok: true, errors: [] });

    writeFileSync(path.join(root, "src/features.ts"), registry("beta"));
    expect((await runFeaturesCheck(options)).stale).toEqual(["AGENTS.md", "features.json"]);
  });

  it("reads settings from package.json, flags from a separate file, and writes the OpenFeature manifest", async () => {
    const root = repo({
      "features.ts": registry("live"),
      "src/tasks.ts": "useFlag('tasks.v2')",
      "src/flags.ts": `export const flags = { "tasks.v2": { feature: "tasks", owner: "mark", kind: "ops", default: false, scopes: ["platform"], runbook: "https://x.test/r" } };`,
      "package.json": JSON.stringify({ genesisFeatures: { flagsFile: "src/flags.ts", agents: false, skill: false, claude: false, json: "out/features.json" } }),
    });
    expect(await runFeaturesBuild({ dir: root })).toEqual(["out/features.json", "flags.json"]);
    const json = JSON.parse(readFileSync(path.join(root, "out/features.json"), "utf8"));
    expect(json.generatedFrom).toBe("features.ts");
    expect(json.features[0].flags).toEqual(["tasks.v2"]);
    expect(JSON.parse(readFileSync(path.join(root, "flags.json"), "utf8")).flags["tasks.v2"].flagType).toBe("boolean");
    expect((await runFeaturesCheck({ dir: root })).ok).toBe(true);
    expect((await runFeaturesCheck({ dir: root, labels: ["feature:nope"] })).errors).toEqual(["PR label feature:nope: nope is not a feature"]);
  });

  it("finds features by term", async () => {
    const root = repo({ "src/features.ts": registry("live"), "src/tasks.ts": "" });
    expect((await runFeaturesFind({ dir: root }, "next steps")).map((r) => r.id)).toEqual(["tasks"]);
    expect(formatFeature((await runFeaturesFind({ dir: root }, "tasks"))[0]!)).toBe("tasks — Tasks [live] (mark)\n  Next steps.\n  code: src/tasks.ts");
  });

  it("fails on a missing code path", async () => {
    const root = repo({ "src/features.ts": registry("live") });
    expect((await runFeaturesCheck({ dir: root, ...off })).errors).toEqual(["tasks.links.code: src/tasks.ts doesn't exist"]);
  });

  it("says where it looked when there is no registry", async () => {
    const root = repo({ "README.md": "" });
    await expect(runFeaturesCheck({ dir: root, ...off })).rejects.toThrow(/src\/features\.ts and features\.ts/);
  });
});
