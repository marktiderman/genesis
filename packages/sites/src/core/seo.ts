/**
 * SEO: a page's meta tags (title, description, canonical, robots, Open Graph,
 * Twitter), sitemap.xml, robots.txt, JSON-LD (Organization, WebSite,
 * BreadcrumbList), and the redirects a page move leaves behind.
 *
 * Canonical and absolute URLs are built from `origin`, the site's primary
 * address, which the host passes in. Nothing here reads a request's Host.
 */
import type { Image, PageDoc, Redirect, ReleasePage, SiteDoc } from "./schemas";
import { isSafeHref } from "./urls";

export interface PageMetaInput {
  site: SiteDoc;
  page: ReleasePage;
  /** The site's primary origin, `https://riverside.example`, no trailing slash. */
  origin: string;
  /** The path prefix the site is served under (`""` at the root). */
  basePath?: string;
  /** A preview: always `noindex`. */
  preview?: boolean;
}

export interface PageMeta {
  title: string;
  description?: string;
  canonical: string;
  robots: string;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
}

/** The absolute URL of a site path. */
export function absoluteUrl(origin: string, basePath: string, path: string): string {
  const base = origin.replace(/\/+$/, "") + (basePath ?? "").replace(/\/+$/, "");
  return path === "/" ? `${base}/` : `${base}${path}`;
}

function imageUrl(image: Image | undefined, origin: string, basePath: string): string | undefined {
  if (!image) return undefined;
  return image.src.startsWith("/") ? absoluteUrl(origin, basePath, image.src) : image.src;
}

/**
 * The page's title with the site's template (`%s · Riverside Gym`), so every
 * tab and search result names the site. An SEO title written for the page
 * (`seo.title`) is used as it is.
 */
export function pageTitle(site: SiteDoc, doc: PageDoc, _path: string): string {
  const own = doc.seo?.title?.trim();
  if (own) return own;
  const title = doc.root.props.title;
  const template = site.seo.titleTemplate;
  if (!template || !template.includes("%s")) return title;
  return template.replace("%s", title);
}

/** Every meta value a page prints in its `<head>`. */
export function pageMeta({ site, page, origin, basePath = "", preview = false }: PageMetaInput): PageMeta {
  const doc = page.doc;
  const title = pageTitle(site, doc, page.path);
  const description = doc.seo?.description?.trim() || site.seo.description?.trim() || undefined;
  const canonical = doc.seo?.canonical ?? absoluteUrl(origin, basePath, page.path);
  const noindex = preview || site.seo.noindex === true || doc.seo?.noindex === true;
  const image = doc.seo?.ogImage ?? site.seo.ogImage;
  const img = imageUrl(image, origin, basePath);
  const openGraph: Record<string, string> = {
    "og:type": "website",
    "og:title": title,
    "og:url": canonical,
    "og:site_name": site.name,
    "og:locale": site.lang.replace("-", "_"),
  };
  if (description) openGraph["og:description"] = description;
  if (img) {
    openGraph["og:image"] = img;
    if (image?.alt) openGraph["og:image:alt"] = image.alt;
    if (image?.width) openGraph["og:image:width"] = String(image.width);
    if (image?.height) openGraph["og:image:height"] = String(image.height);
  }
  const twitter: Record<string, string> = { "twitter:card": img ? "summary_large_image" : "summary", "twitter:title": title };
  if (description) twitter["twitter:description"] = description;
  if (img) twitter["twitter:image"] = img;
  return {
    title,
    ...(description ? { description } : {}),
    canonical,
    robots: noindex ? "noindex, nofollow" : "index, follow",
    openGraph,
    twitter,
  };
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────

export function organizationJsonLd(site: SiteDoc, origin: string, basePath = ""): Record<string, unknown> {
  const org = site.seo.organization;
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org?.name ?? site.name,
    url: absoluteUrl(origin, basePath, "/"),
  };
  if (org?.logo) out.logo = org.logo.startsWith("/") ? absoluteUrl(origin, basePath, org.logo) : org.logo;
  if (org?.sameAs?.length) out.sameAs = org.sameAs;
  return out;
}

