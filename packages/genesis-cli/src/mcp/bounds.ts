/**
 * What leaves the MCP server: bounded in size, and scrubbed of anything that looks like a secret
 * value. The server never reads a secret on purpose (settings name secrets, they never hold
 * them), so this is the last line: an error from a database driver, a tool's stderr or a
 * finding's message that happened to carry a credential is redacted before a client sees it.
 */
import { MAX_HIDDEN_LENGTH, MIN_SECRET_LENGTH, SecretError, SecretVault } from "../exec/secret-vault.js";

/** The most text one tool result carries. */
export const MAX_RESULT_CHARS = 60_000;
/** The most a single string field carries (a finding's message, a README cell). */
export const MAX_FIELD_CHARS = 2_000;
/** The most of one planned file's content a plan shows (its hash covers all of it). */
export const MAX_FILE_CHARS = 8_000;
/** The most of all planned files' content one plan shows. */
export const MAX_PLAN_CHARS = 30_000;
/** The most findings doctor_run lists. */
export const MAX_FINDINGS = 150;

/** Characters that can make the text a person reads differ from what it says: line and paragraph separators, bidi controls, zero-width and other invisible format characters, C0/C1 controls other than tab and newline. */
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u115F\u1160\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]/g;

/** Text with every invisible or direction-changing character shown as its code (`\u{202E}`), so a person reads what is there. */
export function showInvisible(text: string): string {
  return text.replace(INVISIBLE, (c) => `\\u{${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}}`);
}

/** A string cut to `max` characters, saying so. */
export function clip(text: string, max = MAX_FIELD_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (${text.length - max} more characters)`;
}

/** Environment variable names whose values are treated as secrets. */
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|_KEY$|^KEY_|(?:^|_)(?:PASS|PAT|SK)(?:_|$)|PASSPHRASE|_PWD$|SALT|DSN|AUTH|COOKIE|SESSION|DATABASE_URL|CONNECTION|_URL$/i;

/**
 * The values to redact: every environment variable with a secret-looking name, plus the
 * environment values of the secret names the settings catalogue declares, longest first. A value
 * under MIN_SECRET_LENGTH characters (trimmed) is left alone: it would redact ordinary words, and
 * the vault refuses it. One over MAX_HIDDEN_LENGTH can't be held, so it is an error naming the
 * variable (never the value).
 */
export function secretValues(env: Readonly<Record<string, string | undefined>>, declaredNames: readonly string[] = []): string[] {
  const out = new Set<string>();
  const take = (name: string, value: string | undefined) => {
    if (!value || value.trim().length < MIN_SECRET_LENGTH) return;
    if (value.length > MAX_HIDDEN_LENGTH) throw new SecretError(`${name} is longer than ${MAX_HIDDEN_LENGTH} characters, too long to redact: unset it or shorten it before running genesis mcp`);
    out.add(value);
  };
  for (const [name, value] of Object.entries(env)) if (SECRET_NAME.test(name)) take(name, value);
  for (const name of declaredNames) take(name, env[name]);
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * A vault holding these values (from `secretValues`) for redaction only, so MCP output is redacted
 * by the fix engine's matcher: every JSON-escaped form, and overlapping values.
 */
export function secretVault(values: readonly string[]): SecretVault {
  const vault = new SecretVault();
  for (const value of values) vault.hide(value);
  return vault;
}

/**
 * Literals that are secrets whatever variable holds them: a private key block, and the token
 * shapes of the common providers (GitHub, Slack, Stripe, OpenAI/Anthropic-style `sk-`, AWS access
 * keys, JWTs). Found in a file a plan shows, they are redacted.
 */
const SECRET_LITERALS: readonly RegExp[] = [
  // To its END line when there is one, else to the end of the header's line: an unterminated
  // header never swallows the rest of the text.
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----|[^\n]*)/g,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

/** Whether text holds a secret-shaped literal (a key block, a provider token). */
export function hasSecretLiteral(text: string): boolean {
  return SECRET_LITERALS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/** Text with each secret value, every secret-looking literal, and the password of any `scheme://user:password@` URL, redacted. */
export function scrub(text: string, vault: SecretVault): string {
  let out = vault.redact(text);
  for (const pattern of SECRET_LITERALS) out = out.replace(pattern, "[redacted]");
  return out.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@:"'`]+):([^\s/@"'`]+)@/gi, "$1$2:[redacted]@");
}

/** A value with every string in it (keys included) scrubbed: done before it becomes JSON, so no escaping hides a secret. */
export function scrubDeep(value: unknown, vault: SecretVault): unknown {
  if (typeof value === "string") return scrub(value, vault);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, vault));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [scrub(k, vault), scrubDeep(v, vault)]));
  return value;
}

/**
 * A tool's result as JSON text, within MAX_RESULT_CHARS. The tools bound their own lists first;
 * this is the backstop, and it returns valid JSON that says it was cut. Every string is scrubbed
 * before serialising, then the text once more.
 */
export function boundedJson(value: unknown, vault: SecretVault): string {
  const json = JSON.stringify(scrubDeep(value, vault), null, 2);
  let text = scrub(json, vault);
  if (text !== json) {
    // The second pass found something only the escaped form showed; its redaction may have cut an
    // escape or a quote, so the result is checked, and wrapped as a string when it isn't JSON.
    try {
      JSON.parse(text);
    } catch {
      text = JSON.stringify({ redacted: true, note: "A secret was redacted from this result, which left it unreadable as JSON; here it is as text.", text });
    }
  }
  if (text.length <= MAX_RESULT_CHARS) return text;
  return JSON.stringify({ truncated: true, note: `The result was ${text.length} characters; it is cut to ${MAX_RESULT_CHARS}. Narrow the request.`, partial: text.slice(0, MAX_RESULT_CHARS - 500) });
}

/**
 * Scrub what is written to a stream (stderr under `genesis mcp`: logs, and what in-process
 * commands print). Returns the function that restores the stream's own write. A child process
 * writing to the same fd directly isn't seen.
 */
export function scrubStream(stream: NodeJS.WriteStream, vault: SecretVault): () => void {
  const original = stream.write;
  const write = original.bind(stream) as (...a: unknown[]) => boolean;
  stream.write = ((chunk: unknown, ...rest: unknown[]) => {
    const text = typeof chunk === "string" ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : null;
    if (text === null) return write(chunk, ...rest);
    // A string chunk keeps its encoding argument; a buffer's text is written as utf8.
    return write(scrub(text, vault), ...(typeof chunk === "string" ? rest : rest.map((r) => (typeof r === "string" ? "utf8" : r))));
  }) as typeof stream.write;
  return () => {
    stream.write = original;
  };
}
