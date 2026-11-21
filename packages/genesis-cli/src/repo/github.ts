/**
 * The repository as GitHub has it, read and written through `gh` (signed in as the person, or
 * `GH_TOKEN`): its settings, its own rulesets, its staging branches, and the reusable workflows
 * its jobs call. Every call goes through the allowlisted tool runner: argv only, JSON on stdin.
 */
import { TOOL_AUTH_ENV, type ToolRunner } from "../exec/run.js";
import type { RemoteRef, RemoteWorkflowReader } from "./checks.js";
import type { LiveRepo, MergeSettings, Ruleset, Write } from "./spec.js";

export class GitHubError extends Error {
  override name = "GitHubError";
}

const SLUG = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export function isSlug(value: string): boolean {
  return SLUG.test(value) && !/\/\.\.?$/.test(value);
}

/** `owner/name` from a GitHub remote URL (https or ssh), or null. */
export function slugFromRemote(url: string): string | null {
  const m = /github\.com[:/]+([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!m) return null;
  const slug = `${m[1]}/${m[2]}`;
  return isSlug(slug) ? slug : null;
}

export interface GitHubDeps {
  run: ToolRunner;
  /** The folder the tools run in. */
  cwd: string;
}

async function gh(deps: GitHubDeps, args: string[], stdin?: string): Promise<string> {
  const res = await deps.run("gh", ["api", ...args], { cwd: deps.cwd, timeoutMs: 30_000, passEnv: TOOL_AUTH_ENV["gh"] ?? [], ...(stdin !== undefined ? { stdin } : {}) });
  if (res.code !== 0) {
    const said = (res.stderr.trim() || res.stdout.trim()).split("\n")[0] ?? "";
    const admin = /\b(403|404)\b/.test(res.stderr) && args.includes("-X") ? " (this needs the repository's admin role)" : "";
    throw new GitHubError(`gh api ${args.filter((a) => !a.startsWith("-") && a.startsWith("repos/")).at(-1) ?? ""} failed: ${said || `exit ${res.code}`}${admin}`);
  }
  return res.stdout;
}

async function ghJson<T>(deps: GitHubDeps, args: string[], stdin?: string): Promise<T> {
  const out = await gh(deps, args, stdin);
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new GitHubError(`gh api ${args.at(-1)} didn't answer with JSON`);
  }
}

/** The repository folder (git's top level) and its GitHub `owner/name`, from `origin`. */
export async function resolveRepo(run: ToolRunner, root: string): Promise<{ top: string; slug: string | null }> {
  const top = await run("git", ["rev-parse", "--show-toplevel"], { cwd: root, timeoutMs: 10_000 });
  if (top.code !== 0) throw new GitHubError(`${root} isn't in a git repository`);
  const remote = await run("git", ["remote", "get-url", "origin"], { cwd: root, timeoutMs: 10_000 });
  return { top: top.stdout.trim(), slug: remote.code === 0 ? slugFromRemote(remote.stdout) : null };
}

interface RepoAnswer extends Partial<MergeSettings> {
  default_branch?: string;
}

/** The repository's settings and its own rulesets, in full. */
export async function readLive(deps: GitHubDeps, slug: string): Promise<LiveRepo> {
  const repo = await ghJson<RepoAnswer>(deps, [`repos/${slug}`]);
  const list = await ghJson<Array<{ id: number; source_type?: string; source?: string; target?: string }>>(deps, [`repos/${slug}/rulesets?includes_parents=false&per_page=100`]);
  const own = list.filter((r) => (r.source_type ?? "Repository") === "Repository" && (r.target ?? "branch") === "branch");
  const rulesets = await Promise.all(own.map((r) => ghJson<Ruleset>(deps, [`repos/${slug}/rulesets/${r.id}`])));
  const settings: Partial<MergeSettings> = {};
  for (const key of ["delete_branch_on_merge", "allow_auto_merge", "allow_rebase_merge", "allow_merge_commit"] as const) if (typeof repo[key] === "boolean") settings[key] = repo[key];
  return { slug, defaultBranch: repo.default_branch ?? "main", settings, rulesets };
}

/** The repository's `staging/…` branch names. */
export async function stagingBranches(deps: GitHubDeps, slug: string): Promise<string[]> {
  const refs = await ghJson<Array<{ ref: string }>>(deps, [`repos/${slug}/git/matching-refs/heads/staging/`]);
  return refs.map((r) => r.ref.replace(/^refs\/heads\//, "")).filter((b) => b.startsWith("staging/"));
}

/** Reads a reusable workflow at the ref a `uses:` pins. */
export function remoteWorkflows(deps: GitHubDeps): RemoteWorkflowReader {
  return async (ref: RemoteRef) => {
    try {
      return await gh(deps, ["-H", "Accept: application/vnd.github.raw+json", `repos/${ref.owner}/${ref.repo}/contents/${ref.path}?ref=${encodeURIComponent(ref.ref)}`]);
    } catch {
      return null;
    }
  };
}

/** Make one write: the body goes on stdin. */
export async function applyWrite(deps: GitHubDeps, write: Write): Promise<void> {
  await gh(deps, ["-X", write.method, write.path, "--input", "-"], JSON.stringify(write.body));
}

export interface OpenPull {
  base: string;
  head: string;
}

/** Every open pull request, every page: one JSON line each. */
export async function openPulls(deps: GitHubDeps, slug: string): Promise<OpenPull[]> {
  const out = await gh(deps, ["--paginate", "--jq", ".[] | {base: .base.ref, head: .head.ref, repo: .head.repo.full_name} | @json", `repos/${slug}/pulls?state=open&per_page=100`]);
  return out
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const p = JSON.parse(l) as { base?: string | null; head?: string | null; repo?: string | null };
      return { base: p.base ?? "", head: p.repo === slug ? (p.head ?? "") : "" };
    });
}

/** How many commits `branch` has that `base` doesn't. */
export async function aheadBy(deps: GitHubDeps, slug: string, base: string, branch: string): Promise<number> {
  const cmp = await ghJson<{ ahead_by?: number }>(deps, [`repos/${slug}/compare/${base}...${branch}`]);
  if (typeof cmp.ahead_by !== "number") throw new GitHubError(`couldn't compare ${branch} with ${base}`);
  return cmp.ahead_by;
}

export async function deleteBranch(deps: GitHubDeps, slug: string, branch: string): Promise<void> {
  await gh(deps, ["-X", "DELETE", `repos/${slug}/git/refs/heads/${branch}`]);
}
