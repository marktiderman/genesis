import { createHash } from "node:crypto";
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
  applyApprovedPlan,
  compareBatches,
  planDigest,
  runPruneStaging,
  runRepoProtect,
  refPattern,
  slugFromRemote,
  stagingChecksFor,
  STAGING_REF,
  type LiveRepo,
  type Ruleset,
} from "../src/repo/index.js";
import { DELETE_IF_AT } from "../src/repo/github.js";
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
    // No bypass on the default branch: nothing reaches it past the review gate.
    expect(one.rulesets[0]!.bypass_actors).toEqual([]);
    // Merge commits are never set: a repository that turned them off keeps them off.
    expect(one.settings).toEqual({ delete_branch_on_merge: true, allow_auto_merge: true, allow_rebase_merge: false });

    const two = protectionSpec({ defaultChecks: [], stagingChecks: ["Adversarial review"] });
    // Present with an empty list, so an existing rule is still reconciled; a new ruleset leaves it out.
    expect(two.rulesets[0]!.rules.find((r) => r.type === "required_status_checks")!.parameters!.required_status_checks).toEqual([]);
    const staging = two.rulesets[1]!;
    expect(staging.conditions.ref_name.include).toEqual([STAGING_REF]);
    expect(staging.rules.map((r) => r.type)).toEqual(["deletion", "non_fast_forward", "required_status_checks"]);
    expect(staging.rules[2]!.parameters).toMatchObject({ do_not_enforce_on_create: true });
    expect(staging.bypass_actors).toEqual([{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }]);
  });
});

