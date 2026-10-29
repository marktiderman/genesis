/**
 * handleSiteRequest: serve a site from a `Request`, as a `Response`, or say
 * "not mine" (null) so the host app answers instead.
 *
 * A site shares its hostname with the host app. The host resolves the
 * request's Host to a site id itself (this package keeps no hostname table
 * and reads no Host header) and calls this before its own routes:
 *
 *   const res = await handleSiteRequest(request, { store, brand, siteId, origin: "https://riverside.example" });
 *   if (res) return res;
 *   return app(request);
 *
 * Order: reserved paths (null), this package's assets, robots.txt and
 * sitemap.xml, redirects, the trailing-slash redirect, then the page. An
 * unknown path is null (or the site's 404 page, with `unknownPath:
 * "not-found"`). Pages render to HTML with no hydration.
 */
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import type { FormsResolver, ResolvedForm } from "../core/forms";
import { migrateNode, migratePage, migrateSite } from "../core/migrate";
import { PostSlug, postSummary, type LivePost, type PostSummary } from "../core/posts";
import { getSection, type PostsContext } from "../core/registry";
import { ReleaseSnapshot, parseSnapshot, type Release, type ReleasePage } from "../core/schemas";
import { matchRedirect, postDescription, robotsTxt, rssXml, sitemapXml } from "../core/seo";
import { formCacheTag, siteCacheTag, type SiteStore } from "../core/store";
import { brandDisplayName, siteTheme, type BrandSource, type SiteTheme } from "../core/theme";
import { DEFAULT_RESERVED_PATHS, isReservedPath, normalizeRequestPath, type ReservedPaths } from "../core/urls";
import { ASSETS, FONT_FILES } from "./assets.generated";
import { SiteRenderer, collectFormSlugs, pageStyleText } from "./document";

/** Where this package serves its own files, under the site's base path. Reserved for pages. */
export const ASSETS_PREFIX = "/_gs";

export interface SiteRequestOptions {
  /**
   * The live path needs only `getLive` (and, for a blog, `listLivePosts` and
   * `getLivePost`); preview needs the draft reads too (`listPosts` and
   * `getPost` for posts).
   */
  store: Pick<SiteStore, "getLive"> & Partial<Pick<SiteStore, "getDraft" | "listPages" | "getPageDraft" | "listLivePosts" | "getLivePost" | "listPosts" | "getPost" | "assetOrigin">>;
  brand: BrandSource;
  /** The site this request is for, resolved by the host from the Host header (or a path). */
  siteId: string;
  /**
   * `live` (default) serves the published release, cached at the CDN.
   * `preview` serves the drafts, `noindex` and `no-store`; the store must be
   * one signed in as the viewer, so the database's `can_view` decides who sees them.
   * Preview also needs `viewer`: without one it answers null before reading a draft.
   */
  mode?: "live" | "preview";
  /**
   * Preview only: the signed-in viewer's user id, as the host's session
   * resolved it. Drafts are never read for an anonymous request (anon has no
   * grant on them), so a preview without a viewer is null: the host decides
   * what to show (its sign-in page, say). Live ignores it.
   */
  viewer?: string | null;
  /**
   * The site's primary origin (`https://riverside.example`) for canonical,
   * Open Graph and sitemap URLs. Default: the request URL's origin. Pass it
   * whenever a site has more than one hostname, so every alias names the same
   * canonical address.
   */
  origin?: string;
  /** The path the site is mounted under (`/sites-demo`); `""` at the root. */
  basePath?: string;
  /** Paths that belong to the host app; null for them. Default `DEFAULT_RESERVED_PATHS`. */
  reserved?: ReservedPaths;
  /** Resolves a form embed's slug. Without it, form embeds render nothing (and log). */
  forms?: FormsResolver;
  /** Called with the cache tags of every cacheable response, for hosts that set their own cache headers. */
  onPublishedTags?: (tags: string[], info: { siteId: string; releaseId: string | null; path: string; status: number }) => void;
  /** An unknown path: `fall-through` (default) returns null; `not-found` serves the site's 404 page. */
  unknownPath?: "fall-through" | "not-found";
  /**
   * The site's font files, served by this package under `/_gs/` (default
   * true). `false` loads none: a visitor sees an installed font or the
   * stack's fallback. Fonts never load from a third party.
   */
  fonts?: boolean;
  /** A Content-Security-Policy header (default true). */
  csp?: boolean;
  /**
   * Origins a site on `images: "own"` may load images from, besides itself
   * and the store's `assetOrigin`. Pass the same origins as the publish's
   * `assetOrigins`, so what the check allowed the page can load.
   */
  assetOrigins?: readonly string[];
}

