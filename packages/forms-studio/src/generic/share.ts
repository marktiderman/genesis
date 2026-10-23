// Sharing a published form (ShareDialog): prefilled links and the embed snippet. Pure.
// Moved up from Breakthrough's src/lib/forms/share.ts.

/** One search param a prefilled link may set, and the values staff pick from. */
export interface PrefillChoice {
  key: string;
  /** The picker's accessible name, e.g. "Class". */
  label: string;
  /** The picker's "leave it out" choice, e.g. "Any class". */
  anyLabel: string;
  options: readonly { value: string; label: string }[];
}

/** `url` with `values` set as search params (empty values left out), keeping what it has. */
export function prefilledUrl(url: string, values: Record<string, string | undefined>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(values)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

const attr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** An `<iframe>` that shows the form on another website, full width. */
export function embedSnippet(url: string, title: string): string {
  return `<iframe src="${attr(url)}" title="${attr(title)}" width="100%" height="720" style="border:0;max-width:100%" loading="lazy"></iframe>`;
}
