/**
 * Ask for a secret at a terminal without echoing it: raw mode, nothing written back but the
 * newline. The value goes straight into the caller's vault; it is never a flag, an environment
 * variable or a file.
 *
 * - **One line only.** Multi-line values (a PEM key, say) aren't supported. After Enter the prompt
 *   keeps reading until no input has arrived for the settle window: anything that does arrive (the
 *   rest of a paste) refuses the whole value, and is read and thrown away until the input is
 *   quiet, so it can't become the next prompt's answer. Input already waiting when a prompt starts
 *   (a paste that came in slower still) is thrown away and refuses that prompt too, and
 *   {@link drainInput} empties what is left before `genesis` exits, so none of it is typed into the
 *   shell. A CRLF Enter is one Enter, even split across two reads.
 * - Control, format and separator characters (C0, C1, ESC, zero-width and bidi characters such as
 *   U+200B and U+202E, U+2028 / U+2029) refuse the value, so what is stored is exactly what was
 *   meant. Backspace removes one whole character (an emoji's surrogate pair included); Ctrl-C
 *   cancels; Ctrl-D ends.
 * - stdin closing or failing refuses it. The terminal's mode is put back however the prompt ends:
 *   an answer, an error, the process exiting, or SIGINT / SIGTERM / SIGHUP from outside (put back
 *   first, then the signal is raised again so it still ends the process).
 */
