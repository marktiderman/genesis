/**
 * The PII scrubber every sink's input goes through by default: text is
 * rewritten by pattern (an email, a JWT, a Supabase key, a bearer token, a
 * token in a query string), values under a key that names a secret are
 * replaced whole, and URLs lose their query and fragment (PostgREST filters
 * carry record ids, auth callbacks carry codes).
 *
 * Pattern-based on values, not an allowlist of keys: a key allowlist misses
 * `refresh failed: eyJhbGciOi…`, which is the shape that actually occurs.
 *
 * Fail closed: `scrubEvent` and `scrubRecord` return `null` (drop it) when
 * scrubbing itself throws, never the unscrubbed input.
 */

/** What replaces a value under a secret-looking key. */
export const FILTERED = "[Filtered]";

// Keys whose value is a secret whatever it looks like. Matched on the whole
// key, case-insensitively, with `-`, `_` and spaces removed.
const SECRET_KEY =
  /^(authorization|proxyauthorization|cookie|cookies|setcookie|password|passwd|pwd|secret|clientsecret|token|accesstoken|refreshtoken|idtoken|providertoken|providerrefreshtoken|apikey|xapikey|servicerolekey|secretkey|privatekey|session|sessionid|dsn|otp|code|verifier|codeverifier|credential|credentials|email|phone)$/;

/** True when a value under `key` is a secret (or contact detail) whatever it looks like. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key.replace(/[-_\s]/g, "").toLowerCase());
}

const PATTERNS: readonly [RegExp, string][] = [
  // The query string and fragment of a web URL anywhere in text (a span's "GET https://…?id=eq.42").
  [/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, "$1"],
  // JWTs: Supabase access tokens and the legacy anon / service_role keys.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  // Supabase's API keys (sb_secret_…, sb_publishable_…).
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, "[supabase-key]"],
  // `Authorization: Bearer …` copied into a message.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [token]"],
  // Tokens in a query string or a fragment (an auth callback URL).
  [
    /([?&#](?:access_token|refresh_token|id_token|provider_token|provider_refresh_token|token|code|apikey|api_key|key|password|secret)=)[^&#\s"']+/gi,
    "$1[Filtered]",
  ],
  // Email addresses.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[email]"],
  // Long opaque hex runs: API keys, refresh tokens, DSN secrets.
  [/\b[A-Fa-f0-9]{32,}\b/g, "[hex]"],
];

/** A string with every email, JWT, Supabase key, bearer token and query-string token replaced. */
export function scrubString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** A URL without its query string and fragment, then scrubbed (an email in a path). */
export function scrubUrl(value: string): string {
  const cut = value.search(/[?#]/);
  return scrubString(cut === -1 ? value : value.slice(0, cut));
}

// Keys whose string value is cut at `?` when it is an absolute URL.
const URL_KEY = /^(url|href|from|to|uri|description|http\.url)$/i;
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;
const MAX_DEPTH = 8;

/**
 * A deep copy of `value` with every string scrubbed and every value under a
 * secret key replaced. Cycles become `"[Circular]"`; past 8 levels,
 * `"[Truncated]"`. Errors become `{ name, message }`.
 */
export function scrubValue(value: unknown, key = "", depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (key && isSecretKey(key)) return value === undefined || value === null || value === "" ? value : FILTERED;
  if (typeof value === "string") return URL_KEY.test(key) && ABSOLUTE_URL.test(value) ? scrubUrl(value) : scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, "", depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    // Query strings travel as their own fields too (Sentry's http breadcrumbs, spans, requests).
    if (/^(query_string|http\.query|http\.fragment|request_body|response_body|body|cookies)$/i.test(k)) continue;
    out[k] = scrubValue(v, k, depth + 1, seen);
  }
  return out;
}

/** The fields of a Sentry-shaped event `scrubEvent` treats specially. Anything else is scrubbed by value. */
export interface ScrubbableEvent {
  user?: { id?: unknown; [key: string]: unknown } | null;
  request?: { url?: unknown; method?: unknown; headers?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * The event with the user reduced to its id, the request reduced to its
 * method, URL (cut at `?`) and scrubbed headers, and every other value
 * scrubbed. `null` when scrubbing threw: fail closed, send nothing rather
 * than PII.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E | null {
  try {
    const { user, request, ...rest } = event;
    const out = scrubValue(rest) as E;
    if (user !== undefined) {
      (out as ScrubbableEvent).user = user && user.id !== undefined && user.id !== null ? { id: scrubString(String(user.id)) } : null;
    }
    if (request && typeof request === "object") {
      const safe: Record<string, unknown> = {};
      if (typeof request.url === "string") safe.url = scrubUrl(request.url);
      if (typeof request.method === "string") safe.method = request.method;
      if (request.headers && typeof request.headers === "object") safe.headers = scrubValue(request.headers);
      (out as ScrubbableEvent).request = safe;
    }
    return out;
  } catch {
    return null;
  }
}

/** A breadcrumb, span or any record, scrubbed by value. `null` when scrubbing threw (fail closed). */
export function scrubRecord<R extends object>(record: R): R | null {
  try {
    return scrubValue(record) as R;
  } catch {
    return null;
  }
}
