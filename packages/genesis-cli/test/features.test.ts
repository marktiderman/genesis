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
import { formatFeature, runFeaturesBuild, runFeaturesCheck, runFeaturesFind, type GhRunner } from "../src/features";

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

  it("--prs reads merged PRs labelled feature:<id> for planned features with gh", async () => {
    const root = repo({ "src/features.ts": registry("live").replace(`reviewedAt: "2026-10-22"`, `reviewedAt: "2026-10-22" }, billing: { name: "Billing", summary: "Seats.", status: "planned", horizon: "next", owner: "mark", apps: ["web"], audience: ["owner"], aliases: ["payments"]`), "src/tasks.ts": "" });
    const calls: string[][] = [];
    const gh: GhRunner = (args) => {
      calls.push(args);
      return JSON.stringify(args.includes("feature:billing") ? [{ number: 123, title: "Seats", url: "x" }] : []);
    };
    const result = await runFeaturesCheck({ dir: root, ...off, prs: true, gh });
    expect(calls.map((a) => a[a.indexOf("--label") + 1])).toEqual(["feature:billing", "feature:payments"]);
    expect(calls[0]).toEqual(expect.arrayContaining(["pr", "list", "--state", "merged", "--json", "number,title"]));
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("billing is still planned, but PR #123 shipped work for it");
    expect(result.plannedButShipped).toEqual([{ id: "billing", changesets: [], prs: [{ number: 123, title: "Seats" }] }]);
    expect(result.summary).toContain("- 1 planned feature has shipped work: billing.");

    expect((await runFeaturesCheck({ dir: root, ...off, gh })).plannedButShipped).toEqual([]);
  });

  it("--prs degrades to one warning when gh is missing or fails", async () => {
    const root = repo({ "src/features.ts": registry("live").replace(`reviewedAt: "2026-10-22"`, `reviewedAt: "2026-10-22" }, billing: { name: "Billing", summary: "Seats.", status: "planned", horizon: "next", owner: "mark", apps: ["web"], audience: ["owner"]`), "src/tasks.ts": "" });
    const missing: GhRunner = () => {
      throw Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
    };
    const result = await runFeaturesCheck({ dir: root, ...off, prs: true, gh: missing });
    expect(result.ok).toBe(true);
    const gh = (warnings: string[]) => warnings.filter((w) => w.startsWith("--prs"));
    expect(gh(result.warnings)).toEqual(["--prs: couldn't read merged PRs with gh (gh is not installed), so only changesets were checked for shipped work"]);
    const failing: GhRunner = () => {
      throw new Error("Command failed: gh pr list\nHTTP 401");
    };
    expect(gh((await runFeaturesCheck({ dir: root, ...off, prs: true, gh: failing })).warnings)).toEqual([
      "--prs: couldn't read merged PRs with gh (Command failed: gh pr list), so only changesets were checked for shipped work",
    ]);
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
