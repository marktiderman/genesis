import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validateRepo } from "../src/doctor/config.js";
import { runDoctor } from "../src/doctor/index.js";
import type { RunToolResult, ToolRunner } from "../src/exec/run.js";
import {
  branchMatches,
  checksFromWorkflows,
  formatPlan,
  GITHUB_ACTIONS_APP_ID,
  planProtection,
  planRepo,
  protectionSpec,
  runPruneStaging,
  runRepoProtect,
  slugFromRemote,
  STAGING_REF,
  type LiveRepo,
  type Ruleset,
} from "../src/repo/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

const GENESIS_WORKFLOWS = path.resolve(import.meta.dirname, "../../../.github/workflows");
const genesisWorkflow = (file: string) => readFileSync(path.join(GENESIS_WORKFLOWS, file), "utf8");

/** A ruleset like one made by hand in the GitHub UI for a consumer app. */
function handMade(): Ruleset {
  return {
    id: 101,
    name: "default",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          required_reviewers: [],
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: true,
          require_extra_approval_for_unattributed_changes: true,
          allowed_merge_methods: ["squash", "merge"],
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          do_not_enforce_on_create: false,
          required_status_checks: [
            { context: "app / App checks", integration_id: GITHUB_ACTIONS_APP_ID },
            { context: "database / Database and pgTAP", integration_id: GITHUB_ACTIONS_APP_ID },
            { context: "Adversarial review", integration_id: GITHUB_ACTIONS_APP_ID },
          ],
        },
      },
    ],
    bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }],
  };
}

const live = (rulesets: Ruleset[], settings: LiveRepo["settings"] = { delete_branch_on_merge: true, allow_auto_merge: true, allow_rebase_merge: false, allow_merge_commit: true }): LiveRepo => ({ slug: "acme/sample-app", defaultBranch: "main", settings, rulesets });

describe("protectionSpec", () => {
  it("builds the default-branch ruleset, and the staging one only when asked", () => {
    const one = protectionSpec({ defaultChecks: ["app / App checks", "Adversarial review"], stagingChecks: null });
    expect(one.rulesets.map((r) => r.name)).toEqual(["default"]);
    const rules = one.rulesets[0]!.rules;
    expect(rules.map((r) => r.type)).toEqual(["deletion", "non_fast_forward", "pull_request", "required_status_checks"]);
    expect(rules[2]!.parameters).toMatchObject({ required_review_thread_resolution: true, required_approving_review_count: 0, allowed_merge_methods: ["merge", "squash"] });
    expect(rules[3]!.parameters!.required_status_checks).toEqual([
      { context: "app / App checks", integration_id: GITHUB_ACTIONS_APP_ID },
      { context: "Adversarial review", integration_id: GITHUB_ACTIONS_APP_ID },
    ]);
    expect(one.rulesets[0]!.bypass_actors).toEqual([{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }]);
    expect(one.settings).toEqual({ delete_branch_on_merge: true, allow_auto_merge: true, allow_rebase_merge: false, allow_merge_commit: true });

    const two = protectionSpec({ defaultChecks: [], stagingChecks: ["Adversarial review"] });
    expect(two.rulesets[0]!.rules.some((r) => r.type === "required_status_checks")).toBe(false);
    const staging = two.rulesets[1]!;
    expect(staging.conditions.ref_name.include).toEqual([STAGING_REF]);
    expect(staging.rules.map((r) => r.type)).toEqual(["deletion", "non_fast_forward", "required_status_checks"]);
    expect(staging.rules[2]!.parameters).toMatchObject({ do_not_enforce_on_create: true });
  });
});

