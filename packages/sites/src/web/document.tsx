/**
 * SiteRenderer: one page of a release as a whole HTML document. Server-only
 * output: it is rendered to a string or stream and never hydrated. The only
 * script is the islands loader, and only on a page with a phone menu or a
 * form.
 */
import * as React from "react";
import { passThroughImageUrl, type ImageUrlBuilder } from "@marktiderman/genesis-media";
import "../sections/index";
import type { PostsContext, RenderContext } from "../core/registry";
import { getSection } from "../core/registry";
import { migrateNode } from "../core/migrate";
import type { ReleasePage, ReleaseSnapshot, SectionNode } from "../core/schemas";
import { absoluteUrl, articleJsonLd, breadcrumbJsonLd, organizationJsonLd, pageMeta, safeJsonForHtml, websiteJsonLd } from "../core/seo";
import { fontFileKey, LATIN_UNICODE_RANGE } from "../core/fonts";
import { themeCss, type FontInfo, type SiteTheme } from "../core/theme";
import type { ResolvedForm } from "../core/forms";
import { formDrawMode } from "../sections/form-embed";

export interface SiteAssets {
  /** The shared stylesheet. */
  css: string;
  /** The form stylesheet, linked only on pages with a form. */
  formsCss: string;
  /** The islands loader. */
  islands: string;
  /**
   * A font file's URL by its key (`inter-700`, see `fontFileKey`), or null
   * when it isn't served. Without it the page names its fonts but loads no
   * files, so a visitor sees an installed font or the stack's fallback.
   */
  font?: (key: string) => string | null;
}

export interface SiteRendererProps {
  snapshot: ReleaseSnapshot;
  /** The page to render, or null for the site's "not found" page. */
  page: ReleasePage | null;
  theme: SiteTheme;
  /** The site's primary origin, for canonical and Open Graph URLs. */
  origin: string;
  /** The path prefix the site is served under (`""` at the root). */
  basePath?: string;
  mode?: "live" | "preview";
  logo?: { src: string; alt: string };
  /** Forms on the page, already resolved (see `collectFormSlugs`). */
  forms?: ReadonlyMap<string, ResolvedForm | null>;
  /** Asset URLs. */
  assets: SiteAssets;
  /**
   * The blog, when the site has a post page: its path, the posts, the post
   * this page shows (`page` is then that post on the post page) and the
   * list's page number.
   */
  posts?: PostsContext;
  /** Builds each image's `srcset` (genesis-media). Default pass-through: every image at its own URL. */
  imageUrl?: ImageUrlBuilder;
}

