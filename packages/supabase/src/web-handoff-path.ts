/**
 * The one check for a web handoff's destination, used before a link is minted
 * and again after the person is signed in: the path must stay on the app's
 * own origin. Shared by `/web-handoff` (the page) and `/web-handoff/server`.
 */

const BASE = "https://handoff.invalid";
// A backslash (browsers read `/\host` as `//host`), whitespace and control characters (browsers
// drop tabs and newlines from URLs, so `/\t/host` becomes `//host`).
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const UNSAFE = /[\\\u0000-\u0020\u007f-\u009f]/;
// After decoding, a space is ordinary text; the rest still is not.
// eslint-disable-next-line no-control-regex -- as above.
const UNSAFE_DECODED = /[\\\u0000-\u001f\u007f-\u009f]/;

/**
 * `value` as a path on this app (`/clients/1/forms?tab=questions`), normalized, or `null` when it
 * could leave the origin or isn't a path: anything without a single leading `/`, `//host`,
 * `/\host`, a scheme (`javascript:`, `https:`), whitespace or control characters, and the same
 * tricks percent-encoded (`/%2F%2Fhost`, `/%5Chost`, `/%09/host`, up to three layers).
 *
 * @stability Beta
 */
export function appRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  if (value[0] !== "/" || value[1] === "/" || UNSAFE.test(value)) return null;
  let decoded = value;
  for (let layer = 0; layer < 3; layer++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) break;
    decoded = next;
    if (decoded[0] !== "/" || decoded[1] === "/" || UNSAFE_DECODED.test(decoded)) return null;
  }
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  const path = url.pathname + url.search + url.hash;
  return path.startsWith("//") ? null : path;
}
