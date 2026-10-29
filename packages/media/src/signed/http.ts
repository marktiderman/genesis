/** Small HTTP pieces the media handlers share. */

/**
 * A `content-disposition: attachment` value per RFC 6266: a plain-ASCII
 * `filename` for old clients and the exact name as `filename*` (RFC 8187).
 */
export function attachment(filename?: string): string {
  if (filename === undefined) return "attachment";
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%/]/g, "_").trim() || "download";
  const exact = encodeURIComponent(filename).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${exact}`;
}

/**
 * Headers every media response carries. The CSP sandbox means a stored file
 * that is really HTML or SVG can't run script on the media origin, even when
 * someone opens it directly. The file handler drops it for PDF only (see
 * `isPdf`).
 */
export function baseHeaders(): Headers {
  return new Headers({
    "x-robots-tag": "noindex",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
  });
}

/**
 * Whether a content type may be shown in the browser rather than downloaded:
 * images other than SVG, video, audio and PDF. Anything else (HTML, SVG,
 * XML, text, unknown) is sent as an attachment.
 */
export function isInlineSafe(contentType: string): boolean {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  if (type === "application/pdf") return true;
  if (type.startsWith("image/")) return type !== "image/svg+xml" && !type.includes("svg");
  return /^(video|audio)\/[a-z0-9.+-]+$/.test(type);
}

/**
 * Whether a content type is PDF. A PDF goes out without the CSP sandbox:
 * Chromium's PDF viewer shows a blank page under `default-src 'none'`, and
 * with `nosniff` and the declared PDF type the file can't run as HTML.
 */
export function isPdf(contentType: string): boolean {
  return contentType.split(";")[0]!.trim().toLowerCase() === "application/pdf";
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
 * decoded, or once decoded is `.` or `..`, holds a slash, a backslash or
 * NUL, or still holds a percent-escape (`%2e`). Refusing escapes refuses
 * double encoding (`%252e%252e`), which would decode once here to `%2e%2e`
 * and become `..` in a storage URL built from it; a plain `%` (`100% done.jpg`)
 * is fine.
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
    if (part === "." || part === ".." || /[/\\\0]/.test(part) || /%[0-9a-f]{2}/i.test(part)) return null;
    segments.push(part);
  }
  return segments;
}