/** A URL made safe to print inside `url("...")` in a `<style>`. */
const cssUrl = (url: string) => url.replace(/["\\<>\n\r{};]/g, "");

/** The weight a heading draws in (bold, else the heaviest below it, else the lightest): the file a page preloads. */
function headingWeight(font: FontInfo): number | undefined {
  const atMost = font.weights.filter((w) => w <= 700);
  return atMost.length ? Math.max(...atMost) : font.weights[0];
}

/**
 * The `@font-face` rules for a theme's fonts, from files this package serves
 * (`font-display: swap`, the latin subset), and the heading font's file to
 * preload. A face with one weight is declared for every weight, so a bold
 * heading draws it as it is instead of a faux bold.
 *
 * @stability Beta
 */
export function fontFaces(theme: Pick<SiteTheme, "fonts" | "headingFont">, fontUrl: ((key: string) => string | null) | undefined): { css: string; preload: string[] } {
  if (!fontUrl) return { css: "", preload: [] };
  const rules: string[] = [];
  for (const font of theme.fonts) {
    if (!font.family) continue;
    for (const weight of font.weights) {
      const url = fontUrl(fontFileKey(font.id, weight));
      if (!url) continue;
      rules.push(
        `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${font.weights.length === 1 ? "100 900" : weight};font-display:swap;src:url("${cssUrl(url)}") format("woff2");unicode-range:${LATIN_UNICODE_RANGE}}`,
      );
    }
  }
  const heading = theme.headingFont?.family ? theme.headingFont : undefined;
  const weight = heading ? headingWeight(heading) : undefined;
  const preload = heading && weight !== undefined ? fontUrl(fontFileKey(heading.id, weight)) : null;
  return { css: rules.join("\n"), preload: preload ? [preload] : [] };
}

/** The page's one inline `<style>`: its font faces, then the theme's variables. The Content-Security-Policy pins its hash. */
export function pageStyleText(theme: SiteTheme, fontUrl: ((key: string) => string | null) | undefined): string {
  const { css } = fontFaces(theme, fontUrl);
  return css ? `${css}\n${themeCss(theme)}` : themeCss(theme);
}

const FORM_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** The form slugs a page uses, to resolve before rendering: well-formed slugs of visible form embeds in the page body. */
export function collectFormSlugs(_snapshot: ReleaseSnapshot, page: ReleasePage | null): string[] {
  const slugs = new Set<string>();
  for (const n of page?.doc.content ?? []) {
    if (n.type === "form-embed" && !n.hidden && typeof n.props.form === "string" && FORM_SLUG.test(n.props.form)) slugs.add(n.props.form);
  }
  return [...slugs];
}

interface Rendered {
  key: string;
  element: React.ReactNode;
  type: string;
}

function renderNodes(nodes: readonly SectionNode[], base: Omit<RenderContext, "headingLevel" | "idPrefix">, h1: { given: boolean }, where: "header" | "body" | "footer"): Rendered[] {
  const out: Rendered[] = [];
  for (const raw of nodes) {
    if (raw.hidden) continue;
    if (raw.hideOn?.includes("mobile") && raw.hideOn.includes("desktop")) continue;
    const { node, issues } = migrateNode(raw);
    if (!node) {
      for (const issue of issues) console.error(`[genesis-sites] ${base.pagePath}: ${issue.message}`);
      continue;
    }
    const def = getSection(node.type)!;
    // The publish check refuses a section out of its place; a document that skipped it renders without it.
    if ((def.placement ?? "body") !== where) {
      console.error(`[genesis-sites] ${base.pagePath}: section ${node.id} (${node.type}) belongs in the ${def.placement ?? "body"}, not the ${where}; left out.`);
      continue;
    }
    const headingLevel: 1 | 2 = def.providesH1 && !h1.given ? 1 : 2;
    if (headingLevel === 1) h1.given = true;
    const ctx: RenderContext = { ...base, headingLevel, idPrefix: `gs-${node.id}` };
    try {
      const element = def.render({ props: node.props, variant: node.variant, node, ctx });
      // A section with nothing to show (the post section on the blog's index) gives the h1 back.
      if (element === null || element === undefined || element === false) {
        if (headingLevel === 1) h1.given = false;
        continue;
      }
      out.push({ key: node.id, type: node.type, element });
    } catch (err) {
      if (headingLevel === 1) h1.given = false;
      console.error(`[genesis-sites] ${base.pagePath}: section ${node.id} (${node.type}) failed to render and was left out.`, err);
    }
  }
  return out;
}

function hrefFor(basePath: string) {
  const base = basePath.replace(/\/+$/, "");
  return (href: string) => {
    if (!href.startsWith("/") || href.startsWith("//")) return href;
    if (!base) return href;
    // The home page under a base path is `/base/`, as its canonical URL is.
    return href === "/" ? `${base}/` : `${base}${href}`;
  };
}

/**
 * The document for one page.
 *
 * @stability Beta
 */
export function SiteRenderer({ snapshot, page, theme, origin, basePath = "", mode = "live", logo, forms = new Map(), assets, posts, imageUrl = passThroughImageUrl }: SiteRendererProps) {
  const site = snapshot.site;
  const preview = mode === "preview";
  const path = page?.path ?? "/404";
  const base: Omit<RenderContext, "headingLevel" | "idPrefix"> = {
    site: { name: site.name, lang: site.lang, nav: site.nav, logo },
    pagePath: path,
    href: hrefFor(basePath),
    forms,
    mode,
    ...(posts ? { posts } : {}),
    // One per render: the page's first large image takes the high priority, the rest load lazily.
    media: { imageUrl, firstLarge: { claimed: false } },
  };
  const chrome = !page?.doc.root.props.hideSiteChrome;
  const h1 = { given: false };
  const header = chrome ? renderNodes(site.header, base, { given: true }, "header") : [];
  const body = page ? renderNodes(page.doc.content, base, h1, "body") : [];
  const footer = chrome ? renderNodes(site.footer, base, { given: true }, "footer") : [];
  // Light forms need only the islands loader; a form that needs the engine also gets the form stylesheet and bundle.
  const formModes = body.some((r) => r.type === "form-embed") ? [...forms.values()].map(formDrawMode) : [];
  const hasForm = formModes.includes("light") || formModes.includes("island");
  const hasFormBundle = formModes.includes("island");
  const hasMenu = header.some((r) => r.type === "nav") && site.nav.length > 0;
  // A section that asks for the loader (a click-to-load map).
  const hasIsland = body.some((r) => getSection(r.type)?.islands === true);
  const post = posts?.current ?? null;

  const meta = page
    ? pageMeta({
        site,
        page,
        origin,
        basePath,
        preview,
        ...(post ? { article: { publishedTime: post.publishedAt, modifiedTime: post.updatedAt, ...(post.doc.author ? { author: post.doc.author.name } : {}), ...(post.doc.category ? { section: post.doc.category } : {}) } } : {}),
      })
    : { title: `Page not found · ${site.name}`, canonical: "", robots: "noindex, nofollow", openGraph: {}, twitter: {} as Record<string, string> };
  const jsonLd: Record<string, unknown>[] = [];
  if (page && !preview) {
    if (page.path === "/") jsonLd.push(organizationJsonLd(site, origin, basePath), websiteJsonLd(site, origin, basePath));
    if (post) jsonLd.push(articleJsonLd(site, post, meta.canonical || absoluteUrl(origin, basePath, page.path), origin, basePath));
    // A post's trail runs through the blog's index to the post itself.
    const crumbs = breadcrumbJsonLd(post ? [...snapshot.pages, page] : snapshot.pages, page, origin, basePath);
    if (crumbs) jsonLd.push(crumbs);
  }
  const fontPreloads = fontFaces(theme, assets.font).preload;

  return (
    <html lang={site.lang} data-gs-site="" {...(theme.colorScheme === "dark" ? { className: "dark" } : {})}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{meta.title}</title>
        {meta.description ? <meta name="description" content={meta.description} /> : null}
        <meta name="robots" content={meta.robots} />
        {meta.canonical ? <link rel="canonical" href={meta.canonical} /> : null}
        {Object.entries(meta.openGraph).map(([property, content]) => (
          <meta key={property} property={property} content={content} />
        ))}
        {Object.entries(meta.twitter).map(([name, content]) => (
          <meta key={name} name={name} content={content} />
        ))}
        {/* The heading font, from the site itself: it is in the first view, so it shouldn't wait for the stylesheet. */}
        {fontPreloads.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        <link rel="stylesheet" href={assets.css} />
        {hasFormBundle ? <link rel="stylesheet" href={assets.formsCss} /> : null}
        {/* The site's fonts and theme (CSS variables from the brand), after the shared stylesheet so they win. */}
        <style data-gs-theme="" dangerouslySetInnerHTML={{ __html: pageStyleText(theme, assets.font) }} />
        {jsonLd.map((data, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonForHtml(data) }} />
        ))}
        {posts ? <link rel="alternate" type="application/rss+xml" title={site.name} href={base.href("/rss.xml")} /> : null}
        {hasMenu || hasForm || hasIsland ? <script type="module" src={assets.islands} /> : null}
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <a
          href="#main"
          className="sr-only rounded-md bg-background px-4 py-3 font-medium text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:outline-2 focus:outline-ring"
        >
          Skip to content
        </a>
        {header.map((r) => (
          <React.Fragment key={r.key}>{r.element}</React.Fragment>
        ))}
        <main id="main" tabIndex={-1} className="outline-none">
          {page && !h1.given ? <h1 className="sr-only">{page.doc.root.props.title}</h1> : null}
          {page ? (
            body.map((r) => <React.Fragment key={r.key}>{r.element}</React.Fragment>)
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-24 text-center">
              <h1 className="font-display text-4xl font-bold tracking-tight">Page not found</h1>
              <p className="text-lg text-muted-foreground">There's no page at this address. It may have moved.</p>
              <a href={base.href("/")} className="inline-flex min-h-11 items-center rounded-md bg-primary px-6 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Go to the home page
              </a>
            </div>
          )}
        </main>
        {footer.map((r) => (
          <React.Fragment key={r.key}>{r.element}</React.Fragment>
        ))}
      </body>
    </html>
  );
}