describe("planProtection", () => {
  const spec = protectionSpec({ defaultChecks: ["app / App checks", "Adversarial review"], stagingChecks: null });

  it("creates what's missing with one POST per ruleset and one PATCH for the settings", () => {
    const plan = planProtection(spec, live([], { delete_branch_on_merge: false, allow_auto_merge: true, allow_rebase_merge: true, allow_merge_commit: true }));
    expect(plan.writes.map((w) => `${w.method} ${w.path}`)).toEqual(["POST repos/acme/sample-app/rulesets", "PATCH repos/acme/sample-app"]);
    expect(plan.writes[0]!.body).toMatchObject({ name: "default", target: "branch", enforcement: "active", bypass_actors: [] });
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

  it("pins unpinned checks, takes rebase out of the merge methods, adds no bypass to the default branch and adds a missing staging ruleset", () => {
    const r = handMade();
    (r.rules[2]!.parameters as Record<string, unknown>).allowed_merge_methods = ["merge", "squash", "rebase"];
    (r.rules[3]!.parameters as Record<string, unknown>).required_status_checks = [{ context: "app / App checks" }, { context: "Adversarial review", integration_id: GITHUB_ACTIONS_APP_ID }];
    r.bypass_actors = [];
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "Adversarial review"], stagingChecks: ["Adversarial review"] }), live([r]));
    const said = plan.changes.map((c) => `${c.kind} ${c.what}`);
    expect(said).toContain("change pull_request.allowed_merge_methods: [merge, squash, rebase] → [merge, squash]");
    expect(said).toContain('change required check "app / App checks": pinned to GitHub Actions (app 15368)');
    expect(said.some((s) => s.includes("bypass: the repository admin role"))).toBe(false);
    expect(said.some((s) => s.startsWith("add new ruleset on refs/heads/staging/**/*") && s.endsWith("the admin role bypasses"))).toBe(true);
    expect(plan.writes.map((w) => w.method)).toEqual(["PUT", "POST"]);
    expect((plan.writes[0]!.body.bypass_actors as unknown[]).length).toBe(0);
  });

  it("never loosens a stricter hand-set rule: approvals, code owners, last push, stale reviews, strict checks, merge methods", () => {
    const r = handMade();
    Object.assign(r.rules[2]!.parameters!, { required_approving_review_count: 2, require_code_owner_review: true, require_last_push_approval: true, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"] });
    Object.assign(r.rules[3]!.parameters!, { strict_required_status_checks_policy: true });
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: null }), live([r]));
    expect(plan.changes).toEqual([]);
    expect(plan.writes).toEqual([]);

    // A stricter staging ruleset (enforced on create) stays enforced on create.
    const staging: Ruleset = { ...handMade(), id: 7, name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, rules: [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, do_not_enforce_on_create: false, required_status_checks: [{ context: "Adversarial review", integration_id: GITHUB_ACTIONS_APP_ID }] } }] };
    const both = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: ["Adversarial review"] }), live([handMade(), staging]));
    expect(both.changes).toEqual([]);
  });

  it("keeps a bypass the default branch already has, never widens an existing mode, and says so when it can't read bypass actors", () => {
    const main = handMade();
    main.bypass_actors = [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "pull_request" }];
    const staging: Ruleset = { ...handMade(), id: 7, name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, rules: [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, do_not_enforce_on_create: true, required_status_checks: [{ context: "Adversarial review", integration_id: GITHUB_ACTIONS_APP_ID }] } }], bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "pull_request" }] };
    const spec2 = protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: ["Adversarial review"] });
    const plan = planProtection(spec2, live([main, staging]));
    expect(plan.changes).toEqual([]);
    expect(plan.notes.join("\n")).toContain('bypasses it only "pull_request"; genesis repo prune-staging needs "always"');

    const unread = { ...staging };
    delete unread.bypass_actors;
    const blind = planProtection(spec2, live([main, unread]));
    expect(blind.changes).toEqual([]);
    expect(blind.notes.join("\n")).toContain("can't tell whether the repository admin role bypasses it");
    const pin = { ...unread, rules: unread.rules.map((x) => (x.type === "required_status_checks" ? { ...x, parameters: { ...x.parameters, required_status_checks: [{ context: "Adversarial review" }] } } : x)) };
    const put = planProtection(spec2, live([main, pin])).writes[0]!;
    expect("bypass_actors" in put.body).toBe(false);
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
    types: [opened, synchronize, reopened, labeled]
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

  it("never requires a matrix job, named or not: GitHub reports one check per leg", async () => {
    const named = "on: pull_request\njobs:\n  test:\n    name: Test\n    strategy: { matrix: { node: [18, 20] } }\n    runs-on: ubuntu-latest\n  lint:\n    runs-on: ubuntu-latest\n";
    const unnamed = "on: pull_request\njobs:\n  test:\n    strategy: { matrix: { node: [18, 20] } }\n    runs-on: ubuntu-latest\n";
    const a = await checksFromWorkflows([{ path: ".github/workflows/a.yml", text: named }], "main");
    expect(a.required).toEqual(["lint"]);
    expect(a.notes.join("\n")).toContain("job test is a matrix, which reports one check per leg");
    const b = await checksFromWorkflows([{ path: ".github/workflows/b.yml", text: unnamed }], "main");
    expect(b.required).toEqual([]);
    expect(b.notes.join("\n")).toContain("job test is a matrix");
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

describe("CodeRabbit round: discovery", () => {
  const job = "    runs-on: ubuntu-latest\n";
  it("reads GitHub's whole branch-filter grammar, and the rulesets' fnmatch", () => {
    expect(branchMatches({ branches: ["ma[ij]n"] }, "main")).toBe(true);
    expect(branchMatches({ branches: ["releases/v?1"] }, "releases/1")).toBe(true);
    expect(branchMatches({ branches: ["releases/v+1"] }, "releases/vv1")).toBe(true);
    expect(branchMatches({ branches: ["feat\\*"] }, "feat*")).toBe(true);
    expect(branchMatches({ branches: ["feat\\*"] }, "feature")).toBe(false);
    expect(branchMatches({ branches: ["[0-9]*", "!9*"] }, "9x")).toBe(false);
    expect(refPattern("refs/heads/stag?ng/**/*").test("refs/heads/staging/2026-11-20/a")).toBe(true);
    expect(refPattern("refs/heads/[!m]ain").test("refs/heads/main")).toBe(false);
  });

  it("requires a workflow only when its types cover opened, synchronize and reopened", async () => {
    const opened = await checksFromWorkflows([{ path: ".github/workflows/o.yml", text: `on:\n  pull_request:\n    types: [opened]\njobs:\n  lint:\n${job}` }], "main");
    expect(opened.required).toEqual([]);
    expect(opened.notes.join("\n")).toContain("pull_request runs on opened, not synchronize, reopened");
    const full = await checksFromWorkflows([{ path: ".github/workflows/f.yml", text: `on:\n  pull_request:\n    types: [opened, synchronize, reopened, labeled]\njobs:\n  lint:\n${job}` }], "main");
    expect(full.required).toEqual(["lint"]);
  });

  it("treats triggers as alternatives: an unfiltered one keeps the workflow required", async () => {
    const text = `on:\n  pull_request:\n  pull_request_target:\n    paths: ["docs/**"]\njobs:\n  lint:\n${job}`;
    const out = await checksFromWorkflows([{ path: ".github/workflows/t.yml", text }], "main");
    expect(out.required).toEqual(["lint"]);
    expect(out.conditional).toEqual([]);
  });

  it("leaves out a matrix job that calls a reusable workflow", async () => {
    const text = "on: pull_request\njobs:\n  app:\n    strategy: { matrix: { node: [20, 22] } }\n    uses: ./.github/workflows/r.yml\n";
    const out = await checksFromWorkflows([{ path: ".github/workflows/m.yml", text }, { path: ".github/workflows/r.yml", text: `on: workflow_call\njobs:\n  test:\n${job}` }], "main");
    expect(out.required).toEqual([]);
    expect(out.notes.join("\n")).toContain("job app is a matrix");
  });

  it("reads staging checks for the real staging branches: required where every batch reports, conditional where some do", async () => {
    const files = [
      { path: ".github/workflows/gate.yml", text: `on:\n  pull_request:\n    branches: ["staging/2026-*/*"]\njobs:\n  gate:\n    name: Adversarial review\n${job}` },
      { path: ".github/workflows/new.yml", text: `on:\n  pull_request:\n    branches: ["staging/2026-11-2*/*"]\njobs:\n  e2e:\n${job}` },
    ];
    const out = await stagingChecksFor(files, ["staging/2026-11-10/a", "staging/2026-11-20/a"]);
    expect(out.required).toEqual(["Adversarial review"]);
    expect(out.conditional).toEqual([{ context: "e2e", why: "it reports on pull requests into only 1 of 2 staging branches (staging/2026-11-20/a)" }]);
    const none = await stagingChecksFor(files, []);
    expect(none.notes.join("\n")).toContain("no staging branch yet");
  });
});

describe("CodeRabbit round: planning", () => {
  const spec2 = () => protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: ["Test"] });
  const stagingLive = (checks: string[], extra: Partial<Ruleset> = {}): Ruleset => ({ id: 7, name: "staging-branches", target: "branch", enforcement: "active", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, rules: [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, do_not_enforce_on_create: true, required_status_checks: checks.map((context) => ({ context, integration_id: GITHUB_ACTIONS_APP_ID })) } }], bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }], ...extra });

  it("keeps conditional checks per ruleset: main's path filter doesn't touch staging", () => {
    const main = handMade();
    (main.rules[3]!.parameters!.required_status_checks as Array<{ context: string }>).push({ context: "Test" });
    const plan = planProtection(spec2(), live([main, stagingLive(["Test"])]), { conditional: { default: [{ context: "Test", why: "path-filtered on main" }] } });
    expect(plan.changes).toEqual([{ scope: 'ruleset "default"', kind: "remove", what: 'required check "Test"', why: "path-filtered on main" }]);
  });

  it("reconciles an existing status-check rule when nothing is wanted, and drops the rule when no check is left", () => {
    const r = handMade();
    const plan = planProtection(protectionSpec({ defaultChecks: [], stagingChecks: null }), live([r]), { exact: ["default"] });
    expect(plan.changes.map((c) => `${c.kind} ${c.what}`)).toEqual(['remove required check "app / App checks"', 'remove required check "database / Database and pgTAP"', 'remove required check "Adversarial review"', "remove rule required_status_checks"]);
    expect((plan.writes[0]!.body.rules as Ruleset["rules"]).some((x) => x.type === "required_status_checks")).toBe(false);
  });

  it("removes an exclusion that leaves the protected branch out", () => {
    const r = handMade();
    r.conditions.ref_name.exclude = ["refs/heads/main", "refs/heads/archive/*"];
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: null }), live([r]));
    expect(plan.changes).toEqual([{ scope: 'ruleset "default"', kind: "remove", what: "exclusion refs/heads/main", why: "it leaves main unprotected" }]);
    expect((plan.writes[0]!.body.conditions as Ruleset["conditions"]).ref_name.exclude).toEqual(["refs/heads/archive/*"]);
  });

  it("leaves a ruleset shared by main and staging as it is: neither main's checks nor the staging bypass go on it", () => {
    const combined: Ruleset = { ...handMade(), id: 55, name: "everything", enforcement: "evaluate", conditions: { ref_name: { include: ["~DEFAULT_BRANCH", STAGING_REF], exclude: [] } }, bypass_actors: [] };
    const plan = planProtection(spec2(), live([combined]));
    expect(plan.writes.filter((w) => w.method === "PUT")).toEqual([]);
    const posts = plan.writes.filter((w) => w.method === "POST").map((w) => w.body);
    expect(posts[0]).toMatchObject({ name: "default", conditions: { ref_name: { include: ["~DEFAULT_BRANCH"] } }, bypass_actors: [] });
    expect(posts[1]).toMatchObject({ name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF] } }, bypass_actors: [{ actor_id: 5, bypass_mode: "always" }] });
  });

  it("adopts a default-only ruleset, never one that also targets other branches", () => {
    const shared: Ruleset = { ...handMade(), id: 66, name: "default", conditions: { ref_name: { include: ["~DEFAULT_BRANCH", "refs/heads/release/*"], exclude: [] } } };
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks"], stagingChecks: null }), live([shared]));
    expect(plan.writes.some((w) => w.path.endsWith("/66"))).toBe(false);
    expect(plan.writes.find((w) => w.method === "POST")!.body).toMatchObject({ name: "default-only", conditions: { ref_name: { include: ["~DEFAULT_BRANCH"] } } });
    expect(plan.notes.join("\n")).toContain('"default-only", is created; GitHub enforces both');
  });

  it("refuses to turn rebase off when it would leave no merge method, and never turns merge commits back on", () => {
    const off = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: null }), live([handMade()], { delete_branch_on_merge: true, allow_auto_merge: true, allow_rebase_merge: true, allow_merge_commit: false, allow_squash_merge: false }));
    expect(off.refusals.join("\n")).toContain("would leave no merge method");
    const squash = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: null }), live([handMade()], { delete_branch_on_merge: true, allow_auto_merge: true, allow_rebase_merge: false, allow_merge_commit: false, allow_squash_merge: true }));
    expect(squash.changes).toEqual([]);
    expect(squash.refusals).toEqual([]);
  });
});

