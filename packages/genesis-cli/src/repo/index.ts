/**
 * `genesis repo protect` and `genesis repo prune-staging`: the app's repository on Genesis's
 * branch-protection standard (./spec.ts), with the required checks read from its own CI
 * (./checks.ts) or named in genesis.config.json's `repo` block. The wizard's
 * `github.branch-protection` step and the doctor's `repo-protection` rule use the same plan.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { readGenesisConfig, type GenesisRepo } from "../doctor/config.js";
import { runTool, type ToolRunner } from "../exec/run.js";
import { checksFromWorkflows, type WorkflowFile } from "./checks.js";
import { aheadBy, applyWrite, deleteBranch, GitHubError, isSlug, openPulls, readLive, remoteWorkflows, resolveRepo, stagingBranches, workflowsAt, type GitHubDeps } from "./github.js";
import { formatPlan, matchRuleset, planProtection, protectionSpec, STAGING_REF, STAGING_RULESET, type ConditionalCheck, type LiveRepo, type ProtectionPlan } from "./spec.js";

export * from "./spec.js";
export { checksFromWorkflows, branchMatches, branchPattern, type DerivedChecks, type WorkflowFile } from "./checks.js";
export { GitHubError, slugFromRemote } from "./github.js";

/** A staging batch: `staging/<YYYY-MM-DD>/<letter>` (AGENTS.md, "One staging batch at a time"). */
const BATCH = /^staging\/(\d{4}-\d{2}-\d{2})\/([a-z]+)$/;

/** Oldest first: by date, then letter (`z` before `aa`). */
export function compareBatches(a: string, b: string): number {
  const x = BATCH.exec(a)!;
  const y = BATCH.exec(b)!;
  return x[1]!.localeCompare(y[1]!) || x[2]!.length - y[2]!.length || x[2]!.localeCompare(y[2]!);
}

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

/**
 * The workflows the checks are read from: the default branch's, through GitHub (what runs on a pull
 * request into it), never a checkout that may be stale or on another branch. Only when GitHub
 * can't be read are the local files used, and `local` says so, naming the ref they came from.
 */
export async function workflowsFor(deps: GitHubDeps, slug: string, branch: string, top: string): Promise<{ files: WorkflowFile[]; local: string | null }> {
  try {
    return { files: await workflowsAt(deps, slug, branch), local: null };
  } catch (err) {
    const head = await deps.run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: top, timeoutMs: 10_000 }).catch(() => null);
    const ref = head && head.code === 0 ? head.stdout.trim() : "an unknown ref";
    return { files: workflowFiles(top), local: `the workflows on ${branch} couldn't be read from GitHub (${(err as Error).message}), so the checks come from the local checkout at ${ref}, which may differ from ${branch}` };
  }
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
  const { files, local } = await workflowsFor(deps, slug, live.defaultBranch, top);
  const remote = remoteWorkflows(deps);
  const onDefault = await checksFromWorkflows(files, live.defaultBranch, remote);
  const stagingSpec = { name: STAGING_RULESET, target: "branch", enforcement: "active", conditions: { ref_name: { include: [STAGING_REF], exclude: [] } }, rules: [], bypass_actors: [] };
  const staging = config.staging ?? (matchRuleset(stagingSpec, live.rulesets) !== undefined || (await stagingBranches(deps, slug).catch(() => [])).length > 0);
  const onStaging = staging ? await checksFromWorkflows(files, SAMPLE_BATCH, remote) : null;
  const defaultChecks = config.requiredChecks ?? onDefault.required;
  const stagingChecks = staging ? (config.stagingChecks ?? onStaging!.required) : null;
  // A check repo.requiredChecks or stagingChecks names is required as named: the config wins, with a note.
  const named = new Set([...(config.requiredChecks ?? []), ...(config.stagingChecks ?? [])]);
  const found: ConditionalCheck[] = [...onDefault.conditional, ...(onStaging?.conditional ?? [])].filter((c, i, all) => all.findIndex((x) => x.context === c.context) === i);
  const conditional = found.filter((c) => !named.has(c.context));
  const overridden = found.filter((c) => named.has(c.context)).map((c) => `"${c.context}" is required because genesis.config.json repo names it, though ${c.why}`);
  const exact = [...(config.requiredChecks ? ["default"] : []), ...(config.stagingChecks ? [STAGING_RULESET] : [])];
  const spec = protectionSpec({ defaultChecks, stagingChecks });
  const plan = planProtection(spec, live, { conditional, exact });
  const notes = [...new Set([...onDefault.notes, ...(onStaging?.notes ?? []), ...overridden])];
  if (local) notes.push(local);
  if (!files.length) notes.push(`no workflows on ${live.defaultBranch}${local ? ` (nor in ${path.join(top, ".github/workflows")})` : ""}: no required checks were read (name them in repo.requiredChecks)`);
  if (!defaultChecks.includes("Adversarial review")) notes.push(`no "Adversarial review" check on ${live.defaultBranch}: the review gate (review-gate.yml) isn't in this repository`);
  plan.notes.push(...notes);
  return { plan, live, staging, defaultChecks, stagingChecks };
}

