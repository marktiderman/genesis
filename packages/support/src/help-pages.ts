/**
 * A public help center is pages on the app's site. Articles live with their tickets, by tenant, in
 * this package; genesis-sites has no tenants and a site is one published whole, so a tenant's
 * published articles become pages the app adds to that tenant's site and publishes as it does any
 * other page. The pages are genesis-sites' documents as plain data, so support doesn't import it.
 */
import type { HelpArticle, HelpCollection } from "./client";

export interface HelpCenterPage {
  path: string;
  kind: "page";
  doc: {
    schemaVersion: 1;
    root: { props: { title: string } };
    content: Array<{ id: string; type: "rich-text"; v: 1; variant: "narrow"; props: { heading?: string; body: { type: "doc"; content: Array<Record<string, unknown>> }; surface: "base" } }>;
    seo: { title: string; description?: string };
  };
}

export interface HelpCenterPagesInput {
  /** The tenant's collections, in their order. */
  collections: readonly HelpCollection[];
  /** Its articles, with their bodies. Anything not published is left out. */
  articles: readonly HelpArticle[];
  /** Where the help center goes on the site. Default `/help`. */
  basePath?: string;
  /** The index page's title. Default "Help center". */
  title?: string;
  /** The heading over articles in no collection. Default "Articles". */
  otherHeading?: string;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const text = (value: string) => ({ type: "text", text: value });

/** Plain text as rich text: a blank line parts paragraphs, a single line break stays one. */
export function helpArticleDoc(body: string): { type: "doc"; content: Array<Record<string, unknown>> } {
  const paragraphs = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: p.split("\n").flatMap((line, i) => (i === 0 ? [text(line)] : [{ type: "hardBreak" }, text(line)])),
    })),
  };
}

/** The index page and one page per published article, ready for a site's `createSite` or page saves. */
export function helpCenterPages({ collections, articles, basePath = "/help", title = "Help center", otherHeading = "Articles" }: HelpCenterPagesInput): HelpCenterPage[] {
  const base = basePath.replace(/\/$/, "");
  const published = articles.filter((a) => a.status === "published");
  const hrefOf = (a: HelpArticle) => `${base}/${a.slug}`;
  const list = (items: readonly HelpArticle[]) => ({
    type: "bulletList",
    content: items.map((a) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ ...text(a.title), marks: [{ type: "link", attrs: { href: hrefOf(a) } }] }] }],
    })),
  });
  const known = new Set(collections.map((c) => c.id));
  const groups: Array<{ heading: string; items: HelpArticle[] }> = collections.map((c) => ({ heading: c.title, items: published.filter((a) => a.collectionId === c.id) }));
  groups.push({ heading: otherHeading, items: published.filter((a) => !a.collectionId || !known.has(a.collectionId)) });
  const index: HelpCenterPage = {
    path: base || "/",
    kind: "page",
    doc: {
      schemaVersion: 1,
      root: { props: { title: clip(title, 120) } },
      content: [
        {
          id: "help-index",
          type: "rich-text",
          v: 1,
          variant: "narrow",
          props: {
            heading: clip(title, 90),
            body: { type: "doc", content: groups.filter((g) => g.items.length > 0).flatMap((g) => [{ type: "heading", attrs: { level: 2 }, content: [text(g.heading)] }, list(g.items)]) },
            surface: "base",
          },
        },
      ],
      seo: { title: clip(title, 70) },
    },
  };
  const pages = published.map(
    (a): HelpCenterPage => ({
      path: hrefOf(a),
      kind: "page",
      doc: {
        schemaVersion: 1,
        root: { props: { title: a.title } },
        content: [{ id: "help-article", type: "rich-text", v: 1, variant: "narrow", props: { heading: a.title, body: helpArticleDoc(a.body), surface: "base" } }],
        seo: { title: clip(a.title, 70), ...(a.summary ? { description: clip(a.summary, 200) } : {}) },
      },
    }),
  );
  return [index, ...pages];
}
