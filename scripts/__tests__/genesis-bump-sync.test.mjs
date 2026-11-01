// @feat:cli-upgrade
// The genesis-upgrade workflow runs the same bump as `genesis upgrade`: it embeds
// packages/genesis-cli/src/upgrade/bump-core.mjs. This fails when the embedded copy drifts.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

  it("tidies pnpm's release-age excludes after both installs, and commits pnpm-workspace.yaml (GENESIS_STEP=tidy)", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    const script = parse(workflow).env.GENESIS_BUMP;
    const steps = parse(workflow).jobs;
    const runOf = (job, name) => steps[job].steps.find((s) => s.name === name).run;
    for (const [job, name, dedupe] of [["bump", "Install", "pnpm dedupe\n"], ["pr", "Write the lockfile (install scripts off)", "pnpm dedupe --lockfile-only --ignore-scripts\n"]]) {
      const text = runOf(job, name);
      const pnpm = text.slice(text.indexOf("pnpm)"), text.indexOf(";;"));
      // install, tidy, dedupe, tidy
      expect(pnpm.split("GENESIS_STEP=tidy node --input-type=module -e \"$GENESIS_BUMP\"").length).toBe(3);
      expect(pnpm.indexOf(dedupe)).toBeGreaterThan(pnpm.indexOf("GENESIS_STEP=tidy"));
    }

    const ws = realpathSync(mkdtempSync(path.join(tmpdir(), "genesis-tidy-")));
    try {
      const temp = path.join(ws, ".runner");
      const app = path.join(ws, "app");
      mkdirSync(app);
      const git = (...args) => execFileSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd: ws, stdio: "ignore" });
      git("init", "-q");
      writeFileSync(path.join(ws, ".gitignore"), ".runner/\n");
      writeFileSync(path.join(app, "pnpm-workspace.yaml"), "minimumReleaseAgeExclude:\n  - left-pad@1.3.0\n");
      git("add", ".");
      git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "init");
      // What pnpm's loose mode writes after the install: a second pin of one Genesis package.
      writeFileSync(path.join(app, "pnpm-workspace.yaml"), "minimumReleaseAgeExclude:\n  - left-pad@1.3.0\n  - '@marktiderman/genesis-features@0.8.0'\n  - '@marktiderman/genesis-features@0.8.1'\n");
      mkdirSync(path.join(temp, "genesis-upgrade"), { recursive: true });
      writeFileSync(path.join(temp, "genesis-upgrade", "files"), "app/package.json");
      const file = path.join(ws, "tidy.mjs");
      writeFileSync(file, script);
      const tidy = () => execFileSync(process.execPath, [file], { cwd: app, env: { ...process.env, GENESIS_STEP: "tidy", RUNNER_TEMP: temp, GITHUB_WORKSPACE: ws } });
      tidy();
      tidy();
      expect(readFileSync(path.join(app, "pnpm-workspace.yaml"), "utf8")).toBe("minimumReleaseAgeExclude:\n  - left-pad@1.3.0\n  - '@marktiderman/genesis-*'\n");
      expect(readFileSync(path.join(temp, "genesis-upgrade", "files"), "utf8")).toBe("app/package.json\napp/pnpm-workspace.yaml");

      // A project with its own lockfile in a workspace: the root's pnpm-workspace.yaml is the one pnpm wrote.
      const project = path.join(ws, "apps", "b");
      mkdirSync(project, { recursive: true });
      writeFileSync(path.join(ws, "pnpm-workspace.yaml"), "packages:\n  - apps/*\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-ui@2.26.0'\n");
      execFileSync(process.execPath, [file], { cwd: project, env: { ...process.env, GENESIS_STEP: "tidy", RUNNER_TEMP: temp, GITHUB_WORKSPACE: ws } });
      expect(readFileSync(path.join(ws, "pnpm-workspace.yaml"), "utf8")).toBe("packages:\n  - apps/*\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-*'\n");
      expect(readFileSync(path.join(temp, "genesis-upgrade", "files"), "utf8").split("\n")).toContain("pnpm-workspace.yaml");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 5 });
    }
  });
});