describe("planProtection", () => {
  const spec = protectionSpec({ defaultChecks: ["app / App checks", "Adversarial review"], stagingChecks: null });

  it("creates what's missing with one POST per ruleset and one PATCH for the settings", () => {
    const plan = planProtection(spec, live([], { delete_branch_on_merge: false, allow_auto_merge: true, allow_rebase_merge: true, allow_merge_commit: true }));
    expect(plan.writes.map((w) => `${w.method} ${w.path}`)).toEqual(["POST repos/acme/sample-app/rulesets", "PATCH repos/acme/sample-app"]);
    expect(plan.writes[0]!.body).toMatchObject({ name: "default", target: "branch", enforcement: "active", bypass_actors: [{ actor_id: 5 }] });
    expect(plan.writes[1]!.body).toEqual({ delete_branch_on_merge: true, allow_rebase_merge: false });
    expect(formatPlan(plan, { dryRun: true })).toContain("~ allow_rebase_merge: true → false");
  });

  it("adopts a hand-made ruleset: matching is no change, and parameters Genesis doesn't name are kept", () => {
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: null }), live([handMade()]));
    expect(plan.changes).toEqual([]);
    expect(plan.writes).toEqual([]);
  });

  it("drops a required check that can never report, and keeps one CI doesn't name with a note", () => {
    const plan = planProtection(spec, live([handMade()]), { conditional: [{ context: "database / Database and pgTAP", why: "path-filtered" }] });
    expect(plan.changes).toEqual([{ scope: 'ruleset "default"', kind: "remove", what: 'required check "database / Database and pgTAP"', why: "path-filtered" }]);
    const put = plan.writes[0]!;
    expect(`${put.method} ${put.path}`).toBe("PUT repos/acme/sample-app/rulesets/101");
    const rules = put.body.rules as Ruleset["rules"];
    expect((rules.find((r) => r.type === "required_status_checks")!.parameters!.required_status_checks as Array<{ context: string }>).map((c) => c.context)).toEqual(["app / App checks", "Adversarial review"]);
    expect(rules.find((r) => r.type === "pull_request")!.parameters!.require_extra_approval_for_unattributed_changes).toBe(true);

    const kept = planProtection(protectionSpec({ defaultChecks: ["app / App checks"], stagingChecks: null }), live([handMade()]));
    expect(kept.changes).toEqual([]);
    expect(kept.notes.join("\n")).toContain('kept the required check "Adversarial review"');
  });

  it("with an exact list (repo.requiredChecks), removes the checks it doesn't name", () => {
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks"], stagingChecks: null }), live([handMade()]), { exact: ["default"] });
    expect(plan.changes.filter((c) => c.kind === "remove").map((c) => c.what)).toEqual(['required check "database / Database and pgTAP"', 'required check "Adversarial review"']);
  });

  it("pins unpinned checks, takes rebase out of the merge methods, adds a missing bypass and a missing staging ruleset", () => {
    const r = handMade();
    (r.rules[2]!.parameters as Record<string, unknown>).allowed_merge_methods = ["merge", "squash", "rebase"];
    (r.rules[3]!.parameters as Record<string, unknown>).required_status_checks = [{ context: "app / App checks" }, { context: "Adversarial review", integration_id: GITHUB_ACTIONS_APP_ID }];
    r.bypass_actors = [];
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "Adversarial review"], stagingChecks: ["Adversarial review"] }), live([r]));
    const said = plan.changes.map((c) => `${c.kind} ${c.what}`);
    expect(said).toContain("change pull_request.allowed_merge_methods: [merge, squash, rebase] → [merge, squash]");
    expect(said).toContain('change required check "app / App checks": pinned to GitHub Actions (app 15368)');
    expect(said).toContain("add bypass: the repository admin role (always)");
    expect(said.some((s) => s.startsWith("add new ruleset on refs/heads/staging/**/*"))).toBe(true);
    expect(plan.writes.map((w) => w.method)).toEqual(["PUT", "POST"]);
  });

  it("turns an evaluate-only ruleset on", () => {
    const r = handMade();
    r.enforcement = "evaluate";
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: null }), live([r]));
    expect(plan.changes).toEqual([{ scope: 'ruleset "default"', kind: "change", what: "enforcement: evaluate → active" }]);
  });
});

