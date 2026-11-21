/**
 * `github.branch-protection`: put the app's repository on Genesis's branch-protection standard
 * (src/repo/spec.ts): the rulesets for the default branch and the staging batches, with the
 * required checks read from the app's workflows, and the merge settings. The plan is the
 * `genesis repo protect --dry-run` diff; applying makes its writes through gh (the repository's
 * admin role); verified when the repository matches.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { defineSetupStep } from "./define.js";
import { applyRepoPlan, formatPlan, planRepo } from "../../repo/index.js";
import { OFFLINE, StepError, type StepContext, type StepRunner } from "./framework.js";

export const githubProtectStep = defineSetupStep({
  id: "github.branch-protection",
  title: "Protect the repository's branches",
  tools: ["gh"],
  fields: [
    {
      name: "repo",
      label: "Repository (owner/name)",
      pattern: "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/(?!\\.\\.?$)[A-Za-z0-9._-]{1,100}",
      placeholder: "your-org/your-repo",
      help: "Leave it empty to use the origin remote's repository.",
      optional: true,
    },
  ],
  links: [{ label: "About rulesets", url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets" }],
  instructions: [
    "Sign gh in as an admin of the repository: gh auth login (or set GH_TOKEN).",
    "The plan lists every change: the default branch's ruleset (pull requests, resolved threads, the app's required checks), the staging batches' when the app has them, and the merge settings.",
    "Required checks come from the app's workflows; name them yourself in genesis.config.json's repo.requiredChecks when the workflows don't say.",
    "Apply it. Run genesis repo protect --dry-run any time to see the drift, and genesis repo prune-staging to delete merged staging batches with the rules left on.",
  ],
});

/** The repository's top folder holds workflows: walk up to `.git`. */
function hasWorkflows(root: string): boolean {
  let dir = path.resolve(root);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return existsSync(path.join(dir, ".github", "workflows"));
    const up = path.dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

const options = (ctx: StepContext) => ({ root: ctx.root, run: ctx.run, ...(ctx.fields.repo ? { repo: ctx.fields.repo } : {}) });

export const githubProtect: StepRunner = {
  step: githubProtectStep,
  appliesTo: hasWorkflows,
  async detect(ctx) {
    if (!ctx.network) return ["The network is off: the repository isn't read."];
    try {
      const { plan } = await planRepo(options(ctx));
      return formatPlan(plan, { dryRun: true }).split("\n");
    } catch (err) {
      return [`The repository couldn't be read: ${(err as Error).message}`];
    }
  },
  async plan(ctx) {
    if (!ctx.network) throw new StepError("Branch protection reads the repository from GitHub: run it online.");
    const { plan } = await planRepo(options(ctx));
    const summary = plan.changes.length ? `${plan.slug}: ${plan.changes.map((c) => `${c.scope} ${c.kind} ${c.what}`).join("; ")}` : `${plan.slug} already matches the Genesis standard`;
    return { summary };
  },
  async apply(ctx) {
    const { plan } = await planRepo(options(ctx));
    const done = await applyRepoPlan(options(ctx), plan);
    return done.length ? done : ["Nothing to change."];
  },
  async verify(ctx) {
    if (!ctx.network) return OFFLINE;
    try {
      const { plan } = await planRepo(options(ctx));
      return plan.changes.length ? { ok: false, message: `${plan.changes.length} change(s) left: ${plan.changes.map((c) => c.what).join("; ")}` } : { ok: true, message: `${plan.slug} matches the Genesis branch-protection standard.` };
    } catch (err) {
      return { ok: false, message: `Not checked: ${(err as Error).message}` };
    }
  },
};
