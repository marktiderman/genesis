/**
 * `repo-protection`: the app's GitHub repository against Genesis's branch-protection standard
 * (src/repo/spec.ts): a missing ruleset, a rule or a required check it lacks, a check that can never
 * report, rebase merging on. Each difference is a warning; `genesis repo protect --dry-run` shows
 * the change and `genesis repo protect` makes it.
 *
 * It reads GitHub through `gh`, so it runs only with the network on (not `--offline`, never in the
 * Vite plugin) and only in a repository with workflows. When GitHub can't be read (gh not signed
 * in, no admin read of the rulesets) it says so in one info finding, and nothing in CI.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import type { ToolRunner } from "../exec/run.js";
import { planRepo } from "../repo/index.js";
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
    const top = gitTop(ctx.root);
    if (!top || !existsSync(path.join(top, ".github", "workflows"))) return;
    let result;
    try {
      result = await planRepo({ root: ctx.root, ...(deps.run ? { run: deps.run } : {}) });
    } catch (err) {
      if (deps.ci ?? Boolean(process.env.CI)) return;
      ctx.report({ rule: REPO_PROTECTION_RULE, level: "info", file: FILE, message: `branch protection not checked: ${(err as Error).message}` });
      return;
    }
    const fix = "genesis repo protect --dry-run shows the change; genesis repo protect makes it";
    for (const c of result.plan.changes) {
      const said = c.kind === "add" ? `lacks ${c.what}` : c.kind === "remove" ? `requires ${c.what}, which it shouldn't` : `differs from the Genesis standard: ${c.what}`;
      ctx.report({ rule: REPO_PROTECTION_RULE, level: "warn", file: FILE, subject: `${c.scope}: ${c.what}`, message: `${result.plan.slug} ${c.scope} ${said}${c.why ? ` (${c.why})` : ""}; ${fix}` });
    }
  };
}