describe("checksFromWorkflows", () => {
  const remote = async (ref: { path: string }) => genesisWorkflow(path.basename(ref.path));
  const ci = `name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  app:
    uses: marktiderman/genesis/.github/workflows/app-ci.yml@0123456789abcdef0123456789abcdef01234567
    with:
      package-manager: bun
`;
  const database = `name: Database
on:
  pull_request:
    paths: ["supabase/**"]
jobs:
  database:
    uses: marktiderman/genesis/.github/workflows/supabase-ci.yml@0123456789abcdef0123456789abcdef01234567
    with:
      doctor: false
`;
  const gate = `name: Adversarial review
on:
  pull_request_target:
    types: [opened, synchronize, labeled]
    branches: ['main', 'staging/**']
jobs:
  review:
    name: Adversarial review
    runs-on: ubuntu-latest
    steps: [{ run: "true" }]
`;
  const review = `on: pull_request
jobs:
  review:
    uses: marktiderman/genesis/.github/workflows/claude-review.yml@0123456789abcdef0123456789abcdef01234567
`;
  const teardown = `on:
  pull_request:
    types: [closed]
jobs:
  teardown:
    runs-on: ubuntu-latest
    steps: [{ run: "true" }]
`;

  it("names each called job as GitHub does, reads Genesis's real reusable workflows, and leaves out what can't gate", async () => {
    const files = [
      { path: ".github/workflows/ci.yml", text: ci },
      { path: ".github/workflows/database.yml", text: database },
      { path: ".github/workflows/review-gate.yml", text: gate },
      { path: ".github/workflows/claude-review.yml", text: review },
      { path: ".github/workflows/pr-preview-teardown.yml", text: teardown },
    ];
    const main = await checksFromWorkflows(files, "main", remote);
    expect(main.required).toEqual(["app / App checks", "Adversarial review"]);
    // doctor: false switches the supabase pack's doctor job off; pgTAP is path-filtered.
    expect(main.conditional.map((c) => c.context)).toEqual(["database / Database and pgTAP"]);
    expect(main.conditional[0]!.why).toContain("supabase/**");

    const staging = await checksFromWorkflows(files, "staging/2026-01-01/a", remote);
    expect(staging.required).toEqual(["Adversarial review"]);
  });

  it("says what it can't read: a remote workflow with no reader, a matrix, a name built at run time", async () => {
    const files = [
      { path: ".github/workflows/ci.yml", text: ci },
      { path: ".github/workflows/m.yml", text: "on: pull_request\njobs:\n  test:\n    strategy: { matrix: { node: [20, 22] } }\n    runs-on: ubuntu-latest\n  named:\n    name: Test ${{ matrix.x }}\n    runs-on: ubuntu-latest\n" },
    ];
    const out = await checksFromWorkflows(files, "main");
    expect(out.required).toEqual([]);
    expect(out.notes.join("\n")).toMatch(/couldn't be read[\s\S]*matrix[\s\S]*built at run time/);
  });

  it("calls a local reusable workflow by path", async () => {
    const files = [
      { path: ".github/workflows/ci.yml", text: "on: { pull_request: {} }\njobs:\n  checks:\n    name: Checks\n    uses: ./.github/workflows/reusable.yml\n" },
      { path: ".github/workflows/reusable.yml", text: "on: { workflow_call: {} }\njobs:\n  lint:\n    runs-on: ubuntu-latest\n  test:\n    name: Unit tests\n    runs-on: ubuntu-latest\n" },
    ];
    expect((await checksFromWorkflows(files, "main")).required).toEqual(["Checks / lint", "Checks / Unit tests"]);
  });

  it("matches branch filters as GitHub does", () => {
    expect(branchMatches({ branches: ["staging/**"] }, "staging/2026-11-21/b")).toBe(true);
    expect(branchMatches({ branches: ["staging/*"] }, "staging/2026-11-21/b")).toBe(false);
    expect(branchMatches({ branches: ["**", "!staging/**"] }, "staging/x")).toBe(false);
    expect(branchMatches({ "branches-ignore": ["main"] }, "main")).toBe(false);
    expect(branchMatches({}, "anything")).toBe(true);
  });
});

describe("the repo block and remotes", () => {
  it("validates genesis.config.json's repo block", () => {
    expect(validateRepo({ requiredChecks: ["app / App checks", "app / App checks"], staging: true })).toEqual({ requiredChecks: ["app / App checks"], staging: true });
    expect(() => validateRepo({ checks: [] })).toThrow(/checks isn't a setting/);
    expect(() => validateRepo({ requiredChecks: [""] })).toThrow(/list of check names/);
    expect(() => validateRepo({ staging: "yes" })).toThrow(/true or false/);
  });

  it("reads owner/name from https and ssh remotes", () => {
    expect(slugFromRemote("https://github.com/acme/sample-app.git")).toBe("acme/sample-app");
    expect(slugFromRemote("git@github.com:acme/sample-app.git\n")).toBe("acme/sample-app");
    expect(slugFromRemote("https://gitlab.com/acme/sample-app")).toBe(null);
  });
});

// --- The commands, end to end, with git and gh stubbed -------------------------------------------

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  cleanupApps();
});

