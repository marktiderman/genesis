/**
 * Where secrets live, how to set one, and which are set: by name only (config-layer design §9).
 *
 * | Store (settings `store`) | Target | Set | Status |
 * |---|---|---|---|
 * | `edge` | Supabase Edge Function secrets | `supabase secrets set --env-file /dev/stdin` | `supabase secrets list -o json` |
 * | `vault` | Supabase Vault | none: the person adds it in the dashboard (Database → Vault) | `select name from vault.secrets` through `supabase db query --linked` |
 * | `ci` | GitHub Actions | `gh secret set NAME` (reads stdin) | `gh secret list --json name` |
 * | `ci` | EAS (apps with eas.json) | none: `eas env:create` has no stdin path, so the person runs it | `eas env:list <environment>` (names parsed; values discarded) |
 * | `server-env` | the app's server host | none: the person sets it there | none |
 *
 * Every command runs through the developer's own signed-in CLI, through src/exec/run.ts (argv,
 * no shell, scrubbed environment). A value only ever reaches a tool on stdin. A tool that is
 * missing or signed out is an answer ("not checked: gh isn't installed"), never a crash.
 *
 * **Why Vault is set by hand.** Writing a Vault secret means a SQL statement with the value in it
 * (`vault.create_secret('…')`). pg_stat_statements replaces a plain statement's constants with
 * `$1`, but keeps a utility statement such as `DO $$ … $$` word for word, so an upsert written
 * that way would put the value in `pg_stat_statements.query` (which Supabase shows under Query
 * Performance); and a statement that fails is written to the Postgres log as it was sent, value
 * included, whatever its kind. And `supabase db query --linked` (CLI 2.117) sends the statement
 * through the Management API, so the value would also leave the machine in a request body. So
 * the CLI never writes Vault: the plan says to add it in
 * the dashboard (Database → Vault). Only the names are read, which carries no value. The in-app
 * Settings screen will set Vault secrets server-side through a parameterised function (Phase 4).
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { PlannedCommand } from "../fix/types.js";
import { runTool, TOOL_AUTH_ENV, type ToolRunner } from "./run.js";
import { assertSecretName, SecretError } from "./secret-vault.js";

export type SecretStore = "vault" | "edge" | "server-env" | "ci";
export type SecretTarget = "edge" | "vault" | "github" | "eas" | "server-env";

/** How a planned command's stdin carries the secret: the bare value, or one dotenv line. */
export type StdinFormat = "value" | "dotenv";

/** What a finding about a target names as its `file`, and how a person reads it. */
export const TARGET_LABEL: Readonly<Record<SecretTarget, string>> = {
  edge: "supabase secrets",
  vault: "supabase vault",
  github: "gh secret",
  eas: "eas env",
  "server-env": "server environment",
};

export function targetOfLabel(label: string): SecretTarget | null {
  return (Object.entries(TARGET_LABEL).find(([, l]) => l === label)?.[0] as SecretTarget | undefined) ?? null;
}

export interface StoreOptions {
  /** The GitHub Actions environment that holds CI secrets (genesis.config.json `release.environment`); repository secrets without it. */
  githubEnvironment?: string;
  /** The EAS environment (`release.easEnvironment`, default production). */
  easEnvironment?: string;
}

const ENVIRONMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
function checkEnvironment(value: string | undefined, what: string): void {
  if (value !== undefined && !ENVIRONMENT.test(value)) throw new SecretError(`${what} ${JSON.stringify(value)} isn't an environment name`);
}

/** The targets a store's secret must be set in, for this app. */
export function targetsOf(store: SecretStore, root: string): SecretTarget[] {
  if (store === "ci") return existsSync(path.join(root, "eas.json")) ? ["github", "eas"] : ["github"];
  return [store];
}

/** The app is linked to a Supabase project (`supabase link` wrote its ref). */
export function supabaseLinked(root: string): boolean {
  return existsSync(path.join(root, "supabase", ".temp", "project-ref"));
}

/** What sets a secret in a target: a command that takes the value on stdin, or what the person runs. */
export type SetterPlan = { command: PlannedCommand & { stdinSecret: string; stdinFormat: StdinFormat } } | { manual: string };

export function setterFor(name: string, target: SecretTarget, options: StoreOptions = {}): SetterPlan {
  assertSecretName(name);
  checkEnvironment(options.githubEnvironment, "release.environment");
  checkEnvironment(options.easEnvironment, "release.easEnvironment");
  switch (target) {
    case "edge":
      return { command: { tool: "supabase", args: ["secrets", "set", "--env-file", "/dev/stdin"], stdinSecret: name, stdinFormat: "dotenv", why: `sets the Edge Function secret ${name} in the linked Supabase project (the value on stdin as one dotenv line)` } };
    case "vault":
      // Never as SQL from here: the value would be kept in pg_stat_statements and the logs (see above).
      return { manual: `Add ${name} in the Supabase dashboard: Database → Vault → Add new secret, named ${name} (the CLI never writes Vault: SQL carrying the value would be kept in pg_stat_statements)` };
    case "github":
      return {
        command: {
          tool: "gh",
          args: ["secret", "set", name, ...(options.githubEnvironment ? ["--env", options.githubEnvironment] : [])],
          stdinSecret: name,
          stdinFormat: "value",
          why: `sets the GitHub Actions secret ${name}${options.githubEnvironment ? ` in the environment ${options.githubEnvironment}` : ""} (gh reads it from stdin)`,
        },
      };
    case "eas":
      return { manual: `eas env:create --name ${name} --environment ${options.easEnvironment ?? "production"} --visibility secret  (eas has no stdin path: run it yourself; it asks for the value)` };
    case "server-env":
      return { manual: `Set ${name} in your server's environment (Vercel, Render, …); never in the repository.` };
  }
}