describe("CodeRabbit round 2", () => {
  it("types the conditional delete as GitHub's schema does (RefUpdate.name is GitRefname!)", () => {
    expect(DELETE_IF_AT).toContain("$name: GitRefname!");
    expect(DELETE_IF_AT).toContain("$before: GitObjectID!");
    expect(DELETE_IF_AT).toContain("$repo: ID!");
    expect(DELETE_IF_AT).not.toContain("String!");
  });

  it("puts the staging bypass only on a ruleset whose every include is a staging pattern", () => {
    const wide: Ruleset = { id: 9, name: "staging-branches", target: "branch", enforcement: "active", conditions: { ref_name: { include: [STAGING_REF, "refs/heads/release/*"], exclude: [] } }, rules: [{ type: "deletion" }, { type: "non_fast_forward" }], bypass_actors: [] };
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: [] }), live([handMade(), wide]));
    expect(plan.writes.some((w) => w.path.endsWith("/rulesets/9"))).toBe(false);
    const post = plan.writes.find((w) => w.method === "POST")!;
    expect(post.body).toMatchObject({ name: "staging-branches-only", conditions: { ref_name: { include: [STAGING_REF] } }, bypass_actors: [{ actor_id: 5 }] });
  });
});

describe("CodeRabbit round 3", () => {
  const REMOTE3 = () => Object.fromEntries(Object.entries(CI_FILES).map(([k, v]) => [path.basename(k), v]));

  it("a non-object repo value never aborts config loading: the doctor reports it, genesis repo refuses it", async () => {
    const top = repoDir(CI_FILES, { repo: "sample-app" });
    const { readGenesisConfig } = await import("../src/doctor/config.js");
    expect(readGenesisConfig(top)?.repoProblem).toContain('"repo" must be an object');
    await expect(planRepo({ root: top, run: fakeGitHub(top, { rulesets: [handMade()], remote: REMOTE3() }).run })).rejects.toThrow(/"repo" must be an object/);
    const app = makeApp(null, { "genesis.config.json": JSON.stringify({ repo: "sample-app" }) });
    mkdirSync(path.join(app, ".git"));
    const fake = fakeGitHub(app, { rulesets: [] });
    const d = await runDoctor({ root: app, network: true, repo: { run: fake.run, ci: false }, config: { rules: { "genesis-behind": "off" } } });
    expect(d.findings.filter((f) => f.rule === "repo-protection").map((f) => f.level)).toEqual(["warn"]);
    expect(fake.calls).toEqual([]);
  });

  it("pins every REST and GraphQL call to github.com", async () => {
    const top = repoDir(CI_FILES);
    const fake = fakeGitHub(top, { rulesets: [handMade()], remote: REMOTE3() });
    await planRepo({ root: top, run: fake.run });
    const gh = fake.calls.filter((c) => c.args[0] === "gh");
    expect(gh.length).toBeGreaterThan(3);
    expect(gh.every((c) => c.args.slice(1, 4).join(" ") === "api --hostname github.com")).toBe(true);
  });

  it("a 404 on the workflows is empty only when the folders above list without them; otherwise unknown", async () => {
    const top = repoDir(CI_FILES);
    const absent = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [handMade()], workflows404: "absent" }).run });
    expect(absent.localRef).toBe(null);
    expect(absent.defaultChecks).toEqual([]);
    const unknown = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [handMade()], workflows404: "unreadable" }).run });
    expect(unknown.localRef).toBe("feature-x");
  });

  it("refuses to write when the staging inventory fails, and keeps a refused --json run machine-readable", async () => {
    const top = repoDir(CI_FILES);
    const lines: string[] = [];
    expect(await runRepoProtect({ root: top, run: fakeGitHub(top, { rulesets: [handMade()], remote: REMOTE3(), failBranches: true }).run, json: true, out: (l) => lines.push(l) })).toBe(1);
    const out = JSON.parse(lines.join("\n")) as { refused: string[]; written: unknown[] };
    expect(out.refused.join("\n")).toContain("couldn't list acme/sample-app's staging branches");
    expect(out.written).toEqual([]);
  });

  it("reconciles a required check whose workflow now runs only on opened as conditional", async () => {
    const files = [{ path: ".github/workflows/l.yml", text: "on:\n  pull_request:\n    types: [opened]\njobs:\n  lint:\n    runs-on: ubuntu-latest\n" }];
    const out = await checksFromWorkflows(files, "main");
    expect(out.conditional.map((c) => c.context)).toEqual(["lint"]);
    const both = await checksFromWorkflows([...files, { path: ".github/workflows/m.yml", text: "on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n" }], "main");
    expect(both.required).toEqual(["lint"]);
    expect(both.conditional).toEqual([]);
  });

  it("with a merge queue, refuses to add a check that has no merge_group trigger", async () => {
    const top = repoDir(CI_FILES);
    const queued = handMade();
    queued.rules.push({ type: "merge_queue", parameters: {} });
    (queued.rules[3]!.parameters!.required_status_checks as unknown[]).splice(0, 1);
    const result = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [queued], remote: REMOTE3() }).run });
    expect(result.plan.refusals.join("\n")).toContain('main has a merge queue, and "app / App checks" has no merge_group trigger');
  });

  it("refuses new staging checks when a batch's workflows differ from the default branch's", async () => {
    const top = repoDir(CI_FILES);
    const old = { ...REMOTE3(), "review-gate.yml": "on: { pull_request: {} }\njobs: {}\n" };
    const result = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [handMade()], remote: { ...REMOTE3(), "gate.yml": "on:\n  pull_request:\n    branches: ['staging/**']\njobs:\n  gate:\n    name: Batch gate\n    runs-on: ubuntu-latest\n" }, branches: ["staging/2026-11-20/a"], batchRemote: { "staging/2026-11-20/a": old } }).run });
    expect(result.plan.refusals.join("\n")).toContain('staging/2026-11-20/a has other workflows than main, so "Batch gate" might never report there');
  });

  it("re-reads a ruleset just before its PUT and doesn't overwrite one that changed", async () => {
    const top = repoDir(CI_FILES);
    const r = { ...handMade(), updated_at: "2026-11-21T10:00:00Z" };
    const fake = fakeGitHub(top, { rulesets: [r], remote: REMOTE3(), settings: { allow_rebase_merge: false }, rulesetNow: { 101: { updated_at: "2026-11-21T10:05:00Z" } } });
    (r.rules[2]!.parameters as Record<string, unknown>).allowed_merge_methods = ["merge", "squash", "rebase"];
    await expect(runRepoProtect({ root: top, run: fake.run, out: () => {} })).rejects.toThrow(/changed since it was planned[\s\S]*Nothing was written/);
    expect(fake.calls.some((c) => c.args.includes("PUT"))).toBe(false);
  });

  it("reads a pinned reusable workflow at the ref uses: names", async () => {
    const top = repoDir({ ".github/workflows/ci.yml": "on: pull_request\njobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@1111111111111111111111111111111111111111\n" });
    const pinned = { "1111111111111111111111111111111111111111": "on: workflow_call\njobs:\n  app:\n    name: App checks v1\n    runs-on: ubuntu-latest\n", "2222222222222222222222222222222222222222": "on: workflow_call\njobs:\n  app:\n    name: App checks v2\n    runs-on: ubuntu-latest\n" };
    const result = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [], remote: { "ci.yml": "on: pull_request\njobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@1111111111111111111111111111111111111111\n" }, pinned }).run });
    expect(result.defaultChecks).toEqual(["app / App checks v1"]);
  });

  it("prune checks every covering deletion rule per branch: an exclusion lets one through, ~ALL blocks", async () => {
    const top = repoDir(CI_FILES);
    const staging = { ...handMade(), id: 202, name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF], exclude: ["refs/heads/staging/2026-11-01/*"] } }, current_user_can_bypass: "never" };
    const branches = ["staging/2026-11-01/a", "staging/2026-11-02/a", "staging/2026-11-21/b"];
    const lines: string[] = [];
    expect(await runPruneStaging({ root: top, run: fakeGitHub(top, { rulesets: [staging], branches }).run, dryRun: true, out: (l) => lines.push(l) })).toBe(1);
    expect(lines.join("\n")).toMatch(/would fail staging\/2026-11-02\/a: no bypass of ruleset "staging-branches"[\s\S]*would delete staging\/2026-11-01\/a/);
    const all = { ...handMade(), id: 303, name: "everything", conditions: { ref_name: { include: ["~ALL"], exclude: [] } }, current_user_can_bypass: "never" };
    const blocked: string[] = [];
    expect(await runPruneStaging({ root: top, run: fakeGitHub(top, { rulesets: [all], branches }).run, dryRun: true, out: (l) => blocked.push(l) })).toBe(1);
    expect(blocked.join("\n")).toContain('no bypass of ruleset "everything"');
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
    expect(slugFromRemote("ssh://git@github.com/acme/sample-app.git")).toBe("acme/sample-app");
    expect(slugFromRemote("ssh://git@github.com:22/acme/sample-app.git")).toBe("acme/sample-app");
    expect(slugFromRemote("https://notgithub.com/acme/sample-app.git")).toBe(null);
    expect(slugFromRemote("https://github.com.evil.example/acme/sample-app")).toBe(null);
    expect(slugFromRemote("git@notgithub.com:acme/sample-app.git")).toBe(null);
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

