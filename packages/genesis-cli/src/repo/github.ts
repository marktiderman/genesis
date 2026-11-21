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

/**
 * `owner/name` from a GitHub remote, or null: `https://github.com/o/n(.git)`, `ssh://git@github.com/o/n`
 * and scp-style `git@github.com:o/n`. The host must be exactly github.com (`notgithub.com`,
 * `github.com.evil.example` are refused), so a checkout of another host never targets a GitHub repository.
 */
export function slugFromRemote(remote: string): string | null {
  const text = remote.trim();
  let host: string;
  let pathname: string;
  const scp = /^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+):(?!\/\/)(.+)$/.exec(text);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (!["https:", "ssh:", "git+ssh:", "ssh+git:"].includes(url.protocol)) return null;
    host = url.hostname;
    pathname = url.pathname.replace(/^\/+/, "");
  } else if (scp) {
    host = scp[1]!;
    pathname = scp[2]!;
  } else return null;
  if (host.toLowerCase() !== "github.com") return null;
  const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(pathname);
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
  // Pinned to github.com: GH_HOST (an Enterprise host) must never pick which repository is changed.
  const res = await deps.run("gh", ["api", "--hostname", "github.com", ...args], { cwd: deps.cwd, timeoutMs: 30_000, passEnv: TOOL_AUTH_ENV["gh"] ?? [], ...(stdin !== undefined ? { stdin } : {}) });
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
  node_id?: string;
}

