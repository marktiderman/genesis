/**
 * `genesis features build|check` against a throwaway repo. The registry is
 * TypeScript (type annotations included) to prove the loader strips types;
 * it doesn't import genesis-features, so the test needs no built dist.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runFeaturesBuild, runFeaturesCheck } from "../src/features";

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
  tasks: { name: "Tasks", summary: "Next steps.", status, owner: "mark", apps: ["web"], audience: ["client"], links: { code: ["src/tasks.ts"] } },
};
`;

describe("genesis features", () => {
  it("builds the AGENTS.md block, then checks it, from src/features.ts", async () => {
    const root = repo({ "src/features.ts": registry("live"), "src/tasks.ts": "", "AGENTS.md": "# Agents\n" });
    const options = { dir: root, agents: "AGENTS.md" as const };
    expect((await runFeaturesCheck(options)).ok).toBe(false);
    expect(await runFeaturesBuild(options)).toEqual(["AGENTS.md"]);
    const doc = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(doc).toContain("Generated from `src/features.ts`");
    expect(doc).toContain("| `tasks` | Tasks |");
    expect(await runFeaturesCheck(options)).toMatchObject({ ok: true, errors: [] });

    writeFileSync(path.join(root, "src/features.ts"), registry("beta"));
    expect((await runFeaturesCheck(options)).errors).toEqual([
      "AGENTS.md is stale. Run `genesis features build` and commit the result.",
    ]);
  });

  it("reads flags from a separate file and writes the JSON copy", async () => {
    const root = repo({
      "features.ts": registry("live"),
      "src/tasks.ts": "",
      "src/flags.ts": `export const flags = { tasks_v2: { feature: "tasks", owner: "mark", kind: "ops" } };`,
    });
    const options = { dir: root, agents: false as const, flags: "src/flags.ts", json: "features.json" };
    expect(await runFeaturesBuild(options)).toEqual(["features.json"]);
    const json = JSON.parse(readFileSync(path.join(root, "features.json"), "utf8"));
    expect(json.generatedFrom).toBe("features.ts");
    expect(json.features[0].flags).toEqual(["tasks_v2"]);
    expect((await runFeaturesCheck(options)).ok).toBe(true);
  });

  it("fails on a missing code path", async () => {
    const root = repo({ "src/features.ts": registry("live") });
    const options = { dir: root, agents: false as const };
    expect((await runFeaturesCheck(options)).errors).toEqual(["tasks.links.code: src/tasks.ts doesn't exist"]);
  });

  it("says where it looked when there is no registry", async () => {
    const root = repo({ "README.md": "" });
    await expect(runFeaturesCheck({ dir: root, agents: false })).rejects.toThrow(/src\/features\.ts and features\.ts/);
  });
});
