/**
 * `repo-protection`: the app's GitHub repository against Genesis's branch-protection standard
 * (src/repo/spec.ts): a missing ruleset, a rule or a required check it lacks, a check that can never
 * report, rebase merging on. Each difference is a warning; `genesis repo protect --dry-run` shows
 * the change and `genesis repo protect` makes it.
 *
 * It reads GitHub through `gh`, so it runs only with the network on (not `--offline`, never in the
 * Vite plugin) and only in a git repository. When GitHub can't be read (gh not signed
 * in, no admin read of the rulesets) it says so in one info finding, and nothing in CI.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import type { ToolRunner } from "../exec/run.js";
import { planRepo } from "../repo/index.js";
import { readGenesisConfig } from "./config.js";
import type { DoctorContext } from "./types.js";

export const REPO_PROTECTION_RULE = "repo-protection";
const FILE = ".github";

export interface RepoProtectionDeps {
  network?: boolean;
  run?: ToolRunner;
  ci?: boolean;
}

/** The repository's top folder, found by walking up to `.git`, or null. */
function gitTop(root: string): string | null {
  let dir = path.resolve(root);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function repoProtectionCheck(deps: RepoProtectionDeps = {}): (ctx: DoctorContext) => Promise<void> {
  return async (ctx) => {
    if (!deps.network) return;
    // Only in a git repository; whether it has workflows is the default branch's to say (the
    // planner reads them there), never the checkout's, which may be on another branch.
    if (!gitTop(ctx.root)) return;
    const problem = (() => {
      try {
        return readGenesisConfig(ctx.root)?.repoProblem;
      } catch {
        return undefined;
      }
    })();
    if (problem) {
      ctx.report({ rule: REPO_PROTECTION_RULE, level: "warn", file: "genesis.config.json", subject: "repo", message: `branch protection not checked: ${problem}` });
      return;
    }
    let result;
    try {
      result = await planRepo({ root: ctx.root, ...(deps.run ? { run: deps.run } : {}) });
    } catch (err) {
      if (deps.ci ?? Boolean(process.env.CI)) return;
      ctx.report({ rule: REPO_PROTECTION_RULE, level: "info", file: FILE, message: `branch protection not checked: ${(err as Error).message}` });
      return;
    }
    const fix = "genesis repo protect --dry-run shows the change; genesis repo protect makes it";
    // The planner's notes (a path-filtered check kept because the config names it, CI it couldn't
    // read, a refusal a real run would make) are info: said, never a change.
    for (const note of [...result.plan.notes, ...result.plan.refusals.map((r) => `a real genesis repo protect would refuse: ${r}`)]) ctx.report({ rule: REPO_PROTECTION_RULE, level: "info", file: FILE, subject: note.slice(0, 120), message: `${result.plan.slug}: ${note}` });
    for (const u of result.unknown) ctx.report({ rule: REPO_PROTECTION_RULE, level: "warn", file: FILE, subject: "unknown", message: `${result.plan.slug}: ${u}; run genesis repo protect --dry-run again when GitHub answers` });
    for (const c of result.plan.changes) {
      const said = c.kind === "add" ? `lacks ${c.what}` : c.kind === "remove" ? `requires ${c.what}, which it shouldn't` : `differs from the Genesis standard: ${c.what}`;
      ctx.report({ rule: REPO_PROTECTION_RULE, level: "warn", file: FILE, subject: `${c.scope}: ${c.what}`, message: `${result.plan.slug} ${c.scope} ${said}${c.why ? ` (${c.why})` : ""}; ${fix}` });
    }
  };
}
