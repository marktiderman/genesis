// Links a person or a row supplies, checked before they reach an `href` or `src`. Pure: web,
// native and the extension use the same check (docs/RESOURCE-VIEW.md, "URLs are checked").

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * True when `url` is safe to put in an `href`: an absolute http(s), mailto or
 * tel URL, a root-relative path (`/lessons/1`) or a fragment (`#notes`).
 *
 * Rejects `javascript:`, `data:`, `vbscript:` and every other scheme, as well
 * as protocol-relative `//host` URLs and anything containing whitespace or
 * control characters (browsers strip those, which is how `java\tscript:`
 * slips past naive checks).
 */
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (value === "" || value.length > 2048) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f-\u009f]/.test(value)) return false;
  if (value.startsWith("#")) return true;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.startsWith("/\\");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return SAFE_PROTOCOLS.has(parsed.protocol);
}

/**
 * Turn what a person typed into the link field into a safe href, or `null`.
 * `example.com/page` becomes `https://example.com/page`; an email address
 * becomes a `mailto:` link.
 */
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (isSafeUrl(value)) return value;
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(value)) {
    const mail = `mailto:${value}`;
    return isSafeUrl(mail) ? mail : null;
  }
  // No scheme but looks like a host: assume https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && /^[^\s/]+\.[^\s/]+/.test(value)) {
    const withScheme = `https://${value}`;
    return isSafeUrl(withScheme) ? withScheme : null;
  }
  return null;
}
