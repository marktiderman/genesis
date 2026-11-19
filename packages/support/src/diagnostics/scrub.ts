/**
 * The PII scrubber every sink's input goes through by default: text is
 * rewritten by pattern (an email, a phone number, a JWT, a Supabase key, a
 * bearer token, a token in a query string, row values in a database error),
 * values under a key that names a secret or a contact detail are replaced
 * whole, and URLs lose their query and fragment (PostgREST filters carry
 * record ids, auth callbacks carry codes). Strings are cut at 4 KB first, so
 * a huge log line can't stall the JS thread.
 *
 * What it can't know: a person's name in free text. Keep names out of error
 * messages and breadcrumbs; touch breadcrumbs lose their labels in
 * `sentrySink` for this reason.
 *
 * Pattern-based on values, not an allowlist of keys: a key allowlist misses
 * `refresh failed: eyJhbGciOi…`, which is the shape that actually occurs.
 *
 * Fail closed: `scrubEvent` and `scrubRecord` return `null` (drop it) when
 * scrubbing itself throws, never the unscrubbed input.
 */

/** What replaces a value under a secret-looking key. */
export const FILTERED = "[Filtered]";

// Keys whose value is a secret (or a contact detail) whatever it looks like.
// Matched case-insensitively with `-`, `_`, `.` and spaces removed: exactly
// for the short, ambiguous ones, as a part of the key for the rest
// (`x-supabase-api-key`, `user.email`, `refresh_token_hash`).
const SECRET_KEY_EXACT = /^(session|sessionid|dsn|otp|code|verifier|codeverifier|privatekey|refresh|pwd|key)$/;
const SECRET_KEY_PART = /(authoriz|cookie|passw|secret|token|apikey|credential|jwt|email|phone|servicerole)/;

/** True when a value under `key` is a secret (or contact detail) whatever it looks like. */
export function isSecretKey(key: string): boolean {
  const k = key.replace(/[-_.\s]/g, "").toLowerCase();
  return SECRET_KEY_EXACT.test(k) || SECRET_KEY_PART.test(k);
}

// Sentry's own ids and envelope fields: 32-hex values the hex rule would break, never PII.
const ID_KEY = /^(event_id|trace_id|span_id|parent_span_id|profile_id|replay_id|debug_id|code_id|public_key|segment_id|sampled|release|dist|environment)$/;

// Fields dropped whole: query strings travel as their own fields too (Sentry's http breadcrumbs,
// spans and requests), and bodies and PostgREST `details` carry row values.
const DROPPED_KEY = /^(query_string|http\.query|http\.fragment|url\.query|url\.fragment|request_body|response_body|body|cookies|details)$/i;

/** Longest string scrubbed in full; the rest is cut off (the patterns stay fast on huge logs). */
export const MAX_STRING = 4096;

const PATTERNS: readonly [RegExp, string][] = [
  // The query string and fragment of a URL with a scheme anywhere in text (a span's
  // "GET https://…?id=eq.42", a deep link "myapp://reset?token_hash=…").
  [/\b([a-z][a-z0-9+.-]{0,31}:\/\/[^\s?#"'<>]{0,2048})[?#][^\s"'<>]*/gi, "$1"],
  // …and of a path ("POST /rest/v1/rpc/find?email=eq.…").
  [/(^|[\s"'(=])(\/[^\s?#"'<>]{0,2048})\?[^\s"'<>]*/g, "$1$2"],
  // JWTs: Supabase access tokens and the legacy anon / service_role keys.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  // Supabase's API keys (sb_secret_…, sb_publishable_…).
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, "[supabase-key]"],
  // `Authorization: Bearer …` copied into a message.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [token]"],
  // Tokens in a query string or a fragment left without a scheme.
  [
    /([?&#](?:access_token|refresh_token|id_token|provider_token|provider_refresh_token|token|token_hash|code|apikey|api_key|key|password|secret|email|phone)=)[^&#\s"']+/gi,
    "$1[Filtered]",
  ],
  // Row values in PostgreSQL errors: `Failing row contains (…)`, `Key (email)=(…)`.
  [/(Failing row contains )\([^)]*\)/g, "$1(…)"],
  [/(Key \([^)]{0,256}\)=)\([^)]*\)/g, "$1(…)"],
  // Email addresses, also percent-encoded (`a%40b.co`). Bounded, so a long run of letters can't backtrack.
  [/[A-Za-z0-9._%+-]{1,64}(?:@|%40)(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}/g, "[email]"],
  // Phone numbers: international (`+1 555 555 0101`) and North American (`555-555-0101`).
  [/\+\d[\d\s().-]{6,18}\d/g, "[phone]"],
  [/\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[phone]"],
  // Long opaque hex runs: API keys, refresh tokens, DSN secrets. Linear: a run starts only after a non-hex character.
  [/(^|[^A-Fa-f0-9])[A-Fa-f0-9]{32,}(?![A-Fa-f0-9])/g, "$1[hex]"],
];

/** A string with every URL query, email, phone number, JWT, Supabase key, bearer token and query-string token replaced. */
export function scrubString(value: string): string {
  let out = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** A URL without its query string and fragment, then scrubbed (an email in a path). */
export function scrubUrl(value: string): string {
  const cut = value.search(/[?#]/);
  return scrubString(cut === -1 ? value : value.slice(0, cut));
}

// Keys whose string value is cut at `?` when it is a URL.
const URL_KEY = /^(url|href|from|to|uri|description|http\.url|url\.full)$/i;
const MAX_DEPTH = 8;

/**
 * A deep copy of `value` with every string scrubbed and every value under a
 * secret key replaced. Cycles become `"[Circular]"`; past 8 levels,
 * `"[Truncated]"`. Errors become `{ name, message }`. Header lists
 * (`[["authorization", "…"]]`) are treated like objects.
 */
export function scrubValue(value: unknown, key = "", depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (key && isSecretKey(key)) return value === undefined || value === null || value === "" ? value : FILTERED;
  if (typeof value === "string") {
    if (key && ID_KEY.test(key)) return value;
    return URL_KEY.test(key) ? scrubUrl(value) : scrubString(value);
  }
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  if (Array.isArray(value)) {
    // A `[name, value]` pair (fetch's header lists): the name decides, as for an object key.
    if (value.length === 2 && typeof value[0] === "string" && isSecretKey(value[0])) return [value[0], FILTERED];
    return value.map((item) => scrubValue(item, "", depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (DROPPED_KEY.test(k)) continue;
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
    // Sentry's processing metadata (scopes, the sampling context its envelope header is built
    // from) is never sent as part of the event: pass it through, or the envelope breaks.
    const { user, request, sdkProcessingMetadata, ...rest } = event;
    const out = scrubValue(rest) as E;
    if (sdkProcessingMetadata !== undefined) (out as ScrubbableEvent).sdkProcessingMetadata = sdkProcessingMetadata;
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
