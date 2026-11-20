/**
 * The secret vault: secret values held in memory, by name, for as long as one fix needs them
 * (config-layer design §9). A value is never written to disk, never put in argv, never in a plan,
 * never shown back.
 *
 * - `use(name, fn)` hands the value to `fn`, which passes it to a tool on stdin (src/exec/run.ts).
 * - `redact(text)` replaces every held value (and its JSON-escaped form, and each long line of a
 *   multi-line value) in anything shown: tool output, errors, notes, JSON. `redactingRunner` does it
 *   for a tool's output, line by line as it streams, so a value split across two chunks is still caught.
 * - `drop(name)` / `clear()` forget values: the fix engine drops a plan's secrets once it has
 *   verified, unless its caller still prints (then the caller clears, once, after printing).
 *
 * **Limits.** Redaction catches the value as typed and every JSON-escaped form of it: each
 * character may appear as itself, as its short escape (`\"`, `\\`, `\/`, `\n`…) or as `\uXXXX`
 * in either case (Go's JSON, which gh and supabase print, escapes `&`, `<` and `>` that way; an
 * astral character is its two escaped surrogates). It does not catch other encodings a tool might
 * print (URL-encoded, base64, hex), nor lines shorter than 8 characters of a multi-line value. A
 * value is at least 8 characters, so redacting it rarely hides ordinary text, but a short one
 * that is also a common word would be over-redacted wherever it appears. And JavaScript strings
 * can't be zeroed: a dropped value stays in the process's memory until the garbage collector
 * reuses it, so it can show up in a core dump or a heap snapshot taken while `genesis` runs.
 */
import type { RunToolOptions, ToolRunner } from "./run.js";

/** A secret's name: upper-case letters, digits and underscores, starting with a letter. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;

/** A value shorter than this couldn't be redacted without mangling ordinary text, so it is refused (no real token is this short). */
export const MIN_SECRET_LENGTH = 8;

/** A value longer than this is refused (a PEM key or a service-account JSON fits; redaction scans every output for it). */
export const MAX_SECRET_LENGTH = 65_536;

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
    if (value.length > MAX_SECRET_LENGTH) throw new SecretError(`${name}: the value is longer than ${MAX_SECRET_LENGTH} characters`);
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

  /** Every string that must never be shown: each value and each line of 8+ characters of a multi-line one. */
  #needles(): string[] {
    const out = new Set<string>();
    for (const value of this.#values.values()) {
      out.add(value);
      if (/[\r\n]/.test(value)) for (const line of value.split(/\r?\n/)) if (line.trim().length >= 8) out.add(line);
    }
    return [...out];
  }

  /**
   * The text with every held value replaced by [redacted]. No regular expression is built from a
   * value (one per value grew with it, and past ~1,500 characters threw an error that spelled the
   * value out): each needle is matched unit by unit in every JSON-escaped form, and overlapping
   * matches of different needles are redacted as one span, so no part of either shows.
   */
  redact(text: string): string {
    if (typeof text !== "string" || !text) return text;
    const needles = this.#needles();
    if (!needles.length) return text;
    let out = "";
    let last = 0;
    let spanStart = -1;
    let spanEnd = -1;
    for (let i = 0; i < text.length; i++) {
      let end = -1;
      for (const needle of needles) end = Math.max(end, matchEscaped(text, i, needle));
      if (end <= i) continue;
      if (spanStart >= 0 && i < spanEnd) {
        spanEnd = Math.max(spanEnd, end);
        continue;
      }
      if (spanStart >= 0) {
        out += text.slice(last, spanStart) + REDACTED;
        last = spanEnd;
      }
      spanStart = i;
      spanEnd = end;
    }
    if (spanStart >= 0) {
      out += text.slice(last, spanStart) + REDACTED;
      last = spanEnd;
    }
    return out + text.slice(last);
  }

  /**
   * A deep copy of a value as JSON.stringify would see it (`toJSON` honoured: a Date is its ISO
   * string), with every string leaf and object key redacted, for --json output. Numbers, booleans
   * and null are kept as they are; two keys that redact to the same text are both kept.
   */
  redactJson<T>(value: T): T {
    const walk = (input: unknown): unknown => {
      let v = input;
      if (v && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function") v = (v as { toJSON(): unknown }).toJSON();
      if (typeof v === "string") return this.redact(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
          let key = this.redact(k);
          for (let n = 2; Object.prototype.hasOwnProperty.call(out, key); n++) key = `${this.redact(k)} (${n})`;
          out[key] = walk(x);
        }
        return out;
      }
      return v;
    };
    return walk(value) as T;
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

const SHORT_ESCAPES: Readonly<Record<string, string>> = { '"': '\\"', "\\": "\\\\", "/": "\\/", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const regexEscape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Where a match of `needle` starting at `start` in `text` ends (the furthest end, when escapes make
 * several possible), or -1. Each UTF-16 unit of the needle may appear as itself, its short JSON
 * escape, or `\uXXXX` in either case: the same forms as `escapedForms`, without a regular expression.
 */
export function matchEscaped(text: string, start: number, needle: string): number {
  // Every form of a unit starts with the unit itself or a backslash.
  if (!needle || (text[start] !== needle[0] && text[start] !== "\\")) return -1;
  let positions = [start];
  for (let k = 0; k < needle.length; k++) {
    const unit = needle[k]!;
    const short = SHORT_ESCAPES[unit];
    const hex = needle.charCodeAt(k).toString(16).padStart(4, "0");
    const next = new Set<number>();
    for (const p of positions) {
      if (text[p] === unit) next.add(p + 1);
      if (short && text.startsWith(short, p)) next.add(p + short.length);
      if (text[p] === "\\" && text[p + 1] === "u" && text.slice(p + 2, p + 6).toLowerCase() === hex) next.add(p + 6);
    }
    if (!next.size) return -1;
    positions = [...next];
  }
  return Math.max(...positions);
}

/**
 * Text safe to show for an error that may hold a secret: redacted against `vault`, or, should that
 * fail for any reason, `fallback`. Never the raw text.
 */
export function safeErrorMessage(vault: SecretVault | undefined, err: unknown, fallback = "The step failed; its error isn't shown, since it may hold a secret."): string {
  try {
    const raw = err instanceof Error ? err.message : String(err);
    return vault ? vault.redact(raw) : raw;
  } catch {
    return fallback;
  }
}

/**
 * A regular expression source matching `text` with each UTF-16 unit as itself, its short JSON
 * escape, or `\uXXXX` in either case. Not used for redaction (see `matchEscaped`).
 */
export function escapedForms(text: string): string {
  let source = "";
  for (let i = 0; i < text.length; i++) {
    const unit = text[i]!;
    const hex = text.charCodeAt(i).toString(16).padStart(4, "0");
    const u = `\\\\u${[...hex].map((d) => (/[a-f]/.test(d) ? `[${d}${d.toUpperCase()}]` : d)).join("")}`;
    const short = SHORT_ESCAPES[unit];
    source += `(?:${regexEscape(unit)}${short ? `|${regexEscape(short)}` : ""}|${u})`;
  }
  return source;
}
