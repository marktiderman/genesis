/**
 * The site's pages, described once. The root `meta` export reads a page's
 * title and description from here; the build prerenders every path listed
 * (react-router.config.ts, through site-paths.ts) and writes sitemap.xml,
 * robots.txt and llms.txt from it (scripts/generate-site-files.ts). A new static route is added
 * here too; the build fails when one isn't.
 */

export const SITE_NAME = "Genesis";
export const SITE_TAGLINE = "Business apps on React and Supabase, built for your coding agent.";
export const SITE_DESCRIPTION =
  "Genesis is an open-source framework for multi-tenant business apps on React, React Native and Supabase: workspaces, lists, record pages, forms, chat and AI from one design system, with a doctor that keeps every screen on it.";
export const REPO_URL = "https://github.com/marktiderman/genesis";
export const NPM_URL = "https://www.npmjs.com/org/marktiderman";
export const INIT_COMMAND = "npx @marktiderman/genesis-cli init my-app";

// `import.meta.env` is missing when a build script (tsx) imports this file; `process` is missing in the browser.
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};
const nodeEnv: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env;

/**
 * The deployed origin, for canonical links and the sitemap. Any host can set SITE_URL (or
 * VITE_SITE_URL) at build; vite.config.ts passes SITE_URL to the app, so the page tags and
 * scripts/generate-site-files.ts always agree.
 */
export const SITE_URL: string = (
  (env.VITE_SITE_URL as string | undefined) ?? nodeEnv.SITE_URL ?? nodeEnv.VITE_SITE_URL ?? "https://genesisone.dev"
).replace(/\/+$/, "");

/** The build's base path without its trailing slash ("" at the root): PAGES_BASE / Vite's `base`. */
export const SITE_BASE: string = (env.BASE_URL ?? nodeEnv.PAGES_BASE ?? "/").replace(/\/+$/, "");

export interface SitePage {
  path: string;
  title: string;
  description: string;
}

export const SITE_PAGES: SitePage[] = [
  { path: "/", title: "Genesis: business apps for your coding agent", description: SITE_DESCRIPTION },
  { path: "/dashboard", title: "Dashboard", description: "Stat tiles, a board and an activity feed built from Genesis components." },
  { path: "/items", title: "Items", description: "A list screen with grid, table and list modes, search, sort and a detail panel, on in-browser data." },
  { path: "/items-custom", title: "Items, composed by hand", description: "The same list composed from the lower-level data parts, for screens that need it." },
  { path: "/tasks", title: "Tasks", description: "A table with a column picker, filter chips, bulk actions and a modal detail." },
  { path: "/orders", title: "Orders", description: "A paginated table of orders with filters." },
  { path: "/design-system", title: "Design system", description: "Every Genesis web component on one page, in the current theme." },
  { path: "/sandbox", title: "List sandbox", description: "Switch a list screen's options live and see the result." },
  { path: "/forms", title: "Forms playground", description: "Genesis Forms: a serializable form definition with logic, validation and a live inspector." },
  { path: "/forms-builder", title: "Form builder", description: "The visual Genesis Forms builder: questions, choices, show and hide logic." },
  { path: "/settings", title: "Settings", description: "A settings screen on Genesis components." },
  { path: "/demo", title: "Live demo", description: "A multi-tenant demo app on Genesis: three organizations, three roles, lists, record pages, forms, chat, an assistant and the Data Studio, in your browser." },
  { path: "/studio", title: "Data Studio", description: "An Airtable-style workspace over an app's own tables." },
  { path: "/features", title: "Features", description: "Genesis's own feature registry, rendered from features.ts." },
  { path: "/sites", title: "Sites", description: "Landing pages and small sites from the Genesis Sites section registry." },
  { path: "/sites-editor", title: "Sites editor", description: "Edit a Genesis Sites page in the visual editor." },
  { path: "/chat", title: "Chat", description: "Genesis Chat's web panel on an in-memory client." },
  { path: "/packages", title: "Packages", description: "Every published Genesis package: entry points, components, hooks and exports, read from the source at build." },
  { path: "/showcase", title: "Components", description: "Tokens, primitives and page layouts from the Genesis design system." },
  { path: "/showcase/tokens", title: "Design tokens", description: "Colors, typography, spacing, radii, motion and shadows from genesis-design-system." },
  { path: "/showcase/elements", title: "Elements", description: "Every Genesis web and native component, with props and examples." },
  { path: "/showcase/layouts", title: "Page layouts", description: "DashboardPage, SettingsPage, FormPage and DetailPage, rendered live." },
  { path: "/showcase/standards", title: "Standards", description: "How Genesis apps are built: reuse, then extend, then invent." },
];

const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => SitePage]> = [
  [/^\/packages\/([^/]+)$/, (m) => ({ path: m[0], title: `genesis-${m[1]} package`.replace("genesis-genesis", "genesis"), description: `The @marktiderman/genesis ${m[1]} package: entry points, components, hooks and exports.` })],
  [/^\/showcase\/elements\/([^/]+)$/, (m) => ({ path: m[0], title: `${words(m[1]!)} component`, description: `The ${words(m[1]!)} component: what it's for, its props and examples.` })],
  [/^\/showcase\/tokens\/([^/]+)$/, (m) => ({ path: m[0], title: `${words(m[1]!)} tokens`, description: `The ${m[1]} tokens of the Genesis design system.` })],
  [/^\/showcase\/layouts\/([^/]+)$/, (m) => ({ path: m[0], title: `${words(m[1]!)} layout`, description: "A Genesis page layout, rendered live." })],
  [/^\/forms\/([^/]+)$/, (m) => ({ path: m[0], title: `${words(m[1]!)} form`, description: "A Genesis Forms scenario in the playground." })],
  [/^\/preview\/([^/]+)$/, (m) => ({ path: m[0], title: `${words(m[1]!)} form`, description: "A Genesis form as a respondent sees it." })],
  [/^\/demo\/([^/]+)(\/.*)?$/, (m) => ({ path: m[0], title: `Demo: ${demoTitle(m[1]!, m[2])}`, description: "A multi-tenant demo app on Genesis, running in your browser on sample data." })],
];

const DEMO_ORGS: Record<string, string> = { harbor: "Harbor Studio", summit: "Summit Fitness", maple: "Maple Property Co.", all: "All organizations" };
function demoTitle(ws: string, rest?: string): string {
  const page = rest?.split("/")[1];
  return [DEMO_ORGS[ws] ?? ws, page ? words(page) : null].filter(Boolean).join(" · ");
}

function words(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The page for a path: a listed page, or one built from a parameterised route's pattern. */
export function pageFor(pathname: string): SitePage | undefined {
  const path = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  const listed = SITE_PAGES.find((p) => p.path === path);
  if (listed) return listed;
  for (const [re, make] of PATTERNS) {
    const m = path.match(re);
    if (m) return make(m);
  }
  return undefined;
}

/** Title, description, Open Graph and canonical tags for a path. */
export function metaFor(pathname: string) {
  const path = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  const page = pageFor(path);
  const title = page ? (path === "/" ? page.title : `${page.title} · Genesis`) : "Genesis";
  const description = page?.description ?? SITE_DESCRIPTION;
  const url = `${SITE_URL}${SITE_BASE}${path === "/" ? "/" : path}`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: `${SITE_URL}${SITE_BASE}/og.png` },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: url },
  ];
}
