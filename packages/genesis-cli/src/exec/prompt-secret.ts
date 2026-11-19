/**
 * Ask for a secret at a terminal without echoing it: raw mode, nothing written back but the
 * newline. The value goes straight into the caller's vault; it is never a flag, an environment
 * variable or a file.
 *
 * - **One line only.** Multi-line values (a PEM key, say) aren't supported: anything after the
 *   Enter in the same paste, or arriving right after it, refuses the whole value rather than keep
 *   its first line or leave the rest to be read as the next answer (or typed into the shell).
 * - Control characters (C0, ESC: an arrow key, a stray escape sequence) refuse the value too, so
 *   what is stored is exactly what was meant. Backspace edits; Ctrl-C cancels; Ctrl-D ends.
 * - stdin closing or failing refuses it. The terminal's mode is put back however the prompt ends:
 *   an answer, an error, the process exiting, or SIGTERM / SIGHUP (re-raised once restored).
 */
export interface HiddenInput {
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: "data", listener: (chunk: string) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  off(event: "data", listener: (chunk: string) => void): unknown;
  off(event: "end", listener: () => void): unknown;
  off(event: "error", listener: (err: Error) => void): unknown;
}

/** The process hooks the prompt uses to put the terminal back (tests pass a stand-in). */
export interface PromptProcess {
  pid: number;
  once(event: "exit" | "SIGTERM" | "SIGHUP", listener: () => void): unknown;
  off(event: "exit" | "SIGTERM" | "SIGHUP", listener: () => void): unknown;
  kill(pid: number, signal: NodeJS.Signals): unknown;
}

export class PromptError extends Error {
  override name = "PromptError";
}

export interface PromptOptions {
  input?: HiddenInput;
  output?: { write(text: string): unknown };
  process?: PromptProcess;
  /** How long after Enter more input means a multi-line paste. Default 40 ms. */
  settleMs?: number;
}

const MULTI_LINE = "multi-line values aren't supported: paste the value on one line (nothing was kept)";

export function promptHidden(question: string, options: PromptOptions = {}): Promise<string> {
  const input: HiddenInput = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const proc: PromptProcess = options.process ?? process;
  const settleMs = options.settleMs ?? 40;
  return new Promise((resolve, reject) => {
    output.write(question);
    const wasRaw = input.isRaw ?? false;
    let value = "";
    let entered = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const restore = () => {
      try {
        input.setRawMode?.(wasRaw);
      } catch {
        /* the terminal is gone */
      }
    };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
      proc.off("exit", restore);
      proc.off("SIGTERM", onTerm);
      proc.off("SIGHUP", onHup);
      restore();
      input.pause();
    };
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write("\n");
      if (err) {
        value = "";
        reject(err);
      } else resolve(value);
    };
    const onSignal = (signal: NodeJS.Signals) => {
      finish(new PromptError(`interrupted (${signal})`));
      // Our listener kept the default from running: the terminal is restored, so raise it again.
      proc.kill(proc.pid, signal);
    };
    const onTerm = () => onSignal("SIGTERM");
    const onHup = () => onSignal("SIGHUP");
    const onEnd = () => finish(new PromptError("stdin closed before the value was entered"));
    const onError = (err: Error) => finish(new PromptError(`stdin failed: ${err.message}`));
    const onData = (chunk: string): void => {
      if (settled) return;
      if (entered) return finish(new PromptError(MULTI_LINE));
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i]!;
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          // Enter is "\r" or "\r\n"; anything after it in the same chunk is a multi-line paste.
          const rest = chunk.slice(i + 1).replace(/^\n/, ch === "\r" ? "" : "\n");
          if (rest.length) return finish(new PromptError(MULTI_LINE));
          entered = true;
          timer = setTimeout(() => finish(), settleMs);
          return;
        }
        if (ch === "\u0003") return finish(new PromptError("cancelled"));
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        const code = ch.charCodeAt(0);
        if (code < 0x20 || ch === "\u001b" || (code >= 0x80 && code < 0xa0)) return finish(new PromptError("the value has a control character (an arrow key or escape sequence?); nothing was kept"));
        value += ch;
      }
    };

    proc.once("exit", restore);
    proc.once("SIGTERM", onTerm);
    proc.once("SIGHUP", onHup);
    input.on("end", onEnd);
    input.on("error", onError);
    input.on("data", onData);
    input.setRawMode?.(true);
    input.setEncoding("utf8");
    input.resume();
  });
}
