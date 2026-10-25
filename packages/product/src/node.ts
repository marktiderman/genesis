import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { type CatalogFeature, type Importance, type Signal, type SignalKind, type SignalSource } from "./model";

export * from "./index";

/**
 * The catalog from a `features.json` (what `genesis features build` writes),
 * whose `features` is an object keyed by id or an array.
 *
 * @stability Experimental
 */
export function parseCatalog(json: string): CatalogFeature[] {
  const data = JSON.parse(json) as { features?: unknown };
  const raw = data.features;
  const entries = Array.isArray(raw) ? raw : Object.entries((raw ?? {}) as Record<string, object>).map(([id, f]) => ({ id, ...f }));
  return entries as CatalogFeature[];
}

/** The catalog in a file. @stability Experimental */
export function readCatalog(file = "features.json"): CatalogFeature[] {
  return parseCatalog(readFileSync(file, "utf8"));
}

const git = (args: string[], cwd: string) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/**
 * The catalog at a git ref (a tag, a branch or a commit). `[]` only when the
 * ref exists and the file didn't exist at it yet; a ref that doesn't exist, or
 * a file that can't be read at it, throws, so a typo never reads as
 * "everything is new". `file` is a path relative to the repo root.
 *
 * @stability Experimental
 */
export function catalogAt(ref: string, file = "features.json", cwd = process.cwd()): CatalogFeature[] {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
  } catch {
    throw new Error(`"${ref}" is not a commit, tag or branch here.`);
  }
  // git reads paths from the repo root: an absolute path is made relative to it.
  const path = isAbsolute(file) ? relative(git(["rev-parse", "--show-toplevel"], cwd).trim(), file) : file;
  if (path.startsWith("..")) throw new Error(`${file} is outside the repo.`);
  try {
    git(["cat-file", "-e", `${ref}:${path}`], cwd);
  } catch {
    // The ref exists and has no such file: a release from before the registry.
    return [];
  }
  return parseCatalog(git(["show", `${ref}:${path}`], cwd));
}

/** `owner/repo` from the `origin` remote, or `undefined`. @stability Experimental */
export function repoFromGit(cwd = process.cwd()): string | undefined {
  try {
    const url = git(["remote", "get-url", "origin"], cwd).trim();
    return /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/i.exec(url)?.[1];
  } catch {
    return undefined;
  }
}

/** The GitHub issue fields the source reads. */
export interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  user?: { login: string; type?: string } | null;
  labels: ReadonlyArray<string | { name?: string }>;
  reactions?: { "+1"?: number };
  pull_request?: unknown;
}

const IMPORTANCE: Record<string, Importance> = { low: 1, medium: 2, high: 3, "nice-to-have": 1, important: 2, critical: 3 };
const TITLE_KIND = /^\s*\[(idea|feedback|bug)\]/i;
const FEATURE_ID = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

/**
 * One issue as a signal, or `null` when it isn't intake. An issue is intake when
 * it carries an `idea`, `feedback` or `bug` label, or its title starts with
 * `[Idea]`, `[Feedback]` or `[Bug]` (the issue forms set both).
 *
 * Only a `feature:<id>` label links it to a feature, because only triagers can
 * add labels. The id under the form's `### Feature` heading is the sender's own
 * and stays a suggestion. `importance:high|medium|low` sets its weight. `votes`
 * here is GitHub's raw 👍 count; {@link githubSignals} replaces it with the
 * people who voted, not counting the author or bots, for linked open issues.
 *
 * @stability Experimental
 */
export function issueToSignal(issue: GitHubIssue): Signal | null {
  if (issue.pull_request) return null;
  const labels = issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).map((l) => l.toLowerCase());
  // A problem report wins over an idea, so an issue labelled both is never closed as shipped.
  const kind = ((["bug", "feedback", "idea"] as const).find((k) => labels.includes(k)) ?? TITLE_KIND.exec(issue.title)?.[1]?.toLowerCase()) as
    | SignalKind
    | undefined;
  if (!kind) return null;
  const fromLabel = labels.find((l) => l.startsWith("feature:"))?.slice("feature:".length).trim();
  const fromBody = /^###\s*Feature\s*\n+\s*`?([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*)`?\s*$/im.exec(issue.body ?? "")?.[1];
  const level = labels.find((l) => l.startsWith("importance:"))?.slice("importance:".length).trim();
  return {
    id: `github#${issue.number}`,
    kind,
    title: issue.title.replace(TITLE_KIND, "").trim(),
    url: issue.html_url,
    featureId: fromLabel && FEATURE_ID.test(fromLabel) ? fromLabel : undefined,
    suggestedFeatureId: fromBody,
    author: issue.user?.login,
    votes: issue.reactions?.["+1"] ?? 0,
    importance: level ? IMPORTANCE[level] : undefined,
    state: issue.state,
    createdAt: issue.created_at,
  };
}

/** Options for {@link githubSignals} and the issue writers. @stability Experimental */
export interface GitHubOptions {
  /** `owner/repo`. */
  repo: string;
  /** A token: optional for reading a public repo, required for writing. */
  token?: string;
  /** Pages of 100 to read at most before giving up loudly. Default 50. */
  maxPages?: number;
  fetch?: typeof fetch;
}

/** Tokens GitHub refused this run, so the warning prints once. */
const refused = new Set<string>();

