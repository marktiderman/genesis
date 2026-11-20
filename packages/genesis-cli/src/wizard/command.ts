/**
 * `genesis setup` and `genesis init` (with no app name): start the wizard's server, print its
 * link, open the browser, and wait until it is closed (Ctrl-C) or idle for 30 minutes.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { createWizardHost, type WizardMode } from "./host.js";
import { startWizardServer } from "./server.js";

export interface WizardCommandOptions {
  mode: WizardMode;
  root: string;
  configPath?: string;
  port?: number;
  open?: boolean;
  step?: string;
  network?: boolean;
  /** `genesis init --preset/--without`: the init screens start from these. */
  initial?: { preset?: string; without?: string[] };
  out: (line: string) => void;
}

/** The built page, beside the CLI's own files (dist/wizard). */
export function wizardDir(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const dir of [path.join(here, "wizard"), path.join(here, "..", "wizard"), path.join(here, "..", "..", "dist", "wizard")]) if (existsSync(path.join(dir, "index.html"))) return dir;
  return undefined;
}

/** The browser launcher's argv for a link. */
export function launchArgs(url: string, platform: NodeJS.Platform = process.platform): [string, ...string[]] {
  return platform === "darwin" ? ["open", url] : platform === "win32" ? ["rundll32", "url.dll,FileProtocolHandler", url] : ["xdg-open", url];
}

/**
 * Open a link in the default browser: a fixed program per platform, the link as one argument, no
 * shell. The link holds a one-time launch code, never the session token: a launcher's argv can be
 * read by other users of the machine (/proc/<pid>/cmdline), and the code is spent once the page uses it.
 */
export function openBrowser(url: string): void {
  const [cmd, ...args] = launchArgs(url);
  try {
    const child = spawn(cmd, args, { shell: false, detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* the link is printed anyway */
  }
}

export async function runWizard(options: WizardCommandOptions): Promise<number> {
  let server: Awaited<ReturnType<typeof startWizardServer>> | undefined;
  const host = createWizardHost({
    mode: options.mode,
    root: options.root,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    network: options.network ?? false,
    ...(options.initial ? { initial: options.initial } : {}),
    publish: (event, data) => server?.publish(event, data),
  });
  const dir = wizardDir();
  server = await startWizardServer({ api: host, ...(dir ? { staticDir: dir } : {}), ...(options.port ? { port: options.port } : {}), ...(options.step ? { step: options.step } : {}), log: () => {} });
  // The browser launcher gets its own one-time code (its argv can be read by other users); the
  // terminal gets another. Each works once, then the page holds the session itself.
  options.out(`Genesis ${options.mode === "init" ? "init" : "setup"} is running at ${server.origin}`);
  options.out(`  Open: ${server.launchUrl()}`);
  options.out("  (a one-time link: it stops working once opened. Ctrl-C stops the wizard; it also stops after 30 minutes idle.)");
  if (options.open !== false) openBrowser(server.url);
  const stop = () => void server!.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const why = await server.closed;
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  options.out(why === "idle" ? "The wizard stopped after 30 minutes idle." : "The wizard stopped.");
  return 0;
}
