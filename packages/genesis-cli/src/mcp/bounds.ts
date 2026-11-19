/**
 * What leaves the MCP server: bounded in size, and scrubbed of anything that looks like a secret
 * value. The server never reads a secret on purpose (settings name secrets, they never hold
 * them), so this is the last line: an error from a database driver, a tool's stderr or a
 * finding's message that happened to carry a credential is redacted before a client sees it.
 */

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

/** A string cut to `max` characters, saying so. */
export function clip(text: string, max = MAX_FIELD_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (${text.length - max} more characters)`;
}

/** Environment variable names whose values are treated as secrets. */
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|_KEY$|^KEY_|DSN|AUTH|COOKIE|SESSION|DATABASE_URL|CONNECTION|_URL$/i;

/**
 * The values to redact: every environment variable with a secret-looking name, plus the
 * environment values of the secret names the settings catalogue declares. Short values (under 8
 * characters) are left alone: they would redact ordinary words.
 */
export function secretValues(env: Readonly<Record<string, string | undefined>>, declaredNames: readonly string[] = []): string[] {
  const out = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (value && value.length >= 8 && SECRET_NAME.test(name)) out.add(value);
  }
  for (const name of declaredNames) {
    const value = env[name];
    if (value && value.length >= 8) out.add(value);
  }
  // Longest first, so a value that contains another is redacted whole.
  return [...out].sort((a, b) => b.length - a.length);
}

/** Text with each secret value, and the password of any `scheme://user:password@` URL, redacted. */
export function scrub(text: string, values: readonly string[]): string {
  let out = text;
  for (const value of values) out = out.split(value).join("[redacted]");
  return out.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@:"'`]+):([^\s/@"'`]+)@/gi, "$1$2:[redacted]@");
}

/**
 * A tool's result as JSON text, within MAX_RESULT_CHARS. The tools bound their own lists first;
 * this is the backstop, and it returns valid JSON that says it was cut.
 */
export function boundedJson(value: unknown, values: readonly string[]): string {
  const text = scrub(JSON.stringify(value, null, 2), values);
  if (text.length <= MAX_RESULT_CHARS) return text;
  return JSON.stringify({ truncated: true, note: `The result was ${text.length} characters; it is cut to ${MAX_RESULT_CHARS}. Narrow the request.`, partial: text.slice(0, MAX_RESULT_CHARS - 500) });
}