function repoDir(files: Record<string, string>, config?: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-repo-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, ".git"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  if (config) writeFileSync(path.join(dir, "genesis.config.json"), JSON.stringify(config));
  return dir;
}

interface Fake {
  run: ToolRunner;
  calls: Array<{ args: string[]; stdin?: string }>;
}

function fakeGitHub(top: string, state: { rulesets: Ruleset[]; settings?: Record<string, unknown>; branches?: string[]; pulls?: unknown[]; ahead?: Record<string, number> }): Fake {
  const calls: Fake["calls"] = [];
  const ok = (stdout: unknown): RunToolResult => ({ code: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "" });
  const run: ToolRunner = async (tool, args, options) => {
    calls.push({ args: [tool, ...args], ...(options.stdin !== undefined ? { stdin: options.stdin } : {}) });
    if (tool === "git") return args[0] === "rev-parse" ? ok(`${top}\n`) : ok("git@github.com:acme/sample-app.git\n");
    const target = args.filter((a) => a.startsWith("repos/")).at(-1) ?? "";
    if (args.includes("-X")) return ok("{}");
    if (target === "repos/acme/sample-app") return ok({ default_branch: "main", delete_branch_on_merge: true, allow_auto_merge: true, allow_rebase_merge: true, allow_merge_commit: true, ...state.settings });
    if (target.startsWith("repos/acme/sample-app/rulesets?")) return ok(state.rulesets.map((r) => ({ id: r.id, name: r.name, target: r.target, source_type: "Repository" })));
    const rs = /rulesets\/(\d+)$/.exec(target);
    if (rs) return ok(state.rulesets.find((r) => String(r.id) === rs[1]));
    if (target.includes("/git/matching-refs/heads/staging/")) return ok((state.branches ?? []).map((b) => ({ ref: `refs/heads/${b}` })));
    if (target.includes("/contents/")) return ok(genesisWorkflow(path.basename(target.split("?")[0]!)));
    if (target.includes("/pulls?")) return ok(state.pulls ?? []);
    const cmp = /compare\/main\.\.\.(.+)$/.exec(target);
    if (cmp) return ok({ ahead_by: state.ahead?.[cmp[1]!] ?? 0 });
    return { code: 1, stdout: "", stderr: `unexpected ${target}` };
  };
  return { run, calls };
}

const CI_FILES = {
  ".github/workflows/ci.yml": "on:\n  pull_request:\n    branches: [main]\njobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@0123456789abcdef0123456789abcdef01234567\n",
  ".github/workflows/database.yml": "on:\n  pull_request:\n    paths: ['supabase/**']\njobs:\n  database:\n    uses: marktiderman/genesis/.github/workflows/supabase-ci.yml@0123456789abcdef0123456789abcdef01234567\n    with:\n      doctor: false\n",
  ".github/workflows/review-gate.yml": "on:\n  pull_request_target:\n    branches: ['main']\njobs:\n  review:\n    name: Adversarial review\n    runs-on: ubuntu-latest\n",
};

