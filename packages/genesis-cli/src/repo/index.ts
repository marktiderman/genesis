/**
 * `genesis repo protect` and `genesis repo prune-staging`: the app's repository on Genesis's
 * branch-protection standard (./spec.ts), with the required checks read from its own CI
 * (./checks.ts) or named in genesis.config.json's `repo` block. The wizard's
 * `github.branch-protection` step and the doctor's `repo-protection` rule use the same plan.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { readGenesisConfig, type GenesisRepo } from "../doctor/config.js";
import { runTool, type ToolRunner } from "../exec/run.js";
import { checksFromWorkflows, type WorkflowFile } from "./checks.js";
import { aheadBy, applyWrite, deleteBranch, GitHubError, isSlug, openPulls, readLive, remoteWorkflows, resolveRepo, stagingBranches, type GitHubDeps } from "./github.js";
import { formatPlan, matchRuleset, planProtection, protectionSpec, STAGING_REF, STAGING_RULESET, type ConditionalCheck, type LiveRepo, type ProtectionPlan } from "./spec.js";

export * from "./spec.js";
export { checksFromWorkflows, branchMatches, branchPattern, type DerivedChecks, type WorkflowFile } from "./checks.js";
export { GitHubError, slugFromRemote } from "./github.js";

/** A staging batch: `staging/<YYYY-MM-DD>/<letter>` (AGENTS.md, "One staging batch at a time"). Sorted by name, the last is the newest. */
const BATCH = /^staging\/\d{4}-\d{2}-\d{2}\/[a-z]+$/;

/** A staging batch's name, for reading which workflows run on pull requests into one. */
const SAMPLE_BATCH = "staging/2000-01-01/a";

export interface RepoOptions {
  /** The app's folder (genesis.config.json); the workflows are read from its repository's top. */
  root: string;
  /** `owner/name`; default: from the `origin` remote. */
  repo?: string;
  run?: ToolRunner;
}

/** The repository's workflow files, from its top folder. */
export function workflowFiles(top: string): WorkflowFile[] {
  const dir = path.join(top, ".github", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => ({ path: `.github/workflows/${f}`, text: readFileSync(path.join(dir, f), "utf8") }));
}

export interface RepoPlan {
  plan: ProtectionPlan;
  live: LiveRepo;
  staging: boolean;
  defaultChecks: string[];
  stagingChecks: string[] | null;
}

function repoConfig(root: string): GenesisRepo {
  return readGenesisConfig(root)?.repo ?? {};
}

/** Where the plan runs: the repository, its slug and the gh seam. */
export async function locate(options: RepoOptions): Promise<{ top: string; slug: string; deps: GitHubDeps }> {
  const run = options.run ?? runTool;
  const { top, slug: fromRemote } = await resolveRepo(run, options.root).catch((err: Error) => {
    if (options.repo) return { top: options.root, slug: null };
    throw err;
  });
  const slug = options.repo ?? fromRemote;
  if (!slug) throw new GitHubError("No GitHub repository: the origin remote isn't on github.com. Pass --repo owner/name.");
  if (!isSlug(slug)) throw new GitHubError(`--repo must be owner/name (got ${JSON.stringify(slug).slice(0, 80)})`);
  return { top, slug, deps: { run, cwd: options.root } };
}

/** Read the repository and plan what brings it to the standard. Reads only. */
export async function planRepo(options: RepoOptions): Promise<RepoPlan> {
  const { top, slug, deps } = await locate(options);
  const config = repoConfig(options.root);
  const live = await readLive(deps, slug);
  const files = workflowFiles(top);
  const remote = remoteWorkflows(deps);
  const onDefault = await checksFromWorkflows(files, live.defaultBranch, remote);
  const stagingSpec = { name: STAGING_RULESET, target: "branch", enforcement: "active", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, rules: [], bypass_actors: [] };
  const staging = config.staging ?? (matchRuleset(stagingSpec, live.rulesets) !== undefined || (await stagingBranches(deps, slug).catch(() => [])).length > 0);
  const onStaging = staging ? await checksFromWorkflows(files, SAMPLE_BATCH, remote) : null;
  const defaultChecks = config.requiredChecks ?? onDefault.required;
  const stagingChecks = staging ? (config.stagingChecks ?? onStaging!.required) : null;
  const conditional: ConditionalCheck[] = [...onDefault.conditional, ...(onStaging?.conditional ?? [])].filter((c, i, all) => all.findIndex((x) => x.context === c.context) === i);
  const exact = [...(config.requiredChecks ? ["default"] : []), ...(config.stagingChecks ? [STAGING_RULESET] : [])];
  const spec = protectionSpec({ defaultChecks, stagingChecks });
  const plan = planProtection(spec, live, { conditional, exact });
  const notes = [...new Set([...onDefault.notes, ...(onStaging?.notes ?? [])])];
  if (!files.length) notes.push(`no workflows in ${path.join(top, ".github/workflows")}: no required checks were read (name them in repo.requiredChecks)`);
  if (!defaultChecks.includes("Adversarial review")) notes.push(`no "Adversarial review" check on ${live.defaultBranch}: the review gate (review-gate.yml) isn't in this repository`);
  plan.notes.push(...notes);
  return { plan, live, staging, defaultChecks, stagingChecks };
}

