/**
 * Whether the app's EAS project is linked to a GitHub repository, asked of Expo's API. EAS
 * Workflows' push trigger needs the link: without it a merge starts no release at all, and nothing
 * in the repository shows it. So moving an app from GitHub's release trigger to EAS's (ADR 0026)
 * checks it first, and holds the move when it can't confirm it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

export type GithubLink = { state: "linked"; repository: string } | { state: "not-linked" | "unknown" | "mismatch"; why: string };

/** The `owner/name` git remote `origin` points at on GitHub, or null. */
export function originRepository(root: string): string | null {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const m = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The EAS project id: app.json `expo.extra.eas.projectId`, else the one starter.config.ts or app.config.* names. */
export function easProjectId(root: string): string | null {
  try {
    const json = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")) as { expo?: { extra?: { eas?: { projectId?: unknown } } } };
    const id = json.expo?.extra?.eas?.projectId;
    if (typeof id === "string" && UUID.test(id)) return id;
  } catch {
    // No app.json, or not JSON: look in the config code.
  }
  for (const file of ["starter.config.ts", "app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs"]) {
    const at = path.join(root, file);
    if (!existsSync(at)) continue;
    const m = /(?:easProjectId|projectId)\s*:\s*["'`]([0-9a-f-]{36})["'`]/i.exec(readFileSync(at, "utf8"));
    if (m && UUID.test(m[1]!)) return m[1]!;
  }
  return null;
}

/** How eas-cli would authenticate: EXPO_TOKEN (a robot or personal token), else `eas login`'s session. */
function authHeaders(env: NodeJS.ProcessEnv, home: string): Record<string, string> | null {
  const token = env.EXPO_TOKEN?.trim();
  if (token) return { authorization: `Bearer ${token}` };
  try {
    const state = JSON.parse(readFileSync(path.join(home, ".expo", "state.json"), "utf8")) as { auth?: { sessionSecret?: unknown } };
    if (typeof state.auth?.sessionSecret === "string" && state.auth.sessionSecret) return { "expo-session": state.auth.sessionSecret };
  } catch {
    // Not logged in.
  }
  return null;
}

const QUERY = "query GenesisGithubLink($appId: String!) { app { byId(appId: $appId) { githubRepository { metadata { githubRepoOwnerName githubRepoName } } } } }";

/** Asks Expo's GraphQL API whether the app's EAS project has a GitHub repository linked. Never throws. */
export async function checkGithubLink(root: string, options: { env?: NodeJS.ProcessEnv; home?: string; fetch?: typeof fetch; origin?: string | null } = {}): Promise<GithubLink> {
  const projectId = easProjectId(root);
  if (!projectId) return { state: "unknown", why: "the app names no EAS project id (run eas init, then set it in starter.config.ts app.easProjectId)" };
  const headers = authHeaders(options.env ?? process.env, options.home ?? homedir());
  if (!headers) return { state: "unknown", why: "no Expo login to ask with (set EXPO_TOKEN, or run eas login)" };
  try {
    const res = await (options.fetch ?? fetch)("https://api.expo.dev/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ query: QUERY, variables: { appId: projectId } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { state: "unknown", why: `Expo's API answered HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { app?: { byId?: { githubRepository?: { metadata?: { githubRepoOwnerName?: string; githubRepoName?: string } } | null } } }; errors?: { message?: string }[] };
    if (body.errors?.length) return { state: "unknown", why: `Expo's API said: ${body.errors[0]?.message ?? "an error"}` };
    const app = body.data?.app?.byId;
    if (!app) return { state: "unknown", why: `Expo's API returned no project ${projectId}` };
    const meta = app.githubRepository?.metadata;
    if (!app.githubRepository) return { state: "not-linked", why: `the EAS project ${projectId} has no GitHub repository linked` };
    const linked = meta?.githubRepoOwnerName && meta.githubRepoName ? `${meta.githubRepoOwnerName}/${meta.githubRepoName}` : null;
    // The link must be to this repository: an EAS project linked to an old fork or a template would
    // run its push trigger there, not here.
    const origin = options.origin !== undefined ? options.origin : originRepository(root);
    if (!origin) return { state: "unknown", why: `the EAS project is linked to ${linked ?? "a repository"}, but this checkout's git remote origin isn't a GitHub repository to compare it with` };
    if (!linked || linked.toLowerCase() !== origin.toLowerCase()) return { state: "mismatch", why: `the EAS project is linked to ${linked ?? "a repository it doesn't name"}, not to ${origin} (this checkout's origin): link ${origin} instead` };
    return { state: "linked", repository: linked };
  } catch (error) {
    return { state: "unknown", why: `couldn't reach Expo's API (${error instanceof Error ? error.message : String(error)})` };
  }
}

/** The steps that make the link, for a held move's message. */
export function linkSteps(appFolder: string | null): string {
  return `link the repository on expo.dev (the project's settings, GitHub: install Expo's GitHub app and pick the repository${appFolder ? `, base directory ${appFolder}` : ""}), then run this again with EXPO_TOKEN set or after eas login, so the link can be checked`;
}

export type EasEnvironmentState = { state: "present" } | { state: "absent" | "unknown"; why: string };

const ENVIRONMENTS = "query GenesisEnvironments($appId: String!) { app { byId(appId: $appId) { environmentVariableEnvironments } } }";

/** Whether the app's EAS project has the EAS environment `name` (Expo's API). Never throws; unknown holds whatever waits on it. */
export async function checkEasEnvironment(root: string, name: string, options: { env?: NodeJS.ProcessEnv; home?: string; fetch?: typeof fetch } = {}): Promise<EasEnvironmentState> {
  const projectId = easProjectId(root);
  if (!projectId) return { state: "unknown", why: "the app names no EAS project id" };
  const headers = authHeaders(options.env ?? process.env, options.home ?? homedir());
  if (!headers) return { state: "unknown", why: "no Expo login to ask with (set EXPO_TOKEN, or run eas login)" };
  try {
    const res = await (options.fetch ?? fetch)("https://api.expo.dev/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ query: ENVIRONMENTS, variables: { appId: projectId } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { state: "unknown", why: `Expo's API answered HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { app?: { byId?: { environmentVariableEnvironments?: unknown } } }; errors?: { message?: string }[] };
    if (body.errors?.length) return { state: "unknown", why: `Expo's API said: ${body.errors[0]?.message ?? "an error"}` };
    const names = body.data?.app?.byId?.environmentVariableEnvironments;
    if (!Array.isArray(names)) return { state: "unknown", why: `Expo's API returned no environments for ${projectId}` };
    return names.map((n) => String(n).toLowerCase()).includes(name.toLowerCase()) ? { state: "present" } : { state: "absent", why: `the EAS project has no environment "${name}"` };
  } catch (error) {
    return { state: "unknown", why: `couldn't reach Expo's API (${error instanceof Error ? error.message : String(error)})` };
  }
}

