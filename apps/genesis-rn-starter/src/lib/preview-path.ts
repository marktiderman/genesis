import type { LinkOptions } from "@marktiderman/genesis-native";

/**
 * Whether `to`, a path normalizeLink returned, is the preview route: the path previews open at
 * (`links.previews.path`, else `fallback`, genesis-native's PREVIEW_PATH), with its `?channel=…`
 * query or a subpath. Never a path that only starts the same (`/previews`, `/preview-settings`).
 * Previews switched off (`previews: false`): nothing is.
 */
export function isPreviewPath(to: string, previews: LinkOptions["previews"], fallback: string): boolean {
  if (previews === false) return false;
  const base = previews?.path ?? fallback;
  const trimmed = base.replace(/\/+$/, "") || "/";
  return to === base || to === trimmed || to.startsWith(`${base}?`) || to.startsWith(`${trimmed}/`);
}