/** A stable fake commit id per branch. */
const tipOf = (branch: string) => createHash("sha1").update(branch).digest("hex");

function fakeGitHub(top: string, state: { rulesets: Ruleset[]; settings?: Record<string, unknown>; branches?: string[]; pulls?: unknown[]; ahead?: Record<string, number>; failWrites?: string[]; remote?: Record<string, string>; failDelete?: boolean; failBranches?: boolean; workflows404?: "absent" | "unreadable"; batchRemote?: Record<string, Record<string, string>>; rulesetNow?: Record<number, Partial<Ruleset>>; pinned?: Record<string, string> }): Fake {
  const calls: Fake["calls"] = [];
  const reads = new Map<string, number>();
  const ok = (stdout: unknown): RunToolResult => ({ code: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "" });
  const run: ToolRunner = async (tool, args, options) => {
    calls.push({ args: [tool, ...args], ...(options.stdin !== undefined ? { stdin: options.stdin } : {}) });
    if (tool === "git") return args.includes("--abbrev-ref") ? ok("feature-x\n") : args[0] === "rev-parse" ? ok(`${top}\n`) : ok("git@github.com:acme/sample-app.git\n");
    const target = args.filter((a) => a.startsWith("repos/")).at(-1) ?? "";
    if (args.includes("-X") && !(state.failWrites ?? []).includes(target)) return ok("{}");
    if (args.includes("-X")) return { code: 1, stdout: "", stderr: "gh: Resource not accessible (HTTP 403)" };
    if (args.includes("graphql")) return state.failDelete ? ok({ errors: [{ message: "Reference has moved" }] }) : ok({ data: { updateRefs: { clientMutationId: null } } });
    const refTip = /git\/ref\/heads\/(.+)$/.exec(target);
    if (refTip) return ok({ object: { sha: tipOf(refTip[1]!) } });
    if (target === "repos/acme/sample-app") return ok({ node_id: "R_sample", default_branch: "main", delete_branch_on_merge: true, allow_auto_merge: true, allow_rebase_merge: true, allow_merge_commit: true, ...state.settings });
    if (target.startsWith("repos/acme/sample-app/rulesets?")) return ok(state.rulesets.map((r) => ({ id: r.id, name: r.name, target: r.target, source_type: "Repository" })));
    const rs = /rulesets\/(\d+)$/.exec(target);
    if (rs) {
      // The first read is the plan's; later ones (the re-read before a PUT) see `rulesetNow`.
      const n = (reads.get(rs[1]!) ?? 0) + 1;
      reads.set(rs[1]!, n);
      const r = state.rulesets.find((x) => String(x.id) === rs[1]);
      return ok(n > 1 && state.rulesetNow?.[Number(rs[1])] ? { ...r, ...state.rulesetNow[Number(rs[1])] } : r);
    }
    if (target.includes("/git/matching-refs/heads/staging/")) return state.failBranches ? { code: 1, stdout: "", stderr: "gh: HTTP 502" } : ok((state.branches ?? []).map((b) => ({ ref: `refs/heads/${b}` })));
    if (state.workflows404 && target.startsWith("repos/acme/sample-app/contents")) {
      if (target.startsWith("repos/acme/sample-app/contents/.github/workflows")) return { code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" };
      if (state.workflows404 === "unreadable") return { code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" };
      if (/contents\?ref=/.test(target)) return ok([{ type: "file", name: "README.md" }]);
    }
    // A pinned reusable workflow at a given ref (ref-sensitive).
    const pin = /^repos\/marktiderman\/genesis\/contents\/(.+)\?ref=(.+)$/.exec(target);
    if (pin && state.pinned?.[decodeURIComponent(pin[2]!)]) return ok(state.pinned[decodeURIComponent(pin[2]!)]);
    const batch = /^repos\/acme\/sample-app\/contents\/\.github\/workflows\?ref=(.+)$/.exec(target);
    if (batch && state.batchRemote?.[decodeURIComponent(batch[1]!)]) return ok(Object.entries(state.batchRemote[decodeURIComponent(batch[1]!)]!).map(([name, text]) => ({ type: "file", name, sha: createHash("sha1").update(text).digest("hex") })));
    // The app's own workflows on its default branch: unreadable unless the test gives them.
    if (target.startsWith("repos/acme/sample-app/contents/.github/workflows")) {
      if (!state.remote) return { code: 1, stdout: "", stderr: "gh: connection refused" };
      const file = /workflows\/([^?]+)\?/.exec(target)?.[1];
      if (!file) return ok(Object.entries(state.remote).map(([name, text]) => ({ type: "file", name, path: `.github/workflows/${name}`, sha: createHash("sha1").update(text).digest("hex") })));
      return ok(state.remote[file] ?? "");
    }
    if (target.includes("/contents/")) return ok(genesisWorkflow(path.basename(target.split("?")[0]!)));
    if (target.includes("/pulls?")) return ok(((state.pulls ?? []) as Array<{ base?: { ref?: string }; head?: { ref?: string; repo?: { full_name?: string } } }>).map((p) => JSON.stringify({ base: p.base?.ref, head: p.head?.ref, repo: p.head?.repo?.full_name })).join("\n"));
    const cmp = /compare\/main\.\.\.(.+)$/.exec(target);
    if (cmp) return ok({ ahead_by: Object.entries(state.ahead ?? {}).find(([b]) => tipOf(b) === cmp[1] || b === cmp[1])?.[1] ?? 0 });
    return { code: 1, stdout: "", stderr: `unexpected ${target}` };
  };
  return { run, calls };
}

const CI_FILES = {
  ".github/workflows/ci.yml": "on:\n  pull_request:\n    branches: [main]\njobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@0123456789abcdef0123456789abcdef01234567\n",
  ".github/workflows/database.yml": "on:\n  pull_request:\n    paths: ['supabase/**']\njobs:\n  database:\n    uses: marktiderman/genesis/.github/workflows/supabase-ci.yml@0123456789abcdef0123456789abcdef01234567\n    with:\n      doctor: false\n",
  ".github/workflows/review-gate.yml": "on:\n  pull_request_target:\n    branches: ['main']\njobs:\n  review:\n    name: Adversarial review\n    runs-on: ubuntu-latest\n",
};

/** CI_FILES as GitHub serves them on the default branch. */
const REMOTE = Object.fromEntries(Object.entries(CI_FILES).map(([k, v]) => [path.basename(k), v]));

describe("genesis repo protect", () => {
  it("--dry-run prints the diff and writes nothing; without it, PUTs the ruleset and PATCHes the settings with the bodies on stdin", async () => {
    const top = repoDir(CI_FILES);
    const fake = fakeGitHub(top, { rulesets: [handMade()], remote: REMOTE });
    const lines: string[] = [];
    expect(await runRepoProtect({ root: top, run: fake.run, dryRun: true, out: (l) => lines.push(l) })).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain('- required check "database / Database and pgTAP"');
    expect(text).toContain("~ allow_rebase_merge: true → false");
    expect(fake.calls.some((c) => c.args.includes("-X"))).toBe(false);

    const applied = fakeGitHub(top, { rulesets: [handMade()], remote: REMOTE });
    await runRepoProtect({ root: top, run: applied.run, out: () => {} });
    const writes = applied.calls.filter((c) => c.args.includes("-X"));
    expect(writes.every((c) => c.args.slice(1, 4).join(" ") === "api --hostname github.com")).toBe(true);
    expect(writes.map((c) => c.args.slice(4, 7).join(" "))).toEqual(["-X PUT repos/acme/sample-app/rulesets/101", "-X PATCH repos/acme/sample-app"]);
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

describe("where the workflows are read", () => {
  const remoteFiles = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([k, v]) => [path.basename(k), v]));

  it("reads them on the default branch through GitHub, not from a checkout that differs", async () => {
    // The checkout still has the path filter; the default branch dropped it.
    const top = repoDir(CI_FILES);
    const onMain = { ...CI_FILES, ".github/workflows/database.yml": CI_FILES[".github/workflows/database.yml"].replace("    paths: ['supabase/**']\n", "") };
    const fake = fakeGitHub(top, { rulesets: [handMade()], remote: remoteFiles(onMain) });
    const result = await planRepo({ root: top, run: fake.run });
    expect(result.defaultChecks).toEqual(["app / App checks", "database / Database and pgTAP", "Adversarial review"]);
    expect(result.plan.changes.filter((c) => c.scope !== "settings")).toEqual([]);
    expect(result.plan.notes.join("\n")).not.toContain("local checkout");
    expect(fake.calls.some((c) => c.args.at(-1) === "repos/acme/sample-app/contents/.github/workflows/database.yml?ref=main")).toBe(true);
  });

  it("falls back to the local files only when GitHub can't be read, and says it did, at which ref", async () => {
    const top = repoDir(CI_FILES);
    const result = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [handMade()] }).run });
    expect(result.plan.notes.join("\n")).toMatch(/couldn't be read from GitHub[\s\S]*local checkout at feature-x, which may differ from main/);
    expect(result.plan.changes.some((c) => c.what === 'required check "database / Database and pgTAP"')).toBe(true);
  });

  it("a real run refuses to write checks from the local fallback unless --use-local; a dry run shows the plan", async () => {
    const top = repoDir(CI_FILES);
    const dry = fakeGitHub(top, { rulesets: [handMade()] });
    const shown: string[] = [];
    expect(await runRepoProtect({ root: top, run: dry.run, dryRun: true, out: (l) => shown.push(l) })).toBe(0);
    expect(shown.join("\n")).toContain("local checkout at feature-x");

    const real = fakeGitHub(top, { rulesets: [handMade()] });
    const said: string[] = [];
    expect(await runRepoProtect({ root: top, run: real.run, out: (l) => said.push(l) })).toBe(1);
    expect(said.join("\n")).toContain("couldn't read acme/sample-app's workflows from GitHub; re-run when it can, or pass --use-local to accept the local checkout at feature-x");
    expect(real.calls.some((c) => c.args.includes("-X"))).toBe(false);
    const digest = planDigest((await planRepo({ root: top, run: real.run })).plan);
    await expect(applyApprovedPlan({ root: top, run: real.run }, digest)).rejects.toThrow(/--use-local/);

    const accepted = fakeGitHub(top, { rulesets: [handMade()] });
    expect(await runRepoProtect({ root: top, run: accepted.run, useLocal: true, out: () => {} })).toBe(0);
    expect(accepted.calls.some((c) => c.args.includes("-X"))).toBe(true);
  });

  it("says why a rebase-only ruleset moves to merge and squash", () => {
    const r = handMade();
    (r.rules[2]!.parameters as Record<string, unknown>).allowed_merge_methods = ["rebase"];
    const plan = planProtection(protectionSpec({ defaultChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"], stagingChecks: null }), live([r]));
    expect(plan.changes).toEqual([{ scope: 'ruleset "default"', kind: "change", what: "pull_request.allowed_merge_methods: [rebase] → [merge, squash]", why: "rebase merging is off by the Genesis standard (merge, never rebase), so merge and squash are what's left" }]);
  });
});

describe("applying", () => {
  it("names the checks repo.requiredChecks lists even when their workflow is path-filtered, with a note", async () => {
    const top = repoDir(CI_FILES, { repo: { requiredChecks: ["app / App checks", "database / Database and pgTAP", "Adversarial review"] } });
    const result = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [handMade()] }).run });
    expect(result.plan.changes.filter((c) => c.scope !== "settings")).toEqual([]);
    expect(result.plan.notes.join("\n")).toContain('"database / Database and pgTAP" is required on main because genesis.config.json repo names it');
  });

  it("says which writes landed when one fails, and that it needs the admin role", async () => {
    const top = repoDir(CI_FILES);
    const fake = fakeGitHub(top, { rulesets: [handMade()], failWrites: ["repos/acme/sample-app"], remote: REMOTE });
    await expect(runRepoProtect({ root: top, run: fake.run, out: () => {} })).rejects.toThrow(/admin role\)\. Already written: PUT repos\/acme\/sample-app\/rulesets\/101/);
  });

  it("applies only the approved plan: a repository that changed since is refused", async () => {
    const top = repoDir(CI_FILES);
    const before = await planRepo({ root: top, run: fakeGitHub(top, { rulesets: [handMade()], remote: REMOTE }).run });
    const changed = handMade();
    // Someone added a rule since: the PUT that keeps it isn't the PUT that was approved.
    changed.rules.push({ type: "required_signatures" });
    const now = fakeGitHub(top, { rulesets: [changed], remote: REMOTE });
    await expect(applyApprovedPlan({ root: top, run: now.run }, planDigest(before.plan))).rejects.toThrow(/changed since the plan was approved/);
    expect(now.calls.some((c) => c.args.includes("-X"))).toBe(false);
    const same = fakeGitHub(top, { rulesets: [handMade()], remote: REMOTE });
    expect(await applyApprovedPlan({ root: top, run: same.run }, planDigest(before.plan))).toEqual(["PUT repos/acme/sample-app/rulesets/101", "PATCH repos/acme/sample-app"]);
  });
});

