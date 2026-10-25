/**
 * URL and path rules shared by the schemas, the renderer and the database.
 *
 * Every link a site renders comes from stored props, so every link is
 * untrusted. A link is safe when it is a site path (`/about`), a fragment
 * (`#pricing`), or an absolute `https:`, `http:`, `mailto:` or `tel:` URL.
 * Everything else (`javascript:`, `data:`, `vbscript:`, protocol-relative
 * `//host`, a backslash trick, a control character) is refused, both when a
 * document is parsed and again when it is rendered.
 */

/** The longest URL a site stores. */
export const MAX_URL_LENGTH = 2048;

const SAFE_SCHEMES = new Set(["https:", "http:", "mailto:", "tel:"]);
// C0 controls, DEL, whitespace other than a plain space, and the backslash
// (browsers read `\` as `/` in special URLs, so `/\evil.test` is `//evil.test`).
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\\s]/;

/** Is this a link a site may render: a site path, a fragment, or an http(s), mailto or tel URL? */
export function isSafeHref(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  if (UNSAFE_CHARS.test(value)) return false;
  if (value.startsWith("#")) return true;
  if (value.startsWith("/")) return !value.startsWith("//");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!SAFE_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "http:" || url.protocol === "https:") return url.hostname.length > 0 && !url.username && !url.password;
  return true;
}

/** Is this a URL an image may load from: a site path or an `https:` URL? */
export function isSafeImageSrc(value: unknown): value is string {
  if (!isSafeHref(value)) return false;
  if (value.startsWith("/")) return true;
  return value.startsWith("https://");
}

/** Is this an external (absolute) link, opened with `rel="noopener noreferrer"`? */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * A page's path: `/`, or lowercase segments of letters, digits and hyphens
 * (`/about`, `/classes/strength`). No trailing slash, no dots, at most 8
 * segments and 200 characters. The database checks the same pattern.
 */
export const PAGE_PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,7})?$/;
export const MAX_PAGE_PATH_LENGTH = 200;

/**
 * Paths a site never owns, because it shares its hostname with the host app:
 * the app's API and server functions, its auth callbacks, and this package's
 * own assets. A host passes its own list (or a predicate) to
 * `handleSiteRequest` and `validatePagePath`; the database's default is the
 * same list (`genesis_sites.reserved_paths()`).
 */
export const DEFAULT_RESERVED_PATHS: readonly string[] = Object.freeze(["/api", "/_server", "/auth", "/_gs"]);

/** A reserved-path rule: a list of path prefixes, or a predicate. */
export type ReservedPaths = readonly string[] | ((path: string) => boolean);

/** Is `path` reserved: equal to a reserved prefix, or under it (`/api`, `/api/x`, not `/apiary`)? */
export function isReservedPath(path: string, reserved: ReservedPaths = DEFAULT_RESERVED_PATHS): boolean {
  if (typeof reserved === "function") return reserved(path);
  // Case-insensitive, like the database's check: /AUTH is the app's /auth on a case-insensitive router.
  const probe = path.toLowerCase();
  return reserved.some((prefix) => {
    const lower = prefix.toLowerCase();
    const p = lower.endsWith("/") && lower.length > 1 ? lower.slice(0, -1) : lower;
    return probe === p || probe.startsWith(`${p}/`);
  });
}

/** Problems with a page path, empty when it is fine. */
export function pagePathProblems(path: unknown, reserved: ReservedPaths = DEFAULT_RESERVED_PATHS): string[] {
  if (typeof path !== "string") return ["A page path is text."];
  const problems: string[] = [];
  if (path.length > MAX_PAGE_PATH_LENGTH) problems.push(`A page path has at most ${MAX_PAGE_PATH_LENGTH} characters.`);
  if (!PAGE_PATH.test(path)) {
    problems.push('A page path starts with "/" and uses lowercase letters, digits and single hyphens, with no trailing slash (for example "/about").');
  }
  if (isReservedPath(path, reserved)) problems.push(`"${path}" is reserved for the app this site shares its address with.`);
  return problems;
}

/** Throws when the path can't be a page's. */
export function validatePagePath(path: string, reserved: ReservedPaths = DEFAULT_RESERVED_PATHS): string {
  const problems = pagePathProblems(path, reserved);
  if (problems.length) throw new Error(problems.join(" "));
  return path;
}

/**
 * The page path a request path asks for: decoded, lowercase, without a
 * trailing slash. Returns null for a path that can't name a page (so the
 * caller falls through to the host app).
 */
export function normalizeRequestPath(pathname: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (UNSAFE_CHARS.test(path) || path.includes("//")) return null;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path.toLowerCase();
}
