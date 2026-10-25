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
import { migratePage, migrateSite } from "../core/migrate";
import { ReleaseSnapshot, parseSnapshot, type Release, type ReleasePage } from "../core/schemas";
import { matchRedirect, robotsTxt, sitemapXml } from "../core/seo";
import { formCacheTag, siteCacheTag, type SiteStore } from "../core/store";
import { brandDisplayName, siteTheme, themeCss, type BrandSource, type FontInfo, type SiteTheme } from "../core/theme";
import { DEFAULT_RESERVED_PATHS, isReservedPath, normalizeRequestPath, type ReservedPaths } from "../core/urls";
import { ASSETS } from "./assets.generated";
import { SiteRenderer, collectFormSlugs, googleFontHref } from "./document";

/** Where this package serves its own files, under the site's base path. Reserved for pages. */
export const ASSETS_PREFIX = "/_gs";

export interface SiteRequestOptions {
  /** The live path needs only `getLive`; preview needs the draft reads too. */
  store: Pick<SiteStore, "getLive"> & Partial<Pick<SiteStore, "getDraft" | "listPages" | "getPageDraft">>;
  brand: BrandSource;
  /** The site this request is for, resolved by the host from the Host header (or a path). */
  siteId: string;
  /**
   * `live` (default) serves the published release, cached at the CDN.
   * `preview` serves the drafts, `noindex` and `no-store`; the store must be
   * one signed in as the viewer, so the database's `can_view` decides who sees them.
   */
  mode?: "live" | "preview";
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
  /** Font stylesheets: Google Fonts by default, `false` for none, or a function returning a URL per font. */
  fonts?: false | ((font: FontInfo) => string | null);
  /** A Content-Security-Policy header (default true). */
  csp?: boolean;
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

async function contentSecurityPolicy(styleText: string, forms: ReadonlyMap<string, ResolvedForm | null>, fonts: boolean): Promise<string> {
  const connect = new Set(["'self'"]);
  // A light form posts natively when script is off, so its endpoint is a form target too.
  const formTargets = new Set(["'self'"]);
  const frames = new Set<string>();
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
    `style-src 'self' 'sha256-${await sha256Base64(styleText)}'${fonts ? " https://fonts.googleapis.com" : ""}`,
    // Inline style attributes: an image's focal point, a frame's height, the form's own.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' https: data:",
    `font-src 'self'${fonts ? " https://fonts.gstatic.com" : ""}`,
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
    const asset = Object.values(ASSETS).find((a) => a.name === name);
    if (!asset) return textResponse("Not found\n", 404, "text/plain; charset=utf-8", { "cache-control": "no-store" }, head);
    return textResponse(asset.body, 200, asset.type, { "cache-control": ASSET_CACHE, "access-control-allow-origin": "*" }, head);
  }

  const path = normalizeRequestPath(rawPath);
  if (path === null) return null;
  if (isReservedPath(path, reserved)) return null;

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
  if (path === "/sitemap.xml") {
    if (preview) return textResponse("Not found\n", 404, "text/plain; charset=utf-8", cacheHeaders(404), head);
    return textResponse(sitemapXml({ site: snapshot.site, pages: snapshot.pages, origin, basePath, lastModified: release?.publishedAt ?? null }), 200, "application/xml; charset=utf-8", cacheHeaders(200), head);
  }

  // Redirects first: a moved page's old path.
  const redirect = matchRedirect(snapshot.site.redirects, path);
  if (redirect) {
    // A moved page keeps the link's query string (campaign parameters, say); an outside URL is used as written.
    const location = redirectLocation(redirect.to, basePath) + (redirect.to.startsWith("/") ? url.search : "");
    return new Response(null, { status: redirect.status, headers: { location, ...cacheHeaders(redirect.status) } });
  }
  const page = snapshot.pages.find((p) => p.path === path) ?? null;
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
  const logo = brand && "logo" in brand && brand.logo ? { src: brand.logo.src, alt: brand.logo.alt?.trim() || brandDisplayName(brand) } : undefined;
  const assetUrl = (name: string) => `${basePath}${ASSETS_PREFIX}/${name}`;
  const fontHref = options.fonts === false ? false : (options.fonts ?? googleFontHref);

  const element = createElement(SiteRenderer, {
    snapshot,
    page,
    theme,
    origin,
    basePath,
    mode,
    ...(logo ? { logo } : {}),
    forms,
    assets: { css: assetUrl(ASSETS.css.name), formsCss: assetUrl(ASSETS.formsCss.name), islands: assetUrl(ASSETS.islands.name) },
    fontHref,
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
  if (options.csp !== false) headers["content-security-policy"] = await contentSecurityPolicy(themeCss(theme), forms, fontHref !== false && theme.fonts.some((f) => f.google));
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
