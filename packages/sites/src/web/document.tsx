/**
 * SiteRenderer: one page of a release as a whole HTML document. Server-only
 * output: it is rendered to a string or stream and never hydrated. The only
 * script is the islands loader, and only on a page with a phone menu or a
 * form.
 */
import * as React from "react";
import "../sections/index";
import type { RenderContext } from "../core/registry";
import { getSection } from "../core/registry";
import { migrateNode } from "../core/migrate";
import type { ReleasePage, ReleaseSnapshot, SectionNode } from "../core/schemas";
import { breadcrumbJsonLd, organizationJsonLd, pageMeta, safeJsonForHtml, websiteJsonLd } from "../core/seo";
import { themeCss, type FontInfo, type SiteTheme } from "../core/theme";
import type { ResolvedForm } from "../core/forms";

export interface SiteAssets {
  /** The shared stylesheet. */
  css: string;
  /** The form stylesheet, linked only on pages with a form. */
  formsCss: string;
  /** The islands loader. */
  islands: string;
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
  /** The stylesheet URL for a font, or null to rely on installed fonts. Default: Google Fonts. */
  fontHref?: ((font: FontInfo) => string | null) | false;
}

export const googleFontHref = (font: FontInfo): string | null =>
  font.google ? `https://fonts.googleapis.com/css2?family=${font.google}&display=swap` : null;

/** The form slugs a page uses, to resolve before rendering. */
export function collectFormSlugs(snapshot: ReleaseSnapshot, page: ReleasePage | null): string[] {
  const nodes = [...snapshot.site.header, ...(page?.doc.content ?? []), ...snapshot.site.footer];
  const slugs = new Set<string>();
  for (const n of nodes) if (n.type === "form-embed" && !n.hidden && typeof n.props.form === "string") slugs.add(n.props.form);
  return [...slugs];
}

interface Rendered {
  key: string;
  element: React.ReactNode;
  type: string;
}

function renderNodes(nodes: readonly SectionNode[], base: Omit<RenderContext, "headingLevel" | "idPrefix">, h1: { given: boolean }): Rendered[] {
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
    const headingLevel: 1 | 2 = def.providesH1 && !h1.given ? 1 : 2;
    if (headingLevel === 1) h1.given = true;
    const ctx: RenderContext = { ...base, headingLevel, idPrefix: `gs-${node.id}` };
    try {
      out.push({ key: node.id, type: node.type, element: def.render({ props: node.props, variant: node.variant, node, ctx }) });
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
    return href === "/" ? base : `${base}${href}`;
  };
}

/**
 * The document for one page.
 *
 * @stability Beta
 */
export function SiteRenderer({ snapshot, page, theme, origin, basePath = "", mode = "live", logo, forms = new Map(), assets, fontHref = googleFontHref }: SiteRendererProps) {
  const site = snapshot.site;
  const preview = mode === "preview";
  const path = page?.path ?? "/404";
  const base: Omit<RenderContext, "headingLevel" | "idPrefix"> = {
    site: { name: site.name, lang: site.lang, nav: site.nav, logo },
    pagePath: path,
    href: hrefFor(basePath),
    forms,
    mode,
  };
  const chrome = !page?.doc.root.props.hideSiteChrome;
  const h1 = { given: false };
  const header = chrome ? renderNodes(site.header, base, { given: true }) : [];
  const body = page ? renderNodes(page.doc.content, base, h1) : [];
  const footer = chrome ? renderNodes(site.footer, base, { given: true }) : [];
  const hasForm = body.some((r) => r.type === "form-embed") && [...forms.values()].some((f) => f?.kind === "definition");
  const hasMenu = header.some((r) => r.type === "nav") && site.nav.length > 0;

  const meta = page
    ? pageMeta({ site, page, origin, basePath, preview })
    : { title: `Page not found · ${site.name}`, canonical: "", robots: "noindex, nofollow", openGraph: {}, twitter: {} as Record<string, string> };
  const jsonLd: Record<string, unknown>[] = [];
  if (page && !preview) {
    if (page.path === "/") jsonLd.push(organizationJsonLd(site, origin, basePath), websiteJsonLd(site, origin, basePath));
    const crumbs = breadcrumbJsonLd(snapshot.pages, page, origin, basePath);
    if (crumbs) jsonLd.push(crumbs);
  }
  const fontLinks = fontHref ? theme.fonts.map(fontHref).filter((h): h is string => Boolean(h)) : [];

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
        {fontLinks.length ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            {fontLinks.map((href) => (
              <link key={href} rel="stylesheet" href={href} />
            ))}
          </>
        ) : null}
        <link rel="stylesheet" href={assets.css} />
        {hasForm ? <link rel="stylesheet" href={assets.formsCss} /> : null}
        {/* The site's theme: CSS variables from the brand, after the shared stylesheet so they win. */}
        <style data-gs-theme="" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
        {jsonLd.map((data, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonForHtml(data) }} />
        ))}
        {hasMenu || hasForm ? <script type="module" src={assets.islands} /> : null}
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
