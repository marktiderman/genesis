/**
 * A ring buffer of the last console lines, for the dump's `logs.console`.
 * `captureConsole()` wraps `console.log/info/warn/error/debug` once (the
 * originals still run), keeps the last 200 lines of 1 KB each, scrubbed as
 * they arrive, and returns the buffer and the undo.
 *
 *   const consoleLines = captureConsole();
 *   defineDiagnosticSection("logs", () => ({ console: consoleLines.lines() }))
 */
import { cutToBytes } from "./cap";
import { DIAGNOSTICS_DEFAULTS, type DiagnosticConsoleLine } from "./report";
import { scrubString, scrubValueStrict } from "./scrub";

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export interface ConsoleBuffer {
  /** Oldest first. */
  lines(): DiagnosticConsoleLine[];
  clear(): void;
  /** Put the console back as it was. */
  restore(): void;
}

export interface CaptureConsoleOptions {
  /** Default 200. */
  maxLines?: number;
  /** Default 1024. */
  maxLineBytes?: number;
  levels?: readonly ConsoleLevel[];
  /** Default the global console. */
  console?: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>>;
  now?: () => number;
}

function text(args: readonly unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      try {
        // Keys first (password, token, apiKey…), then the text: once stringified, a key is just text.
        return JSON.stringify(scrubValueStrict(arg)) ?? String(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

const MARK = Symbol.for("genesis-support.console-capture");

/** Keep the last console lines. Calling it again while a capture runs returns that capture. */
export function captureConsole(options: CaptureConsoleOptions = {}): ConsoleBuffer {
  const target = (options.console ?? (globalThis.console as unknown as Record<ConsoleLevel, (...args: unknown[]) => void>)) as Record<ConsoleLevel, ((...args: unknown[]) => void) & { [MARK]?: ConsoleBuffer }>;
  const existing = target.log?.[MARK];
  if (existing) return existing;
  const maxLines = options.maxLines ?? DIAGNOSTICS_DEFAULTS.maxConsoleLines;
  const maxBytes = options.maxLineBytes ?? DIAGNOSTICS_DEFAULTS.maxConsoleLineBytes;
  const now = options.now ?? Date.now;
  const levels = options.levels ?? (["log", "info", "warn", "error", "debug"] as const);
  let buffer: DiagnosticConsoleLine[] = [];
  const originals = new Map<ConsoleLevel, (...args: unknown[]) => void>();

  const api: ConsoleBuffer = {
    lines: () => [...buffer],
    clear: () => {
      buffer = [];
    },
    restore() {
      for (const [level, original] of originals) target[level] = original;
      originals.clear();
    },
  };

  for (const level of levels) {
    const original = target[level];
    if (typeof original !== "function") continue;
    originals.set(level, original);
    const wrapped = Object.assign(
      (...args: unknown[]) => {
        try {
          // Cut before scrubbing, so a huge line costs nothing.
          const line = cutToBytes(scrubString(cutToBytes(text(args), maxBytes * 4)), maxBytes);
          buffer.push({ at: new Date(now()).toISOString(), level, text: line });
          if (buffer.length > maxLines) buffer = buffer.slice(buffer.length - maxLines);
        } catch {
          // never break the app's own logging
        }
        original.apply(target, args);
      },
      { [MARK]: api },
    );
    target[level] = wrapped;
  }
  return api;
}
