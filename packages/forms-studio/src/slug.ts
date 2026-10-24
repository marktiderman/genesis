// A form's public link and a duplicate's name: what a forms list needs to make a form or
// copy one, without storage. Pure. Moved up from Breakthrough's src/lib/feedback/admin.ts.

/**
 * "How was class?" → "how-was-class": the public link's last part (lowercase words and
 * hyphens, at most 60). `fallback` is used when the title has no letters or numbers.
 */
export function slugFromTitle(title: string, fallback = "form"): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** A form link: lowercase letters and numbers, in words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Why a form link can't be used, or nothing when it fits SLUG_PATTERN. */
export function validateSlug(slug: string): string | undefined {
  return SLUG_PATTERN.test(slug)
    ? undefined
    : "Use lowercase letters, numbers and hyphens for the link, like how-was-class.";
}

/** A duplicate's name: "Copy of …", within the 120 characters a form name may have. */
export function copyTitle(title: string): string {
  return `Copy of ${title}`.slice(0, 120);
}

/** The first of `slug`, `slug-2`, `slug-3`… that isn't in `taken`, within 60 characters. */
export function freeSlug(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${slug.slice(0, 60 - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