const LIVE_CACHE = "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400";
const MISS_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const PREVIEW_CACHE = "private, no-store";
const ASSET_CACHE = "public, max-age=31536000, immutable";

const enc = new TextEncoder();

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Where a page's images may load from. A site on `images: "own"` loads only
 * from itself and the asset origins (the store's, and any the host names);
 * any other site from any https host. An asset origin may be http (a local
 * Supabase), as the publish check accepts it.
 */
function imageSources(snapshot: ReleaseSnapshot, assetOrigins: readonly (string | undefined)[]): string {
  if (snapshot.site.images !== "own") return "'self' https: data:";
  const own = new Set<string>();
  for (const value of assetOrigins) {
    if (!value) continue;
    try {
      const u = new URL(value);
      if (u.protocol === "https:" || u.protocol === "http:") own.add(u.origin);
      else console.error(`[genesis-sites] the asset origin ${value} isn't http(s); images there will be blocked.`);
    } catch {
      console.error(`[genesis-sites] the asset origin ${value} isn't a URL; images there will be blocked.`);
    }
  }
  return ["'self'", "data:", ...own].join(" ");
}

async function contentSecurityPolicy(styleText: string, forms: ReadonlyMap<string, ResolvedForm | null>, imgSrc: string, sectionFrames: readonly string[] = []): Promise<string> {
  const connect = new Set(["'self'"]);
  // A light form posts natively when script is off, so its endpoint is a form target too.
  const formTargets = new Set(["'self'"]);
  const frames = new Set<string>();
  // Origins a section frames (a map), as the section builds them: https origins only.
  for (const f of sectionFrames) {
    const o = originOf(f);
    if (o && o === f) frames.add(o);
  }
  for (const form of forms.values()) {
    if (form?.kind === "definition") {
      const o = originOf(form.submitUrl);
      if (o) {
        connect.add(o);
        formTargets.add(o);
      }
    } else if (form?.kind === "embed") {
      const o = originOf(form.url);
      if (o) frames.add(o);
    }
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self' 'sha256-${await sha256Base64(styleText)}'`,
    // Inline style attributes: an image's focal point, a frame's height, the form's own.
    "style-src-attr 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self'",
    `connect-src ${[...connect].join(" ")}`,
    `frame-src ${frames.size ? [...frames].join(" ") : "'none'"}`,
    `form-action ${[...formTargets].join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

function textResponse(body: string, status: number, type: string, headers: Record<string, string>, head: boolean): Response {
  return new Response(head ? null : body, { status, headers: { "content-type": type, "x-content-type-options": "nosniff", ...headers } });
}

const FONT_NAMES = new Set(Object.values(FONT_FILES));
const fontCache = new Map<string, Uint8Array<ArrayBuffer>>();

/** A font file's bytes. The bodies (about 1 MB of base64) load on the first font request, never for a page. */
async function fontBody(name: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const cached = fontCache.get(name);
  if (cached) return cached;
  let bodies: Readonly<Record<string, string>>;
  try {
    bodies = (await import("./fonts.generated")).FONT_BODIES;
  } catch (err) {
    console.error(`[genesis-sites] the font files couldn't be loaded; ${name} is served as not found.`, err);
    return null;
  }
  const base64 = bodies[name];
  if (!base64) {
    console.error(`[genesis-sites] the font file ${name} is listed but has no body; rebuild the assets.`);
    return null;
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  fontCache.set(name, bytes);
  return bytes;
}

/** The drafts as a snapshot, for preview: migrated, unchecked. */
async function draftSnapshot(store: SiteRequestOptions["store"], siteId: string): Promise<ReleaseSnapshot | null> {
  if (!store.getDraft || !store.listPages || !store.getPageDraft) {
    throw new Error("handleSiteRequest: preview needs a store with getDraft, listPages and getPageDraft.");
  }
  const draft = await store.getDraft(siteId);
  if (!draft) return null;
  const metas = await store.listPages(siteId);
  const pages: ReleasePage[] = [];
  for (const meta of metas) {
    const p = await store.getPageDraft(meta.id);
    if (p) pages.push({ id: meta.id, path: p.path, kind: p.kind, doc: migratePage(p.doc).doc });
  }
  const parsed = ReleaseSnapshot.safeParse({ schemaVersion: 1, site: migrateSite(draft.site).site, pages });
  if (!parsed.success) {
    console.error(`[genesis-sites] the drafts of site ${siteId} don't form a valid site: ${parsed.error.message}`);
    return null;
  }
  return parsed.data;
}

/** The `?page=` of a post list: a whole number from 1 (1 when absent or nonsense). */
function listPage(url: URL): number {
  const n = Number(url.searchParams.get("page") ?? "1");
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
}

const PREVIEW_POSTS = 60;

/** Published posts (live), or every post's draft (preview, newest first, at most 60). */
async function blogPosts(store: SiteRequestOptions["store"], siteId: string, preview: boolean): Promise<PostSummary[] | null> {
  if (!preview) {
    if (!store.listLivePosts) {
      console.error(`[genesis-sites] site ${siteId} has a post page, but the store can't list posts (listLivePosts); the blog shows none.`);
      return null;
    }
    try {
      return await store.listLivePosts(siteId);
    } catch (err) {
      // One failed read leaves the list empty; the page around it still serves.
      console.error(`[genesis-sites] reading the published posts of site ${siteId} failed; the blog shows none.`, err);
      return null;
    }
  }
  if (!store.listPosts || !store.getPost) {
    console.error(`[genesis-sites] site ${siteId} has a post page, but the store can't read post drafts (listPosts, getPost) for the preview.`);
    return null;
  }
  const out: PostSummary[] = [];
  for (const meta of (await store.listPosts(siteId)).slice(0, PREVIEW_POSTS)) {
    const draft = await store.getPost(meta.id);
    if (draft) out.push(postSummary({ slug: draft.slug, publishedAt: draft.publishedAt ?? draft.updatedAt, updatedAt: draft.updatedAt, doc: draft.doc }));
  }
  return out;
}

/** One post: its published copy (live) or its draft (preview). */
async function blogPost(store: SiteRequestOptions["store"], siteId: string, slug: string, preview: boolean): Promise<LivePost | null> {
  if (!preview) {
    if (!store.getLivePost) return null;
    try {
      return await store.getLivePost(siteId, slug);
    } catch (err) {
      // A failed read is the post not found (the site's 404), not a broken page.
      console.error(`[genesis-sites] reading the published post ${JSON.stringify(slug)} of site ${siteId} failed; answering not found.`, err);
      return null;
    }
  }
  if (!store.listPosts || !store.getPost) return null;
  const meta = (await store.listPosts(siteId)).find((p) => p.slug === slug);
  const draft = meta ? await store.getPost(meta.id) : null;
  return draft ? { slug: draft.slug, publishedAt: draft.publishedAt ?? draft.updatedAt, updatedAt: draft.updatedAt, doc: draft.doc } : null;
}

/** The post page, standing in for one post: the post's title and SEO on the template's sections. */
function postAsPage(template: ReleasePage, post: LivePost, path: string): ReleasePage {
  const d = post.doc;
  const description = (d.seo?.description ?? postDescription(d))?.slice(0, 200);
  const ogImage = d.seo?.ogImage ?? d.cover;
  const seo = {
    ...(d.seo?.title ? { title: d.seo.title } : {}),
    ...(description ? { description } : {}),
    ...(ogImage ? { ogImage } : {}),
    ...(d.seo?.canonical ? { canonical: d.seo.canonical } : {}),
    ...(d.seo?.noindex || template.doc.seo?.noindex ? { noindex: true } : {}),
  };
  return { ...template, path, doc: { ...template.doc, root: { props: { ...template.doc.root.props, title: d.title.slice(0, 120) } }, seo } };
}

/** Percent-encode what a header can't carry (anything outside printable ASCII), leaving existing escapes alone. */
const headerSafe = (value: string) => value.replace(/[^\x21-\x7e]/gu, (c) => encodeURIComponent(c));

/** A redirect's Location: a site path or fragment under the base path, or an absolute URL. */
function redirectLocation(to: string, basePath: string): string {
  if (to.startsWith("#")) return headerSafe(`${basePath}/${to}`);
  if (to.startsWith("/")) return headerSafe(to === "/" ? `${basePath}/` : `${basePath}${to}`);
  try {
    return new URL(to).href;
  } catch {
    return headerSafe(`${basePath}/`);
  }
}

/**
 * Serve a site request, or return null when the request isn't the site's.
 *
 * @stability Beta
 */
export async function handleSiteRequest(request: Request, options: SiteRequestOptions): Promise<Response | null> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  const head = method === "HEAD";
  const url = new URL(request.url);
  const basePath = (options.basePath ?? "").replace(/\/+$/, "");
  const reserved = options.reserved ?? DEFAULT_RESERVED_PATHS;
  const mode = options.mode ?? "live";
  const preview = mode === "preview";

  if (basePath && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return null;
  const rawPath = url.pathname.slice(basePath.length) || "/";

  // This package's own files: content-hashed, immutable.
  if (rawPath.startsWith(`${ASSETS_PREFIX}/`)) {
    const name = rawPath.slice(ASSETS_PREFIX.length + 1);
    if (FONT_NAMES.has(name)) {
      const body = await fontBody(name);
      if (body) return new Response(head ? null : body, { status: 200, headers: { "content-type": "font/woff2", "x-content-type-options": "nosniff", "cache-control": ASSET_CACHE, "access-control-allow-origin": "*" } });
    }
    const asset = Object.values(ASSETS).find((a) => a.name === name);
    if (!asset) return textResponse("Not found\n", 404, "text/plain; charset=utf-8", { "cache-control": "no-store" }, head);
    return textResponse(asset.body, 200, asset.type, { "cache-control": ASSET_CACHE, "access-control-allow-origin": "*" }, head);
  }

  const path = normalizeRequestPath(rawPath);
  if (path === null) return null;
  if (isReservedPath(path, reserved)) return null;

  // Preview reads drafts, which only a signed-in viewer may: anonymous, the host answers.
  if (preview && !options.viewer) return null;

  // The release (live) or the drafts (preview).
  let snapshot: ReleaseSnapshot | null;
  let release: Release | null = null;
  if (preview) {
    snapshot = await draftSnapshot(options.store, options.siteId);
  } else {
    release = await options.store.getLive(options.siteId);
    const id = release?.id;
    snapshot = release ? parseSnapshot(release.snapshot, (m) => console.error(`[genesis-sites] release ${id} of site ${options.siteId}: ${m}`)) : null;
  }
  // Not published (or not visible): the host decides what this address shows.
  if (!snapshot) return null;

  const origin = (options.origin ?? url.origin).replace(/\/+$/, "");
  const tags = [siteCacheTag(options.siteId)];
  const cacheHeaders = (status: number, cache = LIVE_CACHE): Record<string, string> => {
    if (preview) return { "cache-control": PREVIEW_CACHE, "x-robots-tag": "noindex, nofollow" };
    options.onPublishedTags?.(tags, { siteId: options.siteId, releaseId: release?.id ?? null, path, status });
    return {
      "cache-control": cache,
      "vercel-cache-tag": tags.join(","),
      ...(release ? { "x-genesis-release": String(release.number) } : {}),
    };
  };

  if (path === "/robots.txt") {
    const disallowAll = preview || snapshot.site.seo.noindex === true;
    return textResponse(robotsTxt({ origin, basePath, disallowAll }), 200, "text/plain; charset=utf-8", cacheHeaders(200), head);
  }
  // The blog: the site's post page, at whose path the index lives and under which each post does.
  const postTemplate = snapshot.pages.find((p) => p.kind === "post") ?? null;
  if (path === "/sitemap.xml") {
    if (preview) return textResponse("Not found\n", 404, "text/plain; charset=utf-8", cacheHeaders(404), head);
    const items = postTemplate ? ((await blogPosts(options.store, options.siteId, false)) ?? []) : [];
    return textResponse(
      sitemapXml({ site: snapshot.site, pages: snapshot.pages, origin, basePath, lastModified: release?.publishedAt ?? null, ...(postTemplate ? { posts: { path: postTemplate.path, items } } : {}) }),
      200,
      "application/xml; charset=utf-8",
      cacheHeaders(200),
      head,
    );
  }
  if (path === "/rss.xml") {
    if (!postTemplate) return null;
    if (preview) return textResponse("Not found\n", 404, "text/plain; charset=utf-8", cacheHeaders(404), head);
    const items = snapshot.site.seo.noindex || postTemplate.doc.seo?.noindex ? [] : ((await blogPosts(options.store, options.siteId, false)) ?? []);
    return textResponse(rssXml({ site: snapshot.site, posts: items, postsPath: postTemplate.path, title: postTemplate.doc.root.props.title === snapshot.site.name ? undefined : `${postTemplate.doc.root.props.title} · ${snapshot.site.name}`, origin, basePath }), 200, "application/rss+xml; charset=utf-8", cacheHeaders(200), head);
  }

  // Redirects first: a moved page's old path.
  const redirect = matchRedirect(snapshot.site.redirects, path);
  if (redirect) {
    // A moved page keeps the link's query string (campaign parameters, say); an outside URL is used as written.
    const location = redirectLocation(redirect.to, basePath) + (redirect.to.startsWith("/") ? url.search : "");
    return new Response(null, { status: redirect.status, headers: { location, ...cacheHeaders(redirect.status) } });
  }
  let page = snapshot.pages.find((p) => p.path === path) ?? null;
  // A post: `<post page>/<slug>`, where no page is.
  let currentPost: LivePost | null = null;
  if (!page && postTemplate && path.startsWith(`${postTemplate.path === "/" ? "" : postTemplate.path}/`)) {
    const slug = path.slice(postTemplate.path.length + 1);
    if (PostSlug.safeParse(slug).success) {
      currentPost = await blogPost(options.store, options.siteId, slug, preview);
      if (currentPost) page = postAsPage(postTemplate, currentPost, path);
    }
  }
  // One address per page: lowercase, no trailing slash, and the home page under a base path
  // ends in one (`/base/`, as its canonical URL does). Only for the site's own pages, so the
  // host's paths (with their own casing or slashes) fall through untouched.
  const bareBase = Boolean(basePath) && url.pathname === basePath;
  if (page && (bareBase || (rawPath !== path && !(path === "/" && rawPath === "/")))) {
    const location = `${headerSafe(`${basePath}${path === "/" ? "/" : path}`)}${url.search}`;
    return new Response(null, { status: 308, headers: { location, ...cacheHeaders(308) } });
  }
  if (!page && (options.unknownPath ?? "fall-through") === "fall-through") return null;

  // Everything the page needs before it renders: the brand and its forms.
  const brand = await options.brand.getBrand(options.siteId);
  if (!brand) {
    console.error(`[genesis-sites] the BrandSource has no brand for site ${options.siteId}; rendering with Genesis's default theme.`);
  }
  const fallbackBrand = { name: snapshot.site.name, colors: { primary: "#4f46e5" } };
  let theme: SiteTheme;
  try {
    theme = siteTheme(brand ?? fallbackBrand, snapshot.site.theme);
  } catch (err) {
    console.error(`[genesis-sites] the brand for site ${options.siteId} can't make a theme (a colour that isn't #rrggbb?); rendering with Genesis's default theme.`, err);
    theme = siteTheme(fallbackBrand, snapshot.site.theme);
  }
  // The brand changed since the release was checked: its colours haven't passed the contrast
  // check. Serve it, but cache it briefly and say so; republishing checks it (and purges).
  const brandChanged = Boolean(release?.brandHash) && release!.brandHash !== theme.brandHash;
  if (brandChanged) {
    console.warn(`[genesis-sites] site ${options.siteId}: the brand changed since release ${release!.number} was checked; republish to check its colours. Caching this page for 5 minutes only.`);
  }
  const forms = new Map<string, ResolvedForm | null>();
  const slugs = collectFormSlugs(snapshot, page);
  if (slugs.length && !options.forms) console.error(`[genesis-sites] ${path} embeds forms (${slugs.join(", ")}) but handleSiteRequest has no forms resolver.`);
  for (const slug of slugs) {
    // A page caches the forms it was rendered with: the host purges `form:<slug>` when it changes one.
    tags.push(formCacheTag(slug));
    try {
      forms.set(slug, options.forms ? await options.forms(slug, { siteId: options.siteId, pagePath: path, mode }) : null);
    } catch (err) {
      console.error(`[genesis-sites] resolving the form "${slug}" failed.`, err);
      forms.set(slug, null);
    }
  }
  // The posts a page lists, read once: for a post list on it, or the post page itself.
  let posts: PostsContext | undefined;
  if (postTemplate && page) {
    const lists = page.doc.content.some((n) => !n.hidden && n.type === "blog-list");
    const list = lists ? await blogPosts(options.store, options.siteId, preview) : [];
    // The list and the post are separate: a store that can't list still shows a post it can read.
    posts = { path: postTemplate.path, list: list ?? [], current: currentPost, page: listPage(url) };
  }
  // Origins the page's sections frame (a map), for the Content-Security-Policy.
  const sectionFrames: string[] = [];
  for (const node of page?.doc.content ?? []) {
    if (node.hidden) continue;
    const def = getSection(node.type);
    if (!def?.frameOrigins) continue;
    const migrated = migrateNode(node).node;
    if (migrated) {
      try {
        sectionFrames.push(...def.frameOrigins(migrated.props));
      } catch (err) {
        console.error(`[genesis-sites] section ${node.id} (${node.type}) couldn't say what it frames.`, err);
      }
    }
  }
  const logo = brand && "logo" in brand && brand.logo ? { src: brand.logo.src, alt: brand.logo.alt?.trim() || brandDisplayName(brand) } : undefined;
  const assetUrl = (name: string) => `${basePath}${ASSETS_PREFIX}/${name}`;
  const fontUrl = options.fonts === false ? undefined : (key: string) => (FONT_FILES[key] ? assetUrl(FONT_FILES[key]) : null);

  const element = createElement(SiteRenderer, {
    snapshot,
    page,
    theme,
    origin,
    basePath,
    mode,
    ...(logo ? { logo } : {}),
    forms,
    assets: { css: assetUrl(ASSETS.css.name), formsCss: assetUrl(ASSETS.formsCss.name), islands: assetUrl(ASSETS.islands.name), ...(fontUrl ? { font: fontUrl } : {}) },
    ...(posts ? { posts } : {}),
  });
  let failed: unknown = null;
  const stream = await renderToReadableStream(element, {
    onError(err) {
      failed = err;
      console.error(`[genesis-sites] rendering ${path} of site ${options.siteId} failed.`, err);
    },
  });
  await stream.allReady;
  if (failed) return textResponse("This page couldn't be shown.\n", 500, "text/plain; charset=utf-8", { "cache-control": "no-store" }, head);

  const status = page ? 200 : 404;
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    ...cacheHeaders(status, page && !brandChanged ? LIVE_CACHE : MISS_CACHE),
  };
  if (options.csp !== false) headers["content-security-policy"] = await contentSecurityPolicy(pageStyleText(theme, fontUrl), forms, imageSources(snapshot, [options.store.assetOrigin, ...(options.assetOrigins ?? [])]), sectionFrames);
  return new Response(head ? null : stream, { status, headers });
}

/**
 * One page as an HTML string (tests, static export, the editor's preview frame).
 *
 * @stability Beta
 */
export async function renderSitePageToString(request: Request, options: SiteRequestOptions): Promise<{ status: number; html: string; headers: Headers } | null> {
  const res = await handleSiteRequest(request, options);
  if (!res) return null;
  return { status: res.status, html: await res.text(), headers: res.headers };
}
