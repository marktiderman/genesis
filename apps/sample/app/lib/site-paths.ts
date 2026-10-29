/**
 * Every path the build prerenders: the listed pages plus one per value of
 * each parameterised route. Read at build time only (react-router.config.ts,
 * scripts/generate-site-files.ts), so primitives.json stays out of the app's
 * first bundle.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import primitives from "../data/primitives.json";
import { CLIENT_SELF, ORGS } from "../demo/tenants";
import { scenarios } from "./forms";
import { LAYOUTS, TOKEN_CATEGORIES } from "./portfolio-data";
import { pageFor, SITE_PAGES, type SitePage } from "./site";

const DEMO_PAGES = ["clients", "bookings", "intake", "chat", "assistant", "data", "settings"];

/** Every published package's folder under packages/: one page each. */
export function packageDirs(): string[] {
  const root = resolve(process.cwd(), "..", "..", "packages");
  return readdirSync(root).filter((d) => {
    const file = join(root, d, "package.json");
    return existsSync(file) && !JSON.parse(readFileSync(file, "utf8")).private;
  });
}

export function sitePaths(): string[] {
  const slugs = new Set((primitives as { primitives: Array<{ slug: string }> }).primitives.map((p) => p.slug));
  return [
    ...SITE_PAGES.map((p) => p.path),
    ...packageDirs().map((d) => `/packages/${d}`),
    ...TOKEN_CATEGORIES.map((c) => `/showcase/tokens/${c.slug}`),
    ...LAYOUTS.map((l) => `/showcase/layouts/${l.slug}`),
    ...[...slugs].map((s) => `/showcase/primitives/${s}`),
    ...scenarios.flatMap((s) => [`/forms/${s.id}`, `/preview/${s.id}`]),
    ...["all", ...ORGS.map((o) => o.id)].flatMap((ws) => [`/demo/${ws}`, ...DEMO_PAGES.map((p) => `/demo/${ws}/${p}`)]),
    ...ORGS.map((o) => `/demo/${o.id}/clients/${CLIENT_SELF[o.id]}/bookings`),
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