/** Make the plan's writes, in order. Returns what was written. */
export async function applyRepoPlan(options: RepoOptions, plan: ProtectionPlan): Promise<string[]> {
  const { deps } = await locate({ ...options, repo: plan.slug });
  const done: string[] = [];
  for (const w of plan.writes) {
    await applyWrite(deps, w);
    done.push(`${w.method} ${w.path}`);
  }
  return done;
}

export interface ProtectCommandOptions extends RepoOptions {
  dryRun?: boolean;
  json?: boolean;
  out?: (line: string) => void;
}

/** `genesis repo protect`: print the plan, and apply it unless `dryRun`. Returns the exit code. */
export async function runRepoProtect(options: ProtectCommandOptions): Promise<number> {
  const out = options.out ?? ((l: string) => console.log(l));
  const result = await planRepo(options);
  const applied = options.dryRun || !result.plan.writes.length ? [] : await applyRepoPlan(options, result.plan);
  if (options.json) {
    out(JSON.stringify({ repo: result.plan.slug, dryRun: options.dryRun === true, staging: result.staging, requiredChecks: { default: result.defaultChecks, staging: result.stagingChecks }, changes: result.plan.changes, notes: result.plan.notes, writes: options.dryRun ? result.plan.writes : applied }, null, 2));
    return 0;
  }
  out(formatPlan(result.plan, { dryRun: options.dryRun === true }));
  if (applied.length) out(`✔ ${applied.length} write${applied.length === 1 ? "" : "s"}: ${applied.join(", ")}`);
  else if (options.dryRun && result.plan.writes.length) out("Run genesis repo protect (without --dry-run) to apply it; it needs the repository's admin role.");
  return 0;
}

export interface PruneOptions extends RepoOptions {
  dryRun?: boolean;
  out?: (line: string) => void;
}

/**
 * `genesis repo prune-staging`: delete the staging batches that are done: dated batches
 * (`staging/YYYY-MM-DD/<letter>`) whose every commit is on the default branch, with no open pull
 * request from or into them, that aren't the newest batch (the current one, which may not have its
 * first pull request yet). A staging branch of another name is kept: it has a reason of its own. Deleting goes
 * through the rulesets' admin bypass: no rule is turned off.
 */
export async function runPruneStaging(options: PruneOptions): Promise<number> {
  const out = options.out ?? ((l: string) => console.log(l));
  const { slug, deps } = await locate(options);
  const live = await readLive(deps, slug);
  const branches = (await stagingBranches(deps, slug)).filter((b) => /^staging\/[A-Za-z0-9._/-]+$/.test(b) && !b.split("/").includes("..")).sort();
  if (!branches.length) {
    out(`${slug}: no staging branches.`);
    return 0;
  }
  const dated = branches.filter((b) => BATCH.test(b));
  const newest = dated.at(-1);
  const pulls = await openPulls(deps, slug);
  const done: string[] = [];
  for (const b of branches) {
    if (!BATCH.test(b)) {
      out(`  keep ${b}: not a dated batch (staging/YYYY-MM-DD/<letter>), so it is kept for a reason of its own`);
      continue;
    }
    if (b === newest) {
      out(`  keep ${b}: the newest batch`);
      continue;
    }
    const pr = pulls.find((p) => p.base === b || p.head === b);
    if (pr) {
      out(`  keep ${b}: an open pull request ${pr.base === b ? "goes into" : "comes from"} it`);
      continue;
    }
    const ahead = await aheadBy(deps, slug, live.defaultBranch, b);
    if (ahead > 0) {
      out(`  keep ${b}: ${ahead} commit${ahead === 1 ? "" : "s"} not on ${live.defaultBranch}`);
      continue;
    }
    done.push(b);
  }
  if (!done.length) {
    out(`${slug}: nothing to delete.`);
    return 0;
  }
  const guard = live.rulesets.find((r) => r.conditions?.ref_name?.include?.some((i) => i.includes("staging")) && r.rules?.some((x) => x.type === "deletion"));
  if (guard && guard.current_user_can_bypass === "never" && !options.dryRun) {
    out(`✗ Ruleset "${guard.name}" blocks deleting staging branches and this account can't bypass it. genesis repo protect gives the repository's admin role the bypass; run this as an admin.`);
    return 1;
  }
  for (const b of done) {
    if (options.dryRun) out(`  would delete ${b}: merged into ${live.defaultBranch}`);
    else {
      await deleteBranch(deps, slug, b);
      out(`  deleted ${b}`);
    }
  }
  out(options.dryRun ? `${slug}: ${done.length} to delete (dry run: nothing deleted).` : `✔ ${slug}: deleted ${done.length}.`);
  return 0;
}
