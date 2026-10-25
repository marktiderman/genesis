import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SIGNAL_KINDS, type CatalogFeature, type Importance, type Signal, type SignalKind, type SignalSource } from "./model";

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

/** The catalog at a git ref (a tag, a branch or a commit), or `[]` where the file didn't exist yet. @stability Experimental */
export function catalogAt(ref: string, file = "features.json", cwd = process.cwd()): CatalogFeature[] {
  try {
    return parseCatalog(execFileSync("git", ["show", `${ref}:${file}`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return [];
  }
}

/** `owner/repo` from the `origin` remote, or `undefined`. @stability Experimental */
export function repoFromGit(cwd = process.cwd()): string | undefined {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
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
  user?: { login: string } | null;
  labels: ReadonlyArray<string | { name?: string }>;
  reactions?: { "+1"?: number };
  pull_request?: unknown;
}

const IMPORTANCE: Record<string, Importance> = { low: 1, medium: 2, high: 3, "nice-to-have": 1, important: 2, critical: 3 };
const TITLE_KIND = /^\s*\[(idea|feedback|bug)\]/i;

/**
 * One issue as a signal, or `null` when it isn't intake. An issue is intake when
 * it carries an `idea`, `feedback` or `bug` label, or its title starts with
 * `[Idea]`, `[Feedback]` or `[Bug]` (the issue forms set both). Its feature is a
 * `feature:<id>` label or the id under a `### Feature` heading (the form's
 * field); `importance:high|medium|low` sets its weight; 👍 reactions are votes.
 *
 * @stability Experimental
 */
export function issueToSignal(issue: GitHubIssue): Signal | null {
  if (issue.pull_request) return null;
  const labels = issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).map((l) => l.toLowerCase());
  const kind = (SIGNAL_KINDS.find((k) => labels.includes(k)) ?? TITLE_KIND.exec(issue.title)?.[1]?.toLowerCase()) as SignalKind | undefined;
  if (!kind) return null;
  const fromLabel = labels.find((l) => l.startsWith("feature:"))?.slice("feature:".length).trim();
  const fromBody = /^###\s*Feature\s*\n+\s*`?([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*)`?\s*$/im.exec(issue.body ?? "")?.[1];
  const level = labels.find((l) => l.startsWith("importance:"))?.slice("importance:".length).trim();
  return {
    id: `github#${issue.number}`,
    kind,
    title: issue.title.replace(TITLE_KIND, "").trim(),
    url: issue.html_url,
    featureId: fromLabel || fromBody || undefined,
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
  /** Pages of 100 issues to read at most. Default 10. */
  maxPages?: number;
  fetch?: typeof fetch;
}

async function github(options: GitHubOptions, path: string, init?: { method: string; body: unknown }): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const send = (token: string | undefined) =>
    doFetch(`https://api.github.com/repos/${options.repo}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init ? { "content-type": "application/json" } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
    });
  let res = await send(options.token);
  // A rejected token shouldn't stop a read of a public repo: say so and read without it.
  if (res.status === 401 && options.token && !init) {
    console.error("GitHub refused the token (401); reading without it.");
    res = await send(undefined);
  }
  if (!res.ok) throw new Error(`GitHub ${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Signals from a repo's issues, open and closed.
 *
 * @stability Experimental
 */
export function githubSignals(options: GitHubOptions): SignalSource {
  return {
    async list() {
      const signals: Signal[] = [];
      for (let page = 1; page <= (options.maxPages ?? 10); page++) {
        const issues = (await github(options, `/issues?state=all&per_page=100&page=${page}`)) as GitHubIssue[];
        for (const issue of issues) {
          const signal = issueToSignal(issue);
          if (signal) signals.push(signal);
        }
        if (issues.length < 100) break;
      }
      return signals;
    },
  };
}

const BOARD_TITLE = "Product board";

/**
 * Writes the board into the repo's open issue titled "Product board", opening
 * one if there is none, so the board is one link away on any device. Returns
 * its URL.
 *
 * @stability Experimental
 */
export async function publishBoardIssue(options: GitHubOptions & { token: string }, body: string): Promise<string> {
  const open = (await github(options, `/issues?state=open&per_page=100`)) as GitHubIssue[];
  const existing = open.find((i) => !i.pull_request && i.title === BOARD_TITLE);
  const issue = (
    existing
      ? await github(options, `/issues/${existing.number}`, { method: "PATCH", body: { body } })
      : await github(options, `/issues`, { method: "POST", body: { title: BOARD_TITLE, body } })
  ) as GitHubIssue;
  return issue.html_url;
}

/**
 * Closes the loop on GitHub: a comment on each answered issue saying what
 * shipped, then closes it as completed. Only for signals from GitHub.
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
    await github(options, `/issues/${number}/comments`, { method: "POST", body: { body: message(s) } });
    await github(options, `/issues/${number}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } });
    closed.push(number);
  }
  return closed;
}