async function request(options: GitHubOptions, path: string, init?: { method: string; body: unknown }): Promise<Response> {
  const doFetch = options.fetch ?? fetch;
  const url = path.startsWith("https://") ? path : `https://api.github.com/repos/${options.repo}${path}`;
  const send = (token: string | undefined) =>
    doFetch(url, {
      method: init?.method ?? "GET",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init ? { "content-type": "application/json" } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
    });
  let res = await send(refused.has(options.token ?? "") ? undefined : options.token);
  // A rejected token shouldn't stop a read of a public repo: say so once and read without it.
  if (res.status === 401 && options.token && !init && !refused.has(options.token)) {
    refused.add(options.token);
    console.error("GitHub refused the token (401); reading without it.");
    res = await send(undefined);
  }
  if (!res.ok) throw new Error(`GitHub ${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res;
}

async function github(options: GitHubOptions, path: string, init?: { method: string; body: unknown }): Promise<unknown> {
  return (await request(options, path, init)).json();
}

/** Every page of a list, following `Link: rel="next"`; throws when it reaches `maxPages`. */
async function all<T>(options: GitHubOptions, path: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | undefined = path;
  for (let page = 0; next; page++) {
    if (page >= (options.maxPages ?? 50)) throw new Error(`GitHub ${path}: stopped after ${page} pages; raise maxPages.`);
    const res = await request(options, next);
    items.push(...((await res.json()) as T[]));
    next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1];
  }
  return items;
}

/**
 * Signals from a repo's open issues. For each linked one, votes are the
 * distinct people who gave it a 👍, not counting its author or bots.
 *
 * @stability Experimental
 */
export function githubSignals(options: GitHubOptions): SignalSource {
  return {
    async list() {
      const issues = await all<GitHubIssue>(options, `/issues?state=open&per_page=100`);
      const signals: Signal[] = [];
      for (const issue of issues) {
        const signal = issueToSignal(issue);
        if (!signal) continue;
        if (signal.featureId && signal.votes > 0) {
          const reactions = await all<{ user?: { login: string; type?: string } | null }>(
            options,
            `/issues/${issue.number}/reactions?content=%2B1&per_page=100`,
          );
          const voters = new Set(reactions.filter((r) => r.user && r.user.type !== "Bot" && r.user.login !== signal.author).map((r) => r.user!.login));
          signal.votes = voters.size;
        }
        signals.push(signal);
      }
      return signals;
    },
  };
}

/** The label that marks the board issue. No issue form applies it. @stability Experimental */
export const BOARD_LABEL = "product-board";

/** Options for {@link publishBoardIssue}. @stability Experimental */
export interface PublishBoardOptions extends GitHubOptions {
  token: string;
  /** Who writes the board: only their issue with the board label is updated. Default `github-actions[bot]`. */
  author?: string;
}

/**
 * Writes the board into the open issue labelled `product-board` that `author`
 * opened, opening one if there is none, so the board is one link away on any
 * device. Nobody else's issue is ever written, and the issue is left alone
 * when only the date would change. Returns its URL.
 *
 * @stability Experimental
 */
export async function publishBoardIssue(options: PublishBoardOptions, body: string): Promise<string> {
  const author = options.author ?? "github-actions[bot]";
  const open = await all<GitHubIssue>(options, `/issues?state=open&labels=${BOARD_LABEL}&creator=${encodeURIComponent(author)}&per_page=100`);
  const existing = open.find((i) => !i.pull_request && i.user?.login === author);
  // Leave the issue alone when only the "Generated <date>" line would change.
  const withoutDate = (text: string) => text.replace(/^Generated \S+ /m, "Generated ");
  if (existing && withoutDate(existing.body ?? "") === withoutDate(body)) return existing.html_url;
  if (existing) return ((await github(options, `/issues/${existing.number}`, { method: "PATCH", body: { body } })) as GitHubIssue).html_url;
  await ensureLabel(options, BOARD_LABEL);
  const issue = (await github(options, `/issues`, { method: "POST", body: { title: "Product board", body, labels: [BOARD_LABEL] } })) as GitHubIssue;
  // Without the label the next run couldn't find it and would open another.
  if (!labelNames(issue).includes(BOARD_LABEL)) throw new Error(`Opened ${issue.html_url}, but GitHub didn't apply the ${BOARD_LABEL} label.`);
  return issue.html_url;
}

const labelNames = (issue: GitHubIssue) => (issue.labels ?? []).map((l) => (typeof l === "string" ? l : (l.name ?? "")));

/** Creates the label when the repo doesn't have it yet. */
async function ensureLabel(options: GitHubOptions, name: string): Promise<void> {
  try {
    await request(options, `/labels/${encodeURIComponent(name)}`);
  } catch (error) {
    if (!/: 404 /.test(error instanceof Error ? error.message : "")) throw error;
    await github(options, `/labels`, { method: "POST", body: { name, color: "5319e7", description: "The product board, written by genesis-product" } });
  }
}

/**
 * Closes the loop on GitHub: closes each answered issue as completed, then
 * comments on it saying what shipped. Closing first means a rerun after a
 * failure never comments twice (the issue is no longer open). Only for
 * signals from GitHub.
 *
 * @stability Experimental
 */
export async function closeAnswered(
  options: GitHubOptions & { token: string },
  answered: readonly Signal[],
  message: (signal: Signal) => string,
): Promise<number[]> {
  const closed: number[] = [];
  for (const s of answered) {
    const number = Number(/^github#(\d+)$/.exec(s.id)?.[1]);
    if (!number) continue;
    await github(options, `/issues/${number}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } });
    closed.push(number);
    try {
      await github(options, `/issues/${number}/comments`, { method: "POST", body: { body: message(s) } });
    } catch (error) {
      // Closed but not told: a rerun skips closed issues, so say which one needs the comment by hand.
      console.error(`Closed #${number}, but couldn't comment on it (${error instanceof Error ? error.message.split("\n", 1)[0] : error}). Post the shipped note by hand.`);
    }
  }
  return closed;
}
