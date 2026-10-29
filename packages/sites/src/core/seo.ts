/**
 * SEO: a page's meta tags (title, description, canonical, robots, Open Graph,
 * Twitter), sitemap.xml, robots.txt, JSON-LD (Organization, WebSite,
 * BreadcrumbList), and the redirects a page move leaves behind.
 *
 * Canonical and absolute URLs are built from `origin`, the site's primary
 * address, which the host passes in. Nothing here reads a request's Host.
 */
import type { LivePost, PostSummary } from "./posts";
import { richTextPlain } from "./posts";
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
  /** The page is a blog post: Open Graph says `article`, with its dates. */
  article?: { publishedTime: string; modifiedTime?: string; author?: string; section?: string };
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
 * The page's title with the site's template (`%s · Riverside Works`), so every
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
export function pageMeta({ site, page, origin, basePath = "", preview = false, article }: PageMetaInput): PageMeta {
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
  if (article) {
    openGraph["og:type"] = "article";
    openGraph["article:published_time"] = new Date(article.publishedTime).toISOString();
    if (article.modifiedTime) openGraph["article:modified_time"] = new Date(article.modifiedTime).toISOString();
    if (article.author) openGraph["article:author"] = article.author;
    if (article.section) openGraph["article:section"] = article.section;
  }
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

/** An ISO date, or null when the value isn't a date (a stored row that skipped the checks). */
function isoDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Text for a feed, or undefined when the value isn't text. */
const textOf = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

/** The URL of a post: `<post page path>/<slug>`. */
export function postPath(postsPath: string, slug: string): string {
  return `${postsPath === "/" ? "" : postsPath}/${slug}`;
}

/** `Article` JSON-LD for a blog post. */
export function articleJsonLd(site: SiteDoc, post: LivePost, url: string, origin: string, basePath = ""): Record<string, unknown> {
  const d = post.doc;
  const org = site.seo.organization;
  const publisher: Record<string, unknown> = { "@type": "Organization", name: org?.name ?? site.name, url: absoluteUrl(origin, basePath, "/") };
  if (org?.logo) publisher.logo = { "@type": "ImageObject", url: org.logo.startsWith("/") ? absoluteUrl(origin, basePath, org.logo) : org.logo };
  const description = d.excerpt ?? d.seo?.description;
  const image = imageUrl(d.cover ?? d.seo?.ogImage, origin, basePath);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: d.title.slice(0, 110),
    ...(description ? { description } : {}),
    ...(image ? { image: [image] } : {}),
    datePublished: new Date(post.publishedAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    author: d.author
      ? { "@type": "Person", name: d.author.name, ...(d.author.url && isSafeHref(d.author.url) ? { url: d.author.url.startsWith("/") ? absoluteUrl(origin, basePath, d.author.url) : d.author.url } : {}) }
      : { "@type": "Organization", name: org?.name ?? site.name },
    publisher,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(d.category ? { articleSection: d.category } : {}),
    ...(d.tags?.length ? { keywords: d.tags.join(", ") } : {}),
    inLanguage: site.lang,
  };
}

export interface RssInput {
  site: SiteDoc;
  /** Published posts, newest first. */
  posts: readonly PostSummary[];
  /** The post page's path (`/blog`). */
  postsPath: string;
  /** Its title, the feed's (default: the site's name). */
  title?: string;
  origin: string;
  basePath?: string;
  /** The most items (default 20). */
  limit?: number;
}

/** The blog's RSS 2.0 feed: the newest posts, with their excerpts. */
export function rssXml({ site, posts, postsPath, title, origin, basePath = "", limit = 20 }: RssInput): string {
  const link = absoluteUrl(origin, basePath, postsPath);
  const self = absoluteUrl(origin, basePath, "/rss.xml");
  // A post whose stored fields aren't what they should be is left out, not the whole feed.
  const usable = posts.filter((p) => !p.noindex && textOf(p.title) && textOf(p.slug) && isoDate(p.publishedAt));
  const items = usable.slice(0, limit).map((p) => {
    const url = absoluteUrl(origin, basePath, postPath(postsPath, p.slug));
    const excerpt = textOf(p.excerpt);
    const category = textOf(p.category);
    const author = textOf(p.author?.name);
    return [
      "<item>",
      `<title>${escapeXml(p.title)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `<pubDate>${new Date(isoDate(p.publishedAt)!).toUTCString()}</pubDate>`,
      excerpt ? `<description>${escapeXml(excerpt)}</description>` : "",
      category ? `<category>${escapeXml(category)}</category>` : "",
      author ? `<dc:creator>${escapeXml(author)}</dc:creator>` : "",
      "</item>",
    ].join("");
  });
  const newest = usable[0];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>` +
    `<title>${escapeXml(title ?? site.name)}</title>` +
    `<link>${escapeXml(link)}</link>` +
    `<description>${escapeXml(site.seo.description ?? `Posts from ${site.name}`)}</description>` +
    `<language>${escapeXml(site.lang)}</language>` +
    `<atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>` +
    (newest ? `<lastBuildDate>${new Date(isoDate(newest.updatedAt) ?? isoDate(newest.publishedAt)!).toUTCString()}</lastBuildDate>` : "") +
    `${items.join("")}</channel></rss>\n`
  );
}

/** A post's description for a feed or a page with no excerpt: its first words. */
export const postDescription = (doc: LivePost["doc"]): string | undefined => doc.excerpt ?? doc.seo?.description ?? (richTextPlain(doc.body, 200) || undefined);

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
  /** The blog: its post page's path and the published posts (each with its own `lastmod`). */
  posts?: { path: string; items: readonly PostSummary[] };
}

/** sitemap.xml: every indexable page (not `noindex`, not one whose canonical points elsewhere). */
export function sitemapXml({ site, pages, origin, basePath = "", lastModified, posts }: SitemapInput): string {
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
  const blogPage = posts ? pages.find((p) => p.path === posts.path) : undefined;
  if (posts && !site.seo.noindex && blogPage && !blogPage.doc.seo?.noindex) {
    for (const p of posts.items) {
      if (p.noindex) continue;
      const mod = isoDate(p.updatedAt) ?? isoDate(p.publishedAt);
      urls.push(`<url><loc>${escapeXml(absoluteUrl(origin, basePath, postPath(posts.path, p.slug)))}</loc>${mod ? `<lastmod>${escapeXml(mod)}</lastmod>` : ""}</url>`);
    }
  }
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