describe("genesis repo prune-staging", () => {
  it("orders batches by date, then letter (z before aa)", () => {
    expect(["staging/2026-11-21/aa", "staging/2026-11-21/z", "staging/2026-11-20/b"].sort(compareBatches)).toEqual(["staging/2026-11-20/b", "staging/2026-11-21/z", "staging/2026-11-21/aa"]);
  });

  it("deletes merged batches, never the newest, one with an open pull request or an undated staging branch", async () => {
    const top = repoDir(CI_FILES);
    const state = {
      rulesets: [{ ...handMade(), id: 202, name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, current_user_can_bypass: "always" }],
      branches: ["staging/2026-11-01/a", "staging/2026-11-05/a", "staging/2026-11-10/a", "staging/2026-11-15/a", "staging/2026-11-21/b", "staging/launch-hold"],
      pulls: [
        { base: { ref: "staging/2026-11-15/a" }, head: { ref: "feat/x", repo: { full_name: "acme/sample-app" } } },
        // Same repository, other case: still ours, so its head batch is kept.
        { base: { ref: "main" }, head: { ref: "staging/2026-11-05/a", repo: { full_name: "ACME/Sample-App" } } },
      ],
      ahead: { "staging/2026-11-10/a": 2 },
    };
    const dry = fakeGitHub(top, state);
    const lines: string[] = [];
    await runPruneStaging({ root: top, run: dry.run, dryRun: true, out: (l) => lines.push(l) });
    expect(lines.join("\n")).toMatch(/would delete staging\/2026-11-01\/a[\s\S]*1 to delete/);
    expect(lines.join("\n")).toContain("keep staging/2026-11-21/b: the newest batch");
    expect(lines.join("\n")).toContain("keep staging/2026-11-05/a: an open pull request comes from it");
    expect(lines.join("\n")).toContain("keep staging/launch-hold: not a dated batch");
    expect(dry.calls.some((c) => c.args.includes("graphql"))).toBe(false);

    const real = fakeGitHub(top, state);
    await runPruneStaging({ root: top, run: real.run, out: () => {} });
    // Deleted only at the commit that was checked (updateRefs with beforeOid), never by name alone.
    const deletes = real.calls.filter((c) => c.args.includes("graphql"));
    expect(deletes.map((c) => c.args.filter((a) => /^(repo|name|before)=/.test(a)))).toEqual([["repo=R_sample", "name=refs/heads/staging/2026-11-01/a", `before=${tipOf("staging/2026-11-01/a")}`]]);
    expect(real.calls.some((c) => c.args.includes("DELETE"))).toBe(false);

    // A branch that moved after the check: the delete fails, and says nothing else went with it.
    const moved = fakeGitHub(top, { ...state, failDelete: true });
    const said: string[] = [];
    expect(await runPruneStaging({ root: top, run: moved.run, out: (l) => said.push(l) })).toBe(1);
    expect(said.join("\n")).toMatch(/Reference has moved[\s\S]*may have moved since it was checked[\s\S]*Nothing was deleted/);
  });

  it("refuses when the account can't bypass the staging ruleset's deletion rule", async () => {
    const top = repoDir(CI_FILES);
    const fake = fakeGitHub(top, { rulesets: [{ ...handMade(), id: 202, name: "staging-branches", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, current_user_can_bypass: "never" }], branches: ["staging/2026-01-01/a", "staging/2026-01-02/a"] });
    const lines: string[] = [];
    expect(await runPruneStaging({ root: top, run: fake.run, out: (l) => lines.push(l) })).toBe(1);
    expect(lines.join("\n")).toContain("can't bypass it");
    const dry: string[] = [];
    expect(await runPruneStaging({ root: top, run: fake.run, dryRun: true, out: (l) => dry.push(l) })).toBe(1);
    expect(dry.join("\n")).toContain("would fail staging/2026-01-01/a: no bypass");
  });
});

