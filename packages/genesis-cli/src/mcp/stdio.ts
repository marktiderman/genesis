/**
 * Over stdio the protocol owns fd 0 and fd 1. A child process started with `stdio: "inherit"`
 * would read the protocol's input and write into its output. While `genesis mcp` serves, every
 * child_process call is given a safe stdio instead: stdin ignored, stdout sent to stderr (fd 2),
 * stderr as asked. In-process fixes should never inherit stdio (fix/types.ts); this is the guard.
 */
import { createRequire, syncBuiltinESMExports } from "node:module";

type Stdio = string | number | null | undefined | object;

/** One stdio entry made safe for slot 0 (stdin) or 1 (stdout). */
function safeSlot(entry: Stdio, slot: 0 | 1): Stdio {
  const inherits = entry === "inherit" || entry === slot || entry === (slot === 0 ? process.stdin : process.stdout);
  if (!inherits) return entry;
  return slot === 0 ? "ignore" : 2;
}

/** A child_process options object whose stdio can't touch the protocol's fds. Other options are kept. */
export function safeStdio<T extends { stdio?: unknown } | undefined>(options: T): T {
  if (!options || typeof options !== "object" || !("stdio" in options) || options.stdio === undefined) return options;
  const stdio = options.stdio as Stdio | Stdio[];
  const list: Stdio[] = Array.isArray(stdio) ? [...stdio] : typeof stdio === "string" ? [stdio, stdio, stdio] : [stdio];
  if (list.length > 0) list[0] = safeSlot(list[0], 0);
  if (list.length > 1) list[1] = safeSlot(list[1], 1);
  return { ...options, stdio: list };
}

const METHODS = ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"] as const;
let installed: (() => void) | null = null;

/** The options argument's index: after (command), or (command, args) when args is an array. */
function optionsIndex(args: unknown[]): number {
  return Array.isArray(args[1]) ? 2 : 1;
}

/**
 * Patch node:child_process (the CommonJS module and the ESM named exports) so every call gets
 * {@link safeStdio}. Idempotent; returns the function that restores the originals.
 */
export function guardChildStdio(): () => void {
  if (installed) return installed;
  const cp = createRequire(import.meta.url)("node:child_process") as Record<string, (...a: unknown[]) => unknown>;
  const originals = new Map<string, (...a: unknown[]) => unknown>();
  for (const name of METHODS) {
    const original = cp[name]!;
    originals.set(name, original);
    cp[name] = function guarded(this: unknown, ...args: unknown[]) {
      const at = optionsIndex(args);
      if (args[at] && typeof args[at] === "object") args[at] = safeStdio(args[at] as { stdio?: unknown });
      return original.apply(this, args);
    };
  }
  syncBuiltinESMExports();
  installed = () => {
    for (const [name, original] of originals) cp[name] = original;
    syncBuiltinESMExports();
    installed = null;
  };
  return installed;
}