export interface HiddenInput {
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  resume(): unknown;
  pause(): unknown;
  /** A paused stream's buffered input (Node streams): read and thrown away when a prompt starts. */
  read?(): unknown;
  on(event: "data", listener: (chunk: string) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  off(event: "data", listener: (chunk: string) => void): unknown;
  off(event: "end", listener: () => void): unknown;
  off(event: "error", listener: (err: Error) => void): unknown;
}

type ProcessEvent = "exit" | "SIGINT" | "SIGTERM" | "SIGHUP";

/** The process hooks the prompt uses to put the terminal back (tests pass a stand-in). */
export interface PromptProcess {
  pid: number;
  once(event: ProcessEvent, listener: () => void): unknown;
  off(event: ProcessEvent, listener: () => void): unknown;
  kill(pid: number, signal: NodeJS.Signals): unknown;
}

export class PromptError extends Error {
  override name = "PromptError";
}

export interface PromptOptions {
  input?: HiddenInput;
  output?: { write(text: string): unknown };
  process?: PromptProcess;
  /** How long the input must stay quiet after Enter before the value is taken. Default 40 ms. */
  settleMs?: number;
}

const MULTI_LINE = "multi-line values aren't supported: paste the value on one line (nothing was kept)";
const WAITING = "input was already waiting when the prompt started (the rest of a multi-line paste?); it was thrown away, and nothing was kept";
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
/** Control (C0, C1), format (zero-width, bidi, soft hyphen, BOM) and line / paragraph separator characters. */
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** Throw away a paused stream's buffered input. True when there was some. */
function discardBuffered(input: HiddenInput): boolean {
  let any = false;
  if (typeof input.read !== "function") return false;
  for (let i = 0; i < 10_000; i++) {
    const chunk = input.read();
    if (chunk === null || chunk === undefined) break;
    any = true;
  }
  return any;
}

export function promptHidden(question: string, options: PromptOptions = {}): Promise<string> {
  const input: HiddenInput = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const proc: PromptProcess = options.process ?? process;
  const settleMs = options.settleMs ?? 40;
  return new Promise((resolve, reject) => {
    output.write(question);
    const wasRaw = input.isRaw ?? false;
    let value = "";
    /** Enter was pressed: the value is complete, waiting for the input to go quiet. */
    let entered = false;
    /** The Enter was a lone "\r": a "\n" opening the next read is the rest of a CRLF. */
    let pendingLf = false;
    /** Why the value is refused, once it is: the rest of the input is drained, then this is thrown. */
    let refusal: PromptError | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const restore = () => {
      try {
        input.setRawMode?.(wasRaw);
      } catch {
        /* the terminal is gone */
      }
    };
    const handlers = new Map<(typeof SIGNALS)[number], () => void>();
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
      proc.off("exit", restore);
      for (const [signal, handler] of handlers) proc.off(signal, handler);
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
    /** Wait for the input to go quiet (each new read starts the window again), then answer. */
    const settleLater = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => finish(refusal ?? undefined), settleMs);
    };
    /** Refuse the value, but keep reading (and throwing away) until the input is quiet. */
    const refuse = (message: string) => {
      refusal ??= new PromptError(message);
      value = "";
      entered = true;
      settleLater();
    };
    const onSignal = (signal: NodeJS.Signals) => {
      finish(new PromptError(`interrupted (${signal})`));
      // Our listener kept the default from running: the terminal is restored, so raise it again.
      proc.kill(proc.pid, signal);
    };
    const onEnd = () => finish(refusal ?? new PromptError("stdin closed before the value was entered"));
    const onError = (err: Error) => finish(new PromptError(`stdin failed: ${err.message}`));
    const onData = (raw: string): void => {
      if (settled) return;
      let chunk = raw;
      if (entered) {
        if (pendingLf && chunk.startsWith("\n")) chunk = chunk.slice(1);
        pendingLf = false;
        if (chunk.length) refuse(MULTI_LINE);
        else settleLater();
        return;
      }
      for (let i = 0; i < chunk.length; ) {
        const cp = chunk.codePointAt(i)!;
        const ch = String.fromCodePoint(cp);
        i += ch.length;
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          // Enter is "\r" or "\r\n" (a CRLF may arrive split across two reads); anything after it is the rest of a paste.
          let rest = chunk.slice(i);
          if (ch === "\r" && rest.startsWith("\n")) rest = rest.slice(1);
          entered = true;
          pendingLf = ch === "\r" && chunk.slice(i) === "";
          if (rest.length) return refuse(MULTI_LINE);
          return settleLater();
        }
        if (ch === "\u0003") return finish(new PromptError("cancelled"));
        if (ch === "\u007f" || ch === "\b") {
          // One whole character: never half of an emoji's surrogate pair.
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        if (FORBIDDEN.test(ch)) return refuse("the value has a control, invisible or direction character (an arrow key, an escape sequence, or a zero-width or bidi character); nothing was kept");
        value += ch;
      }
    };

    proc.once("exit", restore);
    for (const signal of SIGNALS) {
      const handler = () => onSignal(signal);
      handlers.set(signal, handler);
      proc.once(signal, handler);
    }
    input.on("end", onEnd);
    input.on("error", onError);
    // What was already waiting is the tail of an earlier paste, never this answer.
    if (discardBuffered(input)) refuse(WAITING);
    input.on("data", onData);
    input.setRawMode?.(true);
    input.setEncoding("utf8");
    input.resume();
  });
}

/**
 * Read and throw away whatever is waiting on stdin until it has been quiet for `quietMs` (at most
 * `maxMs`), so the tail of a paste isn't typed into the shell when `genesis` exits.
 */
export function drainInput(options: { input?: HiddenInput; quietMs?: number; maxMs?: number } = {}): Promise<void> {
  const input: HiddenInput = options.input ?? process.stdin;
  const quietMs = options.quietMs ?? 40;
  const maxMs = options.maxMs ?? 1000;
  return new Promise((resolve) => {
    discardBuffered(input);
    // Raw, so a partial line the terminal still holds is read too.
    const wasRaw = input.isRaw ?? false;
    try {
      input.setRawMode?.(true);
    } catch {
      /* not a terminal */
    }
    let quiet: ReturnType<typeof setTimeout>;
    const done = () => {
      clearTimeout(quiet);
      clearTimeout(cap);
      input.off("data", onData);
      try {
        input.setRawMode?.(wasRaw);
      } catch {
        /* the terminal is gone */
      }
      input.pause();
      resolve();
    };
    const onData = () => {
      clearTimeout(quiet);
      quiet = setTimeout(done, quietMs);
    };
    const cap = setTimeout(done, maxMs);
    quiet = setTimeout(done, quietMs);
    input.on("data", onData);
    input.resume();
  });
}
