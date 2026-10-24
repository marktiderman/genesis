// Sharing a published form (ShareDialog): prefilled links and the embed snippet. Pure.
// Moved up from the host app's src/lib/forms/share.ts.

/** One search param a prefilled link may set, and the values staff pick from. */
export interface PrefillChoice {
  key: string;
  /** The picker's accessible name, e.g. "Class". */
  label: string;
  /** The picker's "leave it out" choice, e.g. "Any class". */
  anyLabel: string;
  options: readonly { value: string; label: string }[];
}

// Resolves a relative link without inventing an origin for it.
const RELATIVE_BASE = "http://relative.invalid";

/**
 * `url` with `values` set as search params (empty values left out), keeping what it has.
 * An absolute link stays absolute; a relative one (`/f/a?x=1`) stays relative, so it never
 * throws while a page is still working out its origin.
 */
export function prefilledUrl(url: string, values: Record<string, string | undefined>): string {
  let absolute = true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    absolute = false;
    u = new URL(url, RELATIVE_BASE);
  }
  for (const [k, v] of Object.entries(values)) if (v) u.searchParams.set(k, v);
  if (absolute) return u.toString();
  const path = url.startsWith("/") ? u.pathname : u.pathname.replace(/^\//, "");
  return `${path}${u.search}${u.hash}`;
}

const attr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** An `<iframe>` that shows the form on another website, full width. */
export function embedSnippet(url: string, title: string): string {
  return `<iframe src="${attr(url)}" title="${attr(title)}" width="100%" height="720" style="border:0;max-width:100%" loading="lazy"></iframe>`;
}