/** The text a command's stdin gets for a secret. Throws (before anything runs) when the value can't be carried safely that way. */
export function stdinFor(format: StdinFormat, name: string, value: string): string {
  assertSecretName(name);
  switch (format) {
    case "value":
      return value;
    case "dotenv":
      // Single quotes are literal in a dotenv file: no escapes, no ${…} expansion.
      if (/['\r\n]/.test(value)) throw new SecretError(`${name}: a value with a quote or a line break can't go through supabase secrets set on stdin; set it in the Supabase dashboard (Edge Functions → Secrets)`);
      return `${name}='${value}'\n`;
    default:
      // A format a plan names that this CLI doesn't know (Vault SQL never was one to keep): refused, never undefined.
      throw new SecretError(`${name}: no way to send it on stdin as ${JSON.stringify(format)}`);
  }
}

/** A target's set names, or why they couldn't be read. */
export type StatusResult = { ok: true; names: Set<string> } | { ok: false; reason: string };

/** The first line of a tool's complaint, for an info finding (never stdout: eas prints plaintext values there). */
function why(tool: string, result: { code: number | null; stderr: string }): string {
  const line = result.stderr.split("\n").map((l) => l.trim()).find((l) => l && !/new version|recommend updating|is now available|proceeding with outdated/i.test(l));
  return `${tool} exited ${result.code}${line ? `: ${line.slice(0, 200)}` : ""}`;
}

/** Names from `supabase secrets list -o json`: `[{ "name": …, "value": <digest> }]`. */
export function parseSupabaseSecrets(stdout: string): Set<string> {
  const rows = JSON.parse(stdout) as unknown;
  if (!Array.isArray(rows)) throw new Error("not a list");
  return new Set(rows.map((r) => (r && typeof r === "object" ? (r as { name?: unknown }).name : undefined)).filter((n): n is string => typeof n === "string"));
}

/** Names from `gh secret list --json name`. */
export function parseGhSecrets(stdout: string): Set<string> {
  return parseSupabaseSecrets(stdout);
}

/** Names from `eas env:list` (short format, `NAME=value` per line). The values are dropped here, never kept. */
export function parseEasEnv(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const m = /^\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m) names.add(m[1]!);
  }
  return names;
}

/** Names from `supabase db query -o json` of `select name from vault.secrets`: rows as a list, or `{ rows: […] }`; a table as a fallback. */
export function parseVaultNames(stdout: string): Set<string> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows) ? (parsed as { rows: unknown[] }).rows : null;
    if (rows) return new Set(rows.map((r) => (r && typeof r === "object" ? (r as { name?: unknown }).name : undefined)).filter((n): n is string => typeof n === "string"));
  } catch {
    /* a table */
  }
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const m = /^\s*\|?\s*([A-Z][A-Z0-9_]*)\s*\|?\s*$/.exec(line);
    if (m) names.add(m[1]!);
  }
  return names;
}

export const VAULT_NAMES_SQL = "select name from vault.secrets order by name;\n";

/** Read which secrets a target holds, by name, through the developer's CLI. */
export async function readSecretNames(target: SecretTarget, root: string, options: StoreOptions & { run?: ToolRunner } = {}): Promise<StatusResult> {
  const run = options.run ?? runTool;
  const attempt = async (tool: "supabase" | "gh" | "eas", args: string[], parse: (out: string) => Set<string>, stdin?: string): Promise<StatusResult> => {
    let result;
    try {
      result = await run(tool, args, { cwd: root, timeoutMs: 30_000, passEnv: TOOL_AUTH_ENV[tool], ...(stdin ? { stdin } : {}) });
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
    if (result.code !== 0) return { ok: false, reason: why(tool, result) };
    try {
      return { ok: true, names: parse(result.stdout) };
    } catch {
      return { ok: false, reason: `${tool}'s output couldn't be read` };
    }
  };
  switch (target) {
    case "edge":
      if (!supabaseLinked(root)) return { ok: false, reason: "the app isn't linked to a Supabase project (supabase link)" };
      return attempt("supabase", ["secrets", "list", "-o", "json"], parseSupabaseSecrets);
    case "vault":
      if (!supabaseLinked(root)) return { ok: false, reason: "the app isn't linked to a Supabase project (supabase link)" };
      return attempt("supabase", ["db", "query", "--linked", "-o", "json", "-f", "/dev/stdin"], parseVaultNames, VAULT_NAMES_SQL);
    case "github":
      checkEnvironment(options.githubEnvironment, "release.environment");
      return attempt("gh", ["secret", "list", "--json", "name", ...(options.githubEnvironment ? ["--env", options.githubEnvironment] : [])], parseGhSecrets);
    case "eas":
      checkEnvironment(options.easEnvironment, "release.easEnvironment");
      return attempt("eas", ["env:list", options.easEnvironment ?? "production", "--format", "short"], parseEasEnv);
    case "server-env":
      return { ok: false, reason: "a server's environment can't be read from here" };
  }
}

/** genesis.config.json's `release` names, for the CI targets. */
export function storeOptions(root: string): StoreOptions {
  try {
    const raw = JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8")) as { release?: { environment?: unknown; easEnvironment?: unknown } };
    // The release lane keeps its CI secrets in a GitHub environment (default production); without one, repository secrets.
    const env = raw.release && typeof raw.release === "object" ? (raw.release.environment ?? "production") : undefined;
    const eas = raw.release?.easEnvironment;
    return { ...(typeof env === "string" && ENVIRONMENT.test(env) ? { githubEnvironment: env } : {}), ...(typeof eas === "string" && ENVIRONMENT.test(eas) ? { easEnvironment: eas } : {}) };
  } catch {
    return {};
  }
}
