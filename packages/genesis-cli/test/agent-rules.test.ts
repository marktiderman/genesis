// @feat:agent-rules
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeTempDir } from "./temp.js";
import { checkAgentRules, pullRequestBranches } from "../src/agent-rules";

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) removeTempDir(dir);
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "genesis-agent-rules-"));
  created.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const pkg = (name: string, version: string, extra: Record<string, unknown> = {}) => JSON.stringify({ name, version, ...extra });

describe("genesis agents --rules", () => {
  it("passes a new package at 0.1.0 with a patch changeset, and released or private ones", () => {
    const root = repo({
      "packages/new/package.json": pkg("@acme/new", "0.1.0"),
      "packages/old/package.json": pkg("@acme/old", "2.3.0"),
      "packages/old/CHANGELOG.md": "# @acme/old\n",
      "packages/private/package.json": pkg("@acme/private", "0.0.0", { private: true }),
      ".changeset/a.md": '---\n"@acme/new": patch\n"@acme/old": minor\n---\n\nThings.\n',
    });
    expect(checkAgentRules(root)).toEqual([]);
  });

  it("refuses a new package past its first version, or bumped past a patch", () => {
    const root = repo({
      "packages/new/package.json": pkg("@acme/new", "1.0.0"),
      ".changeset/a.md": "---\n'@acme/new': minor\n---\n",
    });
    expect(checkAgentRules(root).map((p) => p.message)).toEqual([
      "packages/new: @acme/new has never been released, so it starts at 0.1.0, not 1.0.0",
      ".changeset/a.md: @acme/new is new, so its first changeset is a patch (0.1.0 by hand, then CI publishes the next), not a minor",
    ]);
  });

  it("refuses a workflow that runs on pull requests into main but not into the batches", () => {
    const only = "on:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n";
    const both = 'on:\n  pull_request:\n    branches: [main, "staging/**"]\n';
    const listed = "on:\n  pull_request:\n    branches:\n      - main\n      - 'staging/**'\n    paths:\n      - 'apps/**'\n";
    const any = "on:\n  pull_request:\n    types: [opened]\n";
    const root = repo({ ".github/workflows/ci.yml": only, ".github/workflows/b.yml": both, ".github/workflows/c.yml": listed, ".github/workflows/d.yml": any });
    expect(checkAgentRules(root)).toEqual([
      { rule: "batch-ci", message: ".github/workflows/ci.yml: runs on pull requests into main but not into staging/**; add it to pull_request.branches" },
    ]);
    expect(pullRequestBranches(listed)).toEqual(["main", "staging/**"]);
    expect(pullRequestBranches(any)).toBeUndefined();
    expect(checkAgentRules(root, { batch: "release/*" }).map((p) => p.rule)).toEqual(["batch-ci", "batch-ci", "batch-ci"]);
  });
});
