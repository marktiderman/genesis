/** Small HTTP pieces the media handlers share. */

/**
 * A `content-disposition: attachment` value per RFC 6266: a plain-ASCII
 * `filename` for old clients and the exact name as `filename*` (RFC 8187).
 */
export function attachment(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%/]/g, "_").trim() || "download";
  const exact = encodeURIComponent(filename).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${exact}`;
}

/** Headers every media response carries. */
export function baseHeaders(): Headers {
  return new Headers({ "x-robots-tag": "noindex", "x-content-type-options": "nosniff" });
}

/** A short plain-text answer that is never cached. */
export function plain(status: number, text: string, extra: Record<string, string> = {}): Response {
  const headers = baseHeaders();
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("cache-control", "no-store");
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(text, { status, headers });
}

export const notFound = () => plain(404, "Not found.");
export const forbidden = () => plain(403, "This link is invalid or has expired.");
export const methodNotAllowed = () => plain(405, "Use GET or HEAD.", { allow: "GET, HEAD" });

/**
 * A request's path as decoded segments, or null when a segment can't be
 * decoded or is `.`, `..`, or holds a slash, backslash or NUL once decoded.
 */
export function pathSegments(url: URL): string[] | null {
  const segments: string[] = [];
  for (const raw of url.pathname.split("/")) {
    if (raw === "") continue;
    let part: string;
    try {
      part = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (part === "." || part === ".." || /[/\\\0]/.test(part)) return null;
    segments.push(part);
  }
  return segments;
}