describe("genesis repo protect", () => {
  it("--dry-run prints the diff and writes nothing; without it, PUTs the ruleset and PATCHes the settings with the bodies on stdin", async () => {
    const top = repoDir(CI_FILES);
    const fake = fakeGitHub(top, { rulesets: [handMade()] });
    const lines: string[] = [];
    expect(await runRepoProtect({ root: top, run: fake.run, dryRun: true, out: (l) => lines.push(l) })).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain('- required check "database / Database and pgTAP"');
    expect(text).toContain("~ allow_rebase_merge: true → false");
    expect(fake.calls.some((c) => c.args.includes("-X"))).toBe(false);

    const applied = fakeGitHub(top, { rulesets: [handMade()] });
    await runRepoProtect({ root: top, run: applied.run, out: () => {} });
    const writes = applied.calls.filter((c) => c.args.includes("-X"));
    expect(writes.map((c) => c.args.slice(2, 5).join(" "))).toEqual(["-X PUT repos/acme/sample-app/rulesets/101", "-X PATCH repos/acme/sample-app"]);
    expect(JSON.parse(writes[1]!.stdin!)).toEqual({ allow_rebase_merge: false });
  });

  it("protects staging batches when the repository has them, and takes repo.requiredChecks as the exact list", async () => {
    const top = repoDir(CI_FILES, { repo: { requiredChecks: ["app / App checks"] } });
    const fake = fakeGitHub(top, { rulesets: [handMade()], branches: ["staging/2026-11-20/a"] });
    const result = await planRepo({ root: top, run: fake.run });
    expect(result.staging).toBe(true);
    expect(result.defaultChecks).toEqual(["app / App checks"]);
    const said = result.plan.changes.map((c) => `${c.kind} ${c.what}`);
    expect(said).toContain('remove required check "Adversarial review"');
    expect(said.some((s) => s.startsWith("add new ruleset on refs/heads/staging/**/*"))).toBe(true);
  });
});

describe("genesis repo prune-staging", () => {
  it("deletes merged batches, never the newest, one with an open pull request or an undated staging branch", async () => {
    const top = repoDir(CI_FILES);
    const state = {
      rulesets: [{ ...handMade(), id: 202, name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, current_user_can_bypass: "always" }],
      branches: ["staging/2026-11-01/a", "staging/2026-11-10/a", "staging/2026-11-15/a", "staging/2026-11-21/b", "staging/launch-hold"],
      pulls: [{ base: { ref: "staging/2026-11-15/a" }, head: { ref: "feat/x", repo: { full_name: "acme/sample-app" } } }],
      ahead: { "staging/2026-11-10/a": 2 },
    };
    const dry = fakeGitHub(top, state);
    const lines: string[] = [];
    await runPruneStaging({ root: top, run: dry.run, dryRun: true, out: (l) => lines.push(l) });
    expect(lines.join("\n")).toMatch(/would delete staging\/2026-11-01\/a[\s\S]*1 to delete/);
    expect(lines.join("\n")).toContain("keep staging/2026-11-21/b: the newest batch");
    expect(lines.join("\n")).toContain("keep staging/launch-hold: not a dated batch");
    expect(dry.calls.some((c) => c.args.includes("DELETE"))).toBe(false);

    const real = fakeGitHub(top, state);
    await runPruneStaging({ root: top, run: real.run, out: () => {} });
    expect(real.calls.filter((c) => c.args.includes("DELETE")).map((c) => c.args.at(-1))).toEqual(["repos/acme/sample-app/git/refs/heads/staging/2026-11-01/a"]);
  });

  it("refuses when the account can't bypass the staging ruleset's deletion rule", async () => {
    const top = repoDir(CI_FILES);
    const fake = fakeGitHub(top, { rulesets: [{ ...handMade(), id: 202, name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, current_user_can_bypass: "never" }], branches: ["staging/2026-01-01/a", "staging/2026-01-02/a"] });
    const lines: string[] = [];
    expect(await runPruneStaging({ root: top, run: fake.run, out: (l) => lines.push(l) })).toBe(1);
    expect(lines.join("\n")).toContain("can't bypass it");
  });
});

describe("doctor: repo-protection", () => {
  it("reports each difference as a warning when the network is on, and makes no call when it's off", async () => {
    const top = makeApp(null, CI_FILES);
    mkdirSync(path.join(top, ".git"));
    const fake = fakeGitHub(top, { rulesets: [handMade()] });
    const on = await runDoctor({ root: top, network: true, repo: { run: fake.run, ci: false }, config: { rules: { "genesis-behind": "off" } } });
    const found = on.findings.filter((f) => f.rule === "repo-protection");
    expect(found.map((f) => f.level)).toEqual(["warn", "warn"]);
    expect(found.map((f) => f.message).join("\n")).toMatch(/requires required check "database \/ Database and pgTAP"[\s\S]*allow_rebase_merge/);

    const quiet = fakeGitHub(top, { rulesets: [handMade()] });
    const off = await runDoctor({ root: top, network: false, repo: { run: quiet.run } });
    expect(off.findings.filter((f) => f.rule === "repo-protection")).toEqual([]);
    expect(quiet.calls).toEqual([]);
  });
});
