/**
 * The secret vault: secret values held in memory, by name, for as long as one fix needs them
 * (config-layer design §9). A value is never written to disk, never put in argv, never in a plan,
 * never shown back.
 *
 * - `use(name, fn)` hands the value to `fn`, which passes it to a tool on stdin (src/exec/run.ts).
 * - `redact(text)` replaces every held value (and its JSON-escaped form, and each long line of a
 *   multi-line value) in anything shown: tool output, errors, notes, JSON. `redactingRunner` does it
 *   for a tool's output, line by line as it streams, so a value split across two chunks is still caught.
 * - `drop(name)` / `clear()` forget values: the fix engine drops a plan's secrets once it has verified.
 */
import type { RunToolOptions, ToolRunner } from "./run.js";

/** A secret's name: upper-case letters, digits and underscores, starting with a letter. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;

/** A value shorter than this couldn't be redacted without mangling ordinary text, so it is refused. */
export const MIN_SECRET_LENGTH = 4;

export const REDACTED = "[redacted]";

export class SecretError extends Error {
  override name = "SecretError";
}

export function assertSecretName(name: string): void {
  if (typeof name !== "string" || !SECRET_NAME.test(name)) throw new SecretError(`${JSON.stringify(name)} isn't a secret name (UPPER_CASE letters, digits and underscores)`);
}

export class SecretVault {
  readonly #values = new Map<string, string>();

  /** A vault holding these values (the engine's older `Record` form). */
  static from(source: SecretVault | Readonly<Record<string, string>> | undefined): SecretVault {
    if (source instanceof SecretVault) return source;
    const vault = new SecretVault();
    for (const [name, value] of Object.entries(source ?? {})) vault.set(name, value);
    return vault;
  }

  set(name: string, value: string): void {
    assertSecretName(name);
    if (typeof value !== "string" || value.trim().length < MIN_SECRET_LENGTH) throw new SecretError(`${name}: the value is empty or shorter than ${MIN_SECRET_LENGTH} characters`);
    if (value.includes("\0")) throw new SecretError(`${name}: the value has a NUL byte`);
    this.#values.set(name, value);
  }

  has(name: string): boolean {
    return this.#values.has(name);
  }

  /** The names held, sorted. Never the values. */
  names(): string[] {
    return [...this.#values.keys()].sort();
  }

  /** Pass the value to `fn` (which writes it to a tool's stdin). Throws when it isn't held. */
  async use<T>(name: string, fn: (value: string) => T | Promise<T>): Promise<T> {
    const value = this.#values.get(name);
    if (value === undefined) throw new SecretError(`${name} isn't set for this run`);
    return fn(value);
  }

  drop(name: string): void {
    this.#values.delete(name);
  }

  clear(): void {
    this.#values.clear();
  }

  /** Every string that must never be shown: each value, its JSON-escaped form, and each line of 8+ characters of a multi-line value. Longest first. */
  #needles(): string[] {
    const out = new Set<string>();
    for (const value of this.#values.values()) {
      out.add(value);
      const escaped = JSON.stringify(value).slice(1, -1);
      if (escaped !== value) out.add(escaped);
      if (/[\r\n]/.test(value)) for (const line of value.split(/\r?\n/)) if (line.trim().length >= 8) out.add(line);
    }
    return [...out].sort((a, b) => b.length - a.length);
  }

  /** The text with every held value replaced by [redacted]. */
  redact(text: string): string {
    let out = text;
    for (const needle of this.#needles()) out = out.split(needle).join(REDACTED);
    return out;
  }

  /** A deep copy of a JSON-able value with every string redacted (for --json output). */
  redactJson<T>(value: T): T {
    return JSON.parse(this.redact(JSON.stringify(value) ?? "null")) as T;
  }

  /**
   * A stream for a tool's output: chunks are held until a line ends, redacted, then passed on, so a
   * value split across two chunks is still caught. `end()` flushes the last partial line.
   */
  redactingStream(emit: (text: string) => void): { write(chunk: string): void; end(): void } {
    let pending = "";
    return {
      write: (chunk) => {
        pending += chunk;
        const cut = pending.lastIndexOf("\n");
        if (cut < 0) return;
        emit(this.redact(pending.slice(0, cut + 1)));
        pending = pending.slice(cut + 1);
      },
      end: () => {
        if (pending) emit(this.redact(pending));
        pending = "";
      },
    };
  }

  /** A runner whose output (streamed and returned) and errors are redacted against this vault. */
  redactingRunner(run: ToolRunner): ToolRunner {
    return async (tool, args, options: RunToolOptions) => {
      const streams = options.onOutput ? { stdout: this.redactingStream((t) => options.onOutput!(t, "stdout")), stderr: this.redactingStream((t) => options.onOutput!(t, "stderr")) } : null;
      try {
        const result = await run(tool, args, { ...options, ...(streams ? { onOutput: (chunk: string, stream: "stdout" | "stderr") => streams[stream].write(chunk) } : {}) });
        return { code: result.code, stdout: this.redact(result.stdout), stderr: this.redact(result.stderr) };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        e.message = this.redact(e.message);
        if (e.stack) e.stack = this.redact(e.stack);
        throw e;
      } finally {
        streams?.stdout.end();
        streams?.stderr.end();
      }
    };
  }
}
