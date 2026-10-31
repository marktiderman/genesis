// @feat:feature-registry
/**
 * `genesis features build|check` against a throwaway repo. The registry is
 * TypeScript (type annotations included) to prove the loader strips types;
 * it doesn't import genesis-features, so the test needs no built dist.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeTempDir } from "./temp.js";
import { findFilters, formatFeature, runFeaturesBuild, runFeaturesCheck, runFeaturesFind, type GhRunner } from "../src/features";
import { featureKindField, featureSnippet } from "../src/blocks/registry-edit";
import { parseManifest } from "../src/blocks/manifest";

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) removeTempDir(dir);
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

  it("reads settings from genesis.config.json's features block, over package.json's", async () => {
    const root = repo({
      "features.ts": registry("live"),
      "src/tasks.ts": "",
      "package.json": JSON.stringify({ genesisFeatures: { agents: false, skill: false, claude: false, json: "old/features.json" } }),
      "genesis.config.json": JSON.stringify({ doctor: {}, features: { json: "out/features.json" } }),
    });
    expect(await runFeaturesBuild({ dir: root })).toEqual(["out/features.json"]);
    expect(await runFeaturesBuild({ dir: root, json: "cli/features.json" })).toEqual(["cli/features.json"]);
  });

  it("--prs reads merged PRs labelled feature:<id> for planned features with gh", async () => {
    const root = repo({ "src/features.ts": registry("live").replace(`reviewedAt: "2026-10-22"`, `reviewedAt: "2026-10-22" }, billing: { name: "Billing", summary: "Seats.", status: "planned", horizon: "next", owner: "mark", apps: ["web"], audience: ["owner"], aliases: ["payments"]`), "src/tasks.ts": "" });
    const calls: string[][] = [];
    const gh: GhRunner = (args) => {
      calls.push(args);
      return JSON.stringify([
        { number: 123, title: "Seats", url: "x", labels: [{ name: "feature:billing" }, { name: "bug" }] },
        { number: 124, title: "Pay", labels: [{ name: "feature:payments" }, { name: "feature:tasks" }] },
      ]);
    };
    const result = await runFeaturesCheck({ dir: root, ...off, prs: true, gh });
    expect(calls).toHaveLength(1);
    expect(calls[0]![calls[0]!.indexOf("--search") + 1]).toBe(`label:"feature:billing","feature:payments"`);
    expect(calls[0]).toEqual(expect.arrayContaining(["pr", "list", "--state", "merged", "--json", "number,title,labels"]));
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("billing is still planned, but PR #123 and PR #124 shipped work for it");
    expect(result.plannedButShipped).toEqual([{ id: "billing", changesets: [], prs: [{ number: 123, title: "Seats" }, { number: 124, title: "Pay" }] }]);
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
    expect(result.summary).toContain("\n- --prs: couldn't read merged PRs with gh (gh is not installed), so only changesets were checked for shipped work.");
    const failing: GhRunner = () => {
      throw Object.assign(new Error("Command failed: gh pr list"), { stderr: "HTTP 401: Bad credentials\nmore" });
    };
    expect(gh((await runFeaturesCheck({ dir: root, ...off, prs: true, gh: failing })).warnings)).toEqual([
      "--prs: couldn't read merged PRs with gh (HTTP 401: Bad credentials), so only changesets were checked for shipped work",
    ]);
    const slow: GhRunner = () => {
      throw Object.assign(new Error("spawnSync gh ETIMEDOUT"), { code: "ETIMEDOUT" });
    };
    expect(gh((await runFeaturesCheck({ dir: root, ...off, prs: true, gh: slow })).warnings)[0]).toContain("(gh timed out)");
  });

  it("finds features by term", async () => {
    const root = repo({ "src/features.ts": registry("live"), "src/tasks.ts": "" });
    expect((await runFeaturesFind({ dir: root }, "next steps")).map((r) => r.id)).toEqual(["tasks"]);
    expect(formatFeature((await runFeaturesFind({ dir: root }, "tasks"))[0]!)).toBe("tasks — Tasks [live] (mark)\n  Next steps.\n  code: src/tasks.ts");
  });

  it("finds by kind, the deprecated layer field, and the owning package's layer", async () => {
    const root = repo({
      "src/features.ts": `export const features = {
  button: { name: "Button", summary: "Presses.", status: "building", owner: "mark", apps: ["web"], audience: ["developer"], kind: "element", entry: { web: "@acme/ui/button" } },
  thread: { name: "Thread", summary: "Talks.", status: "building", owner: "mark", apps: ["web"], audience: ["developer"], layer: "pattern", links: { code: ["packages/chat/src"] } },
};
`,
      "packages/chat/package.json": JSON.stringify({ name: "@acme/chat", genesis: { layer: "primitive", group: "collaboration" } }),
      "packages/chat/src/index.ts": "",
      "node_modules/@marktiderman/ui/package.json": JSON.stringify({ name: "@acme/ui", genesis: { layer: "foundation", group: "core" } }),
    });
    const ids = (r: { id: string }[]) => r.map((x) => x.id);
    expect(ids(await runFeaturesFind({ dir: root }, "", { kind: "pattern" }))).toEqual(["thread"]);
    expect(ids(await runFeaturesFind({ dir: root }, "", { packageLayer: "foundation" }))).toEqual(["button"]);
    expect(ids(await runFeaturesFind({ dir: root }, "", { packageLayer: "primitive" }))).toEqual(["thread"]);
    expect(formatFeature((await runFeaturesFind({ dir: root }, "thread"))[0]!)).toContain("[building] pattern (mark)");
    expect((await runFeaturesCheck({ dir: root, ...off })).warnings).toContain(
      'thread.layer: deprecated, write kind: "pattern" (layer will be the owning package\'s, derived)',
    );
  });

  it("reads find's flags: --kind, --layer as a package layer, --layer as a deprecated kind", () => {
    expect(findFilters({ kind: "element" })).toEqual({ filters: { kind: "element" } });
    expect(findFilters({ layer: "module" })).toEqual({ filters: { packageLayer: "module" } });
    expect(findFilters({ layer: "primitive" })).toEqual({ filters: { kind: "element" }, warning: "--layer primitive is deprecated for a kind: use --kind element" });
    expect(findFilters({ layer: "pattern", kind: "pattern" }).filters).toEqual({ kind: "pattern" });
    expect(() => findFilters({ layer: "pattern", kind: "element" })).toThrow(/disagree/);
    expect(() => findFilters({ layer: "widget" })).toThrow(/--layer must be one of foundation, module, tooling/);
    expect(() => findFilters({ kind: "primitive" })).toThrow(/--kind must be one of/);
  });

  it("says so when --layer finds no package layers", async () => {
    const root = repo({ "src/features.ts": registry("live"), "src/tasks.ts": "" });
    await expect(runFeaturesFind({ dir: root }, "", { packageLayer: "foundation" })).rejects.toThrow(/no package here declares one/);
  });

  it("writes a block's kind in the field the app's genesis-features reads", () => {
    const manifest = parseManifest("@marktiderman/genesis-fixture", "notes", { feature: { name: "Notes", summary: "Notes.", layer: "primitive" } });
    expect(manifest.feature?.kind).toBe("element");
    expect(parseManifest("@marktiderman/genesis-fixture", "notes", { feature: { name: "Notes", summary: "Notes." } }).feature?.kind).toBeUndefined();
    expect(featureSnippet(manifest, "app")).toContain('kind: "element"');
    expect(featureSnippet({ ...manifest, feature: undefined }, "app", "layer")).toContain('layer: "block"');
    const at = (version: string) => repo({ "node_modules/@marktiderman/genesis-features/package.json": JSON.stringify({ name: "@marktiderman/genesis-features", version }) });
    expect(featureKindField(at("0.7.3"))).toBe("layer");
    expect(featureKindField(at("0.8.0"))).toBe("kind");
    expect(featureKindField(repo({ "README.md": "" }))).toBe("layer");
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