export function websiteJsonLd(site: SiteDoc, origin: string, basePath = ""): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: absoluteUrl(origin, basePath, "/"),
    inLanguage: site.lang,
  };
}

/** The trail from the home page to `page`, through every ancestor path that is a page. */
export function breadcrumbJsonLd(pages: readonly ReleasePage[], page: ReleasePage, origin: string, basePath = ""): Record<string, unknown> | null {
  if (page.path === "/") return null;
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const trail: ReleasePage[] = [];
  const home = byPath.get("/");
  if (home) trail.push(home);
  const segments = page.path.split("/").filter(Boolean);
  for (let i = 1; i <= segments.length; i++) {
    const ancestor = byPath.get(`/${segments.slice(0, i).join("/")}`);
    if (ancestor) trail.push(ancestor);
  }
  if (trail.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.doc.root.props.title,
      item: absoluteUrl(origin, basePath, p.path),
    })),
  };
}

/**
 * JSON for a `<script type="application/ld+json">` (or any JSON inside HTML):
 * `<`, `>`, `&` and the line separators are escaped as `\uXXXX`, so stored
 * text can never close the script element or open a comment.
 */
export function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ── sitemap.xml and robots.txt ──────────────────────────────────────────────

export function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

export interface SitemapInput {
  site: SiteDoc;
  pages: readonly ReleasePage[];
  origin: string;
  basePath?: string;
  /** The release's publish time, as every page's `lastmod`. */
  lastModified?: string | null;
}

/** sitemap.xml: every indexable page (not `noindex`, not one whose canonical points elsewhere). */
export function sitemapXml({ site, pages, origin, basePath = "", lastModified }: SitemapInput): string {
  const urls = site.seo.noindex
    ? []
    : pages
        .filter((p) => !p.doc.seo?.noindex && !p.doc.seo?.canonical)
        .sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)))
        .map((p) => {
          const loc = `<loc>${escapeXml(absoluteUrl(origin, basePath, p.path))}</loc>`;
          const mod = lastModified ? `<lastmod>${escapeXml(new Date(lastModified).toISOString())}</lastmod>` : "";
          return `<url>${loc}${mod}</url>`;
        });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`;
}

export interface RobotsInput {
  origin: string;
  basePath?: string;
  /** `Disallow: /` for everyone: a site that is `noindex`, or a preview. */
  disallowAll?: boolean;
}

export function robotsTxt({ origin, basePath = "", disallowAll = false }: RobotsInput): string {
  const lines = ["User-agent: *", disallowAll ? "Disallow: /" : "Allow: /"];
  if (!disallowAll) lines.push("", `Sitemap: ${absoluteUrl(origin, basePath, "/sitemap.xml")}`);
  return `${lines.join("\n")}\n`;
}

// ── Redirects ───────────────────────────────────────────────────────────────

/**
 * The redirects after a page moves from `from` to `to`: a permanent redirect
 * from the old path, earlier redirects to the old path pointed straight at
 * the new one (no chains), and any redirect away from the new path dropped
 * (a page lives there now). A move back undoes the earlier redirect.
 */
export function redirectsAfterMove(redirects: readonly Redirect[], from: string, to: string): Redirect[] {
  if (from === to) return [...redirects];
  const next = redirects
    .filter((r) => r.from !== to && r.from !== from)
    .map((r) => (r.to === from ? { ...r, to } : r))
    .filter((r) => r.from !== r.to);
  next.push({ from, to, status: 301 });
  return next;
}

/** The redirect for a request path, if any (exact match on the normalised path). */
export function matchRedirect(redirects: readonly Redirect[], path: string): Redirect | undefined {
  return redirects.find((r) => r.from === path && isSafeHref(r.to));
}