/** A short digest of a plan's writes: what a person approved, so a changed repository is noticed. */
export function planDigest(plan: ProtectionPlan): string {
  return createHash("sha256").update(JSON.stringify({ slug: plan.slug, writes: plan.writes })).digest("hex").slice(0, 12);
}

/**
 * Make the plan's writes, in order. Returns what was written. When one fails, the error says which
 * writes already landed, so nothing is left unsaid.
 */
export async function applyRepoPlan(options: RepoOptions, plan: ProtectionPlan): Promise<string[]> {
  const { deps } = await locate({ ...options, repo: plan.slug });
  const done: string[] = [];
  for (const w of plan.writes) {
    try {
      await applyWrite(deps, w);
    } catch (err) {
      throw new GitHubError(`${(err as Error).message}. ${done.length ? `Already written: ${done.join(", ")}` : "Nothing was written"}; run genesis repo protect --dry-run to see what is left.`);
    }
    done.push(`${w.method} ${w.path}`);
  }
  return done;
}

/**
 * Apply the plan a person approved, by its {@link planDigest}: the repository is read again, and
 * if the writes it needs now differ from the approved ones, nothing is written.
 */
export async function applyApprovedPlan(options: RepoOptions, digest: string): Promise<string[]> {
  const { plan } = await planRepo(options);
  if (planDigest(plan) !== digest) throw new GitHubError(`The repository changed since the plan was approved (plan ${digest}, now ${planDigest(plan)}): nothing was written. Plan it again.`);
  return applyRepoPlan(options, plan);
}

/** The one-line summary a fix or a wizard step shows, ending with the plan's digest. */
export function planSummary(plan: ProtectionPlan): string {
  const said = plan.changes.length ? `${plan.slug}: ${plan.changes.map((c) => `${c.scope} ${c.kind} ${c.what}`).join("; ")}` : `${plan.slug} already matches the Genesis standard`;
  return `${said} (plan ${planDigest(plan)})`;
}

/** The digest at the end of a {@link planSummary}, or null. */
export function digestOf(summary: string): string | null {
  return /\(plan ([0-9a-f]{12})\)$/.exec(summary)?.[1] ?? null;
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
 * first pull request yet). A staging branch of another name is kept: it has a reason of its own.
 * Deleting goes through the staging ruleset's admin bypass: no rule is turned off.
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
  const dated = branches.filter((b) => BATCH.test(b)).sort(compareBatches);
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
  // Checked in a dry run too, so it never lists deletions the real run would refuse.
  const guard = live.rulesets.find((r) => r.conditions?.ref_name?.include?.some((i) => i.includes("staging")) && r.rules?.some((x) => x.type === "deletion"));
  if (guard && guard.current_user_can_bypass === "never") {
    for (const b of done) out(`  ${options.dryRun ? "would fail" : "can't delete"} ${b}: no bypass`);
    out(`✗ Ruleset "${guard.name}" blocks deleting staging branches and this account can't bypass it. genesis repo protect gives the repository's admin role the bypass on staging batches; run this as an admin.`);
    return 1;
  }
  const deleted: string[] = [];
  for (const b of done) {
    if (options.dryRun) {
      out(`  would delete ${b}: merged into ${live.defaultBranch}`);
      continue;
    }
    try {
      await deleteBranch(deps, slug, b);
    } catch (err) {
      out(`✗ ${(err as Error).message}. ${deleted.length ? `Already deleted: ${deleted.join(", ")}` : "Nothing was deleted"}.`);
      return 1;
    }
    deleted.push(b);
    out(`  deleted ${b}`);
  }
  out(options.dryRun ? `${slug}: ${done.length} to delete (dry run: nothing deleted).` : `✔ ${slug}: deleted ${deleted.length}.`);
  return 0;
}
