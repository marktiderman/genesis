/**
 * `genesis agents --rules`: the rules of engagement (docs/agents/RULES.md) that a script can
 * check from the repository alone. Each check is the rule's whole definition here; once one
 * exists, its line leaves RULES.md's "Proposed checks".
 *
 * - **first-version**: a public package that has never been released (no CHANGELOG.md) is at
 *   its hand-set first version, `0.1.0`, and no changeset bumps it past a patch, so the owner's
 *   first publish by hand and `npm trust` come before the version pull request.
 * - **batch-ci**: a workflow that runs on pull requests into `main` also runs on pull requests
 *   into the staging batches, so a batch's failures show on the pull request that caused them.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

export interface AgentRulesOptions {
  /** Branch pattern the batches use in workflow filters. Default `staging/**`. */
  batch?: string;
}

/** One broken rule: its id and what to fix, with the file. */
export interface AgentRuleProblem {
  rule: "first-version" | "batch-ci";
  message: string;
}

const FIRST_VERSION = "0.1.0";

/** Packages each `.changeset/*.md` bumps, with the bump. */
function changesetBumps(root: string): Map<string, { file: string; bump: string }[]> {
  const dir = path.join(root, ".changeset");
  const bumps = new Map<string, { file: string; bump: string }[]>();
  if (!existsSync(dir)) return bumps;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const text = readFileSync(path.join(dir, name), "utf8");
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
    for (const line of front.split(/\r?\n/)) {
      const m = /^\s*["']?([^"':]+)["']?\s*:\s*(major|minor|patch)\s*$/.exec(line);
      if (!m) continue;
      const list = bumps.get(m[1]!) ?? [];
      list.push({ file: `.changeset/${name}`, bump: m[2]! });
      bumps.set(m[1]!, list);
    }
  }
  return bumps;
}

function firstVersionProblems(root: string): AgentRuleProblem[] {
  const packagesDir = path.join(root, "packages");
  if (!existsSync(packagesDir)) return [];
  const bumps = changesetBumps(root);
  const problems: AgentRuleProblem[] = [];
  for (const dir of readdirSync(packagesDir)) {
    const file = path.join(packagesDir, dir, "package.json");
    if (!existsSync(file) || existsSync(path.join(packagesDir, dir, "CHANGELOG.md"))) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version?: string; private?: boolean };
    if (pkg.private || !pkg.name) continue;
    if (pkg.version !== FIRST_VERSION) {
      problems.push({ rule: "first-version", message: `packages/${dir}: ${pkg.name} has never been released, so it starts at ${FIRST_VERSION}, not ${pkg.version ?? "no version"}` });
    }
    for (const b of bumps.get(pkg.name) ?? []) {
      if (b.bump !== "patch") problems.push({ rule: "first-version", message: `${b.file}: ${pkg.name} is new, so its first changeset is a patch (${FIRST_VERSION} by hand, then CI publishes the next), not a ${b.bump}` });
    }
  }
  return problems;
}

/** A YAML line without its comment (a `#` after a space, outside quotes). */
function uncomment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, "$2");

/**
 * The branch list of a workflow's `pull_request` (or `pull_request_target`) trigger, when it
 * filters by branch. Reads the two YAML forms workflows use, an inline `[a, b]` and a `- a`
 * list, with comments; enough for `on:` blocks, not a YAML parser.
 */
export function pullRequestBranches(workflow: string): string[] | undefined {
  const lines = workflow.split(/\r?\n/).map(uncomment);
  const start = lines.findIndex((l) => /^\s*pull_request(_target)?:\s*$/.test(l));
  if (start < 0) return undefined;
  const base = indentOf(lines[start]!);
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (indentOf(line) <= base) return undefined;
    const m = /^(\s*)branches:\s*(.*)$/.exec(line);
    if (!m) continue;
    const inline = /^\[(.*)\]$/.exec(m[2]!);
    if (inline) return inline[1]!.split(",").map(unquote).filter(Boolean);
    const at = m[1]!.length;
    const out: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const item = lines[j]!;
      if (!item.trim()) continue;
      const dash = /^(\s*)-\s*(.*)$/.exec(item);
      if (!dash || dash[1]!.length < at) break;
      out.push(unquote(dash[2]!));
    }
    return out;
  }
  return undefined;
}

function batchCiProblems(root: string, batch: string): AgentRuleProblem[] {
  const dir = path.join(root, ".github", "workflows");
  if (!existsSync(dir)) return [];
  const problems: AgentRuleProblem[] = [];
  for (const name of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const branches = pullRequestBranches(readFileSync(path.join(dir, name), "utf8"));
    if (branches?.includes("main") && !branches.includes(batch)) {
      problems.push({ rule: "batch-ci", message: `.github/workflows/${name}: runs on pull requests into main but not into ${batch}; add it to pull_request.branches` });
    }
  }
  return problems;
}

/** Every checkable rule of engagement that the repository at `root` breaks. */
export function checkAgentRules(root: string, options: AgentRulesOptions = {}): AgentRuleProblem[] {
  return [...firstVersionProblems(root), ...batchCiProblems(root, options.batch ?? "staging/**")];
}
