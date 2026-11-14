/**
 * Landing pages: the site's campaign pages (kind `landing`), made under one
 * directory (`/go` unless the site's `landing.directory` says otherwise) and
 * kept out of the menu. They are ordinary pages otherwise: the same
 * document, editor, checks, preview and release.
 */
import type { PageMeta, SiteDoc } from "./schemas";
import { DEFAULT_RESERVED_PATHS, pagePathProblems, type ReservedPaths } from "./urls";

/** Where new landing pages go when the site doesn't say. */
export const DEFAULT_LANDING_DIRECTORY = "/go";

/** A landing page's slug: one path segment of lowercase letters, digits and single hyphens. */
export const LANDING_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The site's landing page directory: `site.landing.directory`, or `/go`. */
export function landingDirectory(site: Pick<SiteDoc, "landing"> | null | undefined): string {
  return site?.landing?.directory ?? DEFAULT_LANDING_DIRECTORY;
}

/** The path of the landing page `slug` under `directory`: `("/go", "spring")` → `/go/spring`. */
export function landingPath(directory: string, slug: string): string {
  return `${directory}/${slug}`;
}

/** The slug of a page under `directory` (`/go/spring` → `spring`), or null for a path outside it. */
export function landingSlugOf(directory: string, path: string): string | null {
  const prefix = `${directory}/`;
  if (!path.startsWith(prefix) || path.length === prefix.length) return null;
  return path.slice(prefix.length);
}

/** Why `directory` can't hold landing pages (empty when it can): a page path other than `/`, and not reserved. */
export function landingDirectoryProblems(directory: unknown, reserved: ReservedPaths = DEFAULT_RESERVED_PATHS): string[] {
  if (directory === "/") return ["Landing pages need a directory of their own (like /go), not /."];
  return pagePathProblems(directory, reserved).map((p) => p.replace(/^A page path/, "A landing page directory"));
}

/** Why `slug` can't name a landing page under `directory` (empty when it can). */
export function landingSlugProblems(directory: string, slug: string, reserved: ReservedPaths = DEFAULT_RESERVED_PATHS): string[] {
  if (!LANDING_SLUG.test(slug)) return ["A landing page's address ends in lowercase letters, digits and single hyphens (for example spring-offer)."];
  return pagePathProblems(landingPath(directory, slug), reserved);
}

/**
 * Is this one of the site's landing pages? A page of kind `landing`, except
 * the home page: a one-click landing site's `/` is the site's home page, and
 * stays among the pages.
 */
export function isLandingPage(page: Pick<PageMeta, "kind" | "path">): boolean {
  return page.kind === "landing" && page.path !== "/";
}

/** The site's landing pages (`isLandingPage`), in the store's order. */
export function landingPages<T extends Pick<PageMeta, "kind" | "path">>(pages: readonly T[]): T[] {
  return pages.filter(isLandingPage);
}

/**
 * Where each landing page under `from` goes when the directory becomes `to`:
 * `/go/spring` → `/offers/spring`. Pages outside `from` stay where they are.
 */
export function landingMoves<T extends Pick<PageMeta, "id" | "kind" | "path">>(pages: readonly T[], from: string, to: string): { page: T; path: string }[] {
  if (from === to) return [];
  const moves: { page: T; path: string }[] = [];
  for (const page of landingPages(pages)) {
    const slug = landingSlugOf(from, page.path);
    if (slug !== null) moves.push({ page, path: landingPath(to, slug) });
  }
  return moves;
}