/** The repository's settings and its own rulesets, in full. */
export async function readLive(deps: GitHubDeps, slug: string): Promise<LiveRepo> {
  const repo = await ghJson<RepoAnswer>(deps, [`repos/${slug}`]);
  const list = await ghJson<Array<{ id: number; source_type?: string; source?: string; target?: string }>>(deps, [`repos/${slug}/rulesets?includes_parents=false&per_page=100`]);
  const own = list.filter((r) => (r.source_type ?? "Repository") === "Repository" && (r.target ?? "branch") === "branch");
  const rulesets = await Promise.all(own.map((r) => ghJson<Ruleset>(deps, [`repos/${slug}/rulesets/${r.id}`])));
  const settings: Partial<MergeSettings> = {};
  for (const key of ["delete_branch_on_merge", "allow_auto_merge", "allow_rebase_merge", "allow_merge_commit", "allow_squash_merge"] as const) if (typeof repo[key] === "boolean") settings[key] = repo[key];
  return { slug, defaultBranch: repo.default_branch ?? "main", settings, rulesets, ...(repo.node_id ? { nodeId: repo.node_id } : {}) };
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

/**
 * The repository's workflow files at `ref` (its default branch), read through the contents API:
 * what GitHub runs, not what a local checkout holds. Throws when they can't be read.
 */
export async function workflowsAt(deps: GitHubDeps, slug: string, ref: string): Promise<Array<{ path: string; text: string }>> {
  const q = `?ref=${encodeURIComponent(ref)}`;
  const files = await workflowListing(deps, slug, ref);
  return Promise.all(files.map(async (f) => ({ path: `.github/workflows/${f.name}`, text: await gh(deps, ["-H", "Accept: application/vnd.github.raw+json", `repos/${slug}/contents/.github/workflows/${f.name}${q}`]) })));
}

/** A ruleset as it is now (for the re-read before a PUT). */
export async function readRuleset(deps: GitHubDeps, slug: string, id: number): Promise<Ruleset> {
  return ghJson<Ruleset>(deps, [`repos/${slug}/rulesets/${id}`]);
}

type Listing = Array<{ type?: string; name?: string; sha?: string }>;

/**
 * The workflow files at `ref`, by name and blob sha (one call). A 404 means "no workflows" only
 * when a read the token can make shows `.github/workflows` really isn't there (the folders above
 * list without it); GitHub also answers 404 for a private path the token can't read, and that is
 * unknown, so it throws and the caller's fallback or refusal applies.
 */
export async function workflowListing(deps: GitHubDeps, slug: string, ref: string): Promise<Array<{ name: string; sha: string }>> {
  const q = `?ref=${encodeURIComponent(ref)}`;
  let list: Listing;
  try {
    list = await ghJson(deps, [`repos/${slug}/contents/.github/workflows${q}`]);
  } catch (err) {
    if (!/\b404\b|Not Found/.test((err as Error).message)) throw err;
    const absent = async (folder: string, name: string) => {
      const above = await ghJson<Listing>(deps, [`repos/${slug}/contents${folder}${q}`]).catch(() => null);
      return Array.isArray(above) && !above.some((e) => e.name === name && e.type === "dir");
    };
    if ((await absent("", ".github")) || (await absent("/.github", "workflows"))) return [];
    throw err;
  }
  if (!Array.isArray(list)) throw new GitHubError(`repos/${slug}/contents/.github/workflows isn't a folder`);
  return list
    .filter((f) => f.type === "file" && typeof f.name === "string" && /^[A-Za-z0-9._-]+\.ya?ml$/.test(f.name))
    .map((f) => ({ name: f.name!, sha: f.sha ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
      // owner/name are case-insensitive on GitHub: `ACME/sample-app` is `acme/sample-app`.
      return { base: p.base ?? "", head: (p.repo ?? "").toLowerCase() === slug.toLowerCase() ? (p.head ?? "") : "" };
    });
}

const OID = /^[0-9a-f]{40}$/;

/** The commit a branch points at now. */
export async function branchTip(deps: GitHubDeps, slug: string, branch: string): Promise<string> {
  const ref = await ghJson<{ object?: { sha?: string } }>(deps, [`repos/${slug}/git/ref/heads/${branch}`]);
  const sha = ref.object?.sha ?? "";
  if (!OID.test(sha)) throw new GitHubError(`couldn't read where ${branch} points`);
  return sha;
}

/** How many commits `head` (a branch or a commit) has that `base` doesn't. */
export async function aheadBy(deps: GitHubDeps, slug: string, base: string, head: string): Promise<number> {
  const cmp = await ghJson<{ ahead_by?: number }>(deps, [`repos/${slug}/compare/${base}...${head}`]);
  if (typeof cmp.ahead_by !== "number") throw new GitHubError(`couldn't compare ${head} with ${base}`);
  return cmp.ahead_by;
}

/** Typed as GitHub's schema has them: `RefUpdate.name` is a `GitRefname!`, the oids `GitObjectID`. */
export const DELETE_IF_AT = "mutation($repo: ID!, $name: GitRefname!, $before: GitObjectID!) { updateRefs(input: { repositoryId: $repo, refUpdates: [{ name: $name, beforeOid: $before, afterOid: \"0000000000000000000000000000000000000000\", force: true }] }) { clientMutationId } }";

/**
 * Delete `branch` only if it still points at `tip`: GraphQL `updateRefs` checks `beforeOid` and
 * deletes in one atomic step, so a commit pushed after the merge check makes the delete fail
 * instead of losing that commit. (The REST delete takes no expected commit.)
 */
export async function deleteBranchAt(deps: GitHubDeps, repositoryId: string, branch: string, tip: string): Promise<void> {
  if (!OID.test(tip)) throw new GitHubError(`${branch}: not a commit id: ${tip.slice(0, 40)}`);
  const res = await deps.run("gh", ["api", "--hostname", "github.com", "graphql", "-f", `query=${DELETE_IF_AT}`, "-f", `repo=${repositoryId}`, "-f", `name=refs/heads/${branch}`, "-f", `before=${tip}`], { cwd: deps.cwd, timeoutMs: 30_000, passEnv: TOOL_AUTH_ENV["gh"] ?? [] });
  let errors: unknown = null;
  try {
    errors = (JSON.parse(res.stdout || "{}") as { errors?: unknown }).errors ?? null;
  } catch {
    /* not JSON */
  }
  if (res.code !== 0 || errors) {
    const said = Array.isArray(errors) ? errors.map((e) => (e as { message?: string }).message).join("; ") : (res.stderr.trim().split("\n")[0] ?? `exit ${res.code}`);
    throw new GitHubError(`deleting ${branch} at ${tip.slice(0, 12)} failed: ${said} (it may have moved since it was checked; nothing else was deleted with it)`);
  }
}
