/**
 * Every path the build prerenders: the listed pages plus one per value of
 * each parameterised route. Read at build time only (react-router.config.ts,
 * scripts/generate-site-files.ts), so primitives.json stays out of the app's
 * first bundle.
 */
import primitives from "../data/primitives.json";
import { PROJECTS } from "../data/projects";
import { scenarios } from "./forms";
import { LAYOUTS, TOKEN_CATEGORIES } from "./portfolio-data";
import { pageFor, SITE_PAGES, type SitePage } from "./site";

const PROJECT_TABS = ["tasks", "activity", "settings"];

export function sitePaths(): string[] {
  const slugs = new Set((primitives as { primitives: Array<{ slug: string }> }).primitives.map((p) => p.slug));
  return [
    ...SITE_PAGES.map((p) => p.path),
    ...TOKEN_CATEGORIES.map((c) => `/showcase/tokens/${c.slug}`),
    ...LAYOUTS.map((l) => `/showcase/layouts/${l.slug}`),
    ...[...slugs].map((s) => `/showcase/primitives/${s}`),
    ...scenarios.flatMap((s) => [`/forms/${s.id}`, `/preview/${s.id}`]),
    ...PROJECTS.flatMap((p) => [`/projects/${p.id}`, ...PROJECT_TABS.map((t) => `/projects/${p.id}/${t}`)]),
  ];
}

/** Pages that are only ever framed by another page: prerendered, but not in the sitemap. */
const FRAMED = ["/forms-frame"];

export function prerenderPaths(): string[] {
  return [...sitePaths(), ...FRAMED];
}

export function sitePages(): SitePage[] {
  return sitePaths().map((path) => pageFor(path) ?? { path, title: path, description: "" });
}