describe("doctor: repo-protection", () => {
  it("reports each difference as a warning when the network is on, and makes no call when it's off", async () => {
    const top = makeApp(null, CI_FILES);
    mkdirSync(path.join(top, ".git"));
    const fake = fakeGitHub(top, { rulesets: [handMade()] });
    const on = await runDoctor({ root: top, network: true, repo: { run: fake.run, ci: false }, config: { rules: { "genesis-behind": "off" } } });
    const found = on.findings.filter((f) => f.rule === "repo-protection");
    expect(found.filter((f) => f.level === "warn").length).toBe(2);
    // The planner's notes reach the doctor as info.
    expect(found.some((f) => f.level === "info")).toBe(true);
    expect(found.map((f) => f.message).join("\n")).toMatch(/requires required check "database \/ Database and pgTAP"[\s\S]*allow_rebase_merge/);

    // A checkout without .github/workflows still gets checked: the default branch's workflows decide.
    const bare = makeApp(null, {});
    mkdirSync(path.join(bare, ".git"));
    const remoteOnly = fakeGitHub(bare, { rulesets: [handMade()], remote: Object.fromEntries(Object.entries(CI_FILES).map(([k, v]) => [path.basename(k), v])) });
    const fromMain = await runDoctor({ root: bare, network: true, repo: { run: remoteOnly.run, ci: false }, config: { rules: { "genesis-behind": "off" } } });
    expect(fromMain.findings.filter((f) => f.rule === "repo-protection").length).toBe(2);

    const quiet = fakeGitHub(top, { rulesets: [handMade()] });
    const off = await runDoctor({ root: top, network: false, repo: { run: quiet.run } });
    expect(off.findings.filter((f) => f.rule === "repo-protection")).toEqual([]);
    expect(quiet.calls).toEqual([]);
  });
});
