/**
 * The one way the fix engine (and later the wizard's steps) runs another program: an allowlisted
 * tool, an argv array, never a shell. A value never becomes shell text, so a repo name or a branch
 * can't smuggle a second command in. Secrets reach a tool only on stdin, never in argv.
 *
 * - The tool is resolved to an absolute path from PATH here, never from the working directory:
 *   relative PATH entries, the app's own folder and any `node_modules/.bin` are skipped, so an app
 *   can't plant a `git` the fix would run.
 * - The child gets a scrubbed environment: what a CLI needs to find itself, its config, proxies and
 *   certificates, plus whatever the caller passes by name. Nothing else of the developer's
 *   environment (tokens, keys) leaks into a tool that didn't ask for it.
 * - Windows isn't supported yet: its tools are `.cmd` shims, which only run through a shell. The
 *   runner refuses there with a clear error rather than reach for one.
 */
import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import * as path from "node:path";

/** The programs a fix may run. Anything else is refused before it starts. */
export const ALLOWED_TOOLS = ["supabase", "gh", "eas", "npx", "git", "npm", "pnpm", "yarn", "bun"] as const;
export type AllowedTool = (typeof ALLOWED_TOOLS)[number];

/** What every child gets from the parent's environment. */
const BASE_ENV = [
  "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "APPDATA", "LOCALAPPDATA", "PATHEXT", "ComSpec",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "GH_CONFIG_DIR",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE",
  "npm_config_offline", "npm_config_registry",
];

export interface RunToolOptions {
  cwd: string;
  /** Written to the child's stdin, then closed. The only way a secret reaches a tool. */
  stdin?: string;
  /** More of the parent's variables to pass through, by name (`GH_TOKEN` for gh, say). */
  passEnv?: readonly string[];
  /** Variables to set in the child. */
  env?: Readonly<Record<string, string>>;
  /** Kill the child after this long. Default 10 minutes. */
  timeoutMs?: number;
}

export interface RunToolResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** The seam tests and the fix engine take: same shape as runTool. */
export type ToolRunner = (tool: AllowedTool, args: readonly string[], options: RunToolOptions) => Promise<RunToolResult>;

export class ToolRefusedError extends Error {
  override name = "ToolRefusedError";
}

export function isAllowedTool(tool: string): tool is AllowedTool {
  return (ALLOWED_TOOLS as readonly string[]).includes(tool);
}

/**
 * Fixed arguments, then `--`, then values that came from a person or a file (a branch, a repo, a
 * path): a value that starts with `-` is then never read as an option.
 */
export function withValues(fixed: readonly string[], values: readonly string[]): string[] {
  return [...fixed, "--", ...values];
}

/** The scrubbed environment for a child. */
export function childEnv(options: Pick<RunToolOptions, "passEnv" | "env">, parent: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [...BASE_ENV, ...(options.passEnv ?? [])]) {
    const value = parent[name];
    if (value !== undefined) out[name] = value;
  }
  return { ...out, ...options.env };
}

const inside = (dir: string, file: string) => {
  const rel = path.relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/**
 * The tool's absolute path from PATH, skipping relative entries, `cwd` and anything under it, and
 * every `node_modules/.bin`. Null when it isn't installed.
 */
export function resolveTool(tool: AllowedTool, cwd: string, pathVar: string | undefined = process.env.PATH, platform: NodeJS.Platform = process.platform): string | null {
  if (platform === "win32") throw new ToolRefusedError(`running ${tool} from a fix isn't supported on Windows yet (its tools are .cmd shims that need a shell); run the plan's commands yourself`);
  const app = path.resolve(cwd);
  for (const dir of (pathVar ?? "").split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    if (inside(app, dir) || dir.split(/[\\/]/).join("/").includes("node_modules/.bin")) continue;
    const file = path.join(dir, tool);
    try {
      if (!statSync(file).isFile()) continue;
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      continue;
    }
  }
  return null;
}

/** Run an allowlisted tool with an argv array, `shell: false`. Resolves with its exit code and output; never throws for a non-zero exit. */
export const runTool: ToolRunner = (tool, args, options) => {
  if (!isAllowedTool(tool)) return Promise.reject(new ToolRefusedError(`"${tool}" isn't a tool a fix may run (allowed: ${ALLOWED_TOOLS.join(", ")})`));
  for (const a of args) {
    if (typeof a !== "string" || a.includes("\0")) return Promise.reject(new ToolRefusedError(`${tool}: every argument must be a string without NUL bytes`));
  }
  let file: string | null;
  try {
    file = resolveTool(tool, options.cwd);
  } catch (err) {
    return Promise.reject(err);
  }
  if (!file) return Promise.reject(new ToolRefusedError(`${tool} isn't installed (not on PATH outside the app)`));
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      shell: false,
      env: childEnv(options),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      timeout: options.timeoutMs ?? 10 * 60_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.on("error", () => {}); // a tool that exits without reading stdin
    child.stdin.end(options.stdin ?? "");
  });
};
