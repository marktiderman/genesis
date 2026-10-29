/**
 * What the editor's panels do to a site, as plain functions over a
 * `SiteStore`: check and publish, add, move, delete and reorder pages, and
 * the page templates. No React, so each is tested against the memory store.
 */
import { PublishBlockedError, prepareRelease, type PublishOptions, type SiteStore } from "../core/store";
import type { SiteIssue } from "../core/a11y";
import type { PageDoc, PageKind, PageMeta, Release } from "../core/schemas";
import { exampleBrands } from "../core/examples";
import { landingPage, starterSite } from "../core/templates";
import type { BrandInput } from "../core/theme";
import { DEFAULT_RESERVED_PATHS, pagePathProblems, type ReservedPaths } from "../core/urls";

/** A store the editor can drive. `reorderPages` is optional: without it, page order is the store's. */
export type EditorSiteStore = SiteStore & {
  reorderPages?(siteId: string, pageIds: string[]): Promise<void>;
};

export interface SiteCheck {
  issues: SiteIssue[];
  /** No errors: the site can be published. */
  publishable: boolean;
}

/**
 * Run the publish checks on the drafts as they are now (accessibility,
 * contrast, placeholders, paths), without publishing: what the Publish
 * panel lists, errors first.
 *
 * @stability Beta
 */
export async function checkSite(store: SiteStore, siteId: string, options: Pick<PublishOptions, "brand" | "reserved"> = {}): Promise<SiteCheck> {
  const draft = await store.getDraft(siteId);
  if (!draft) return { publishable: false, issues: [{ severity: "error", code: "no-site", message: `There's no site ${siteId}, or you can't edit it.` }] };
  const metas = await store.listPages(siteId);
  // In parallel: on a remote store each read is a round trip.
  const drafts = await Promise.all(metas.map((meta) => store.getPageDraft(meta.id)));
  const pages: { id: string; path: string; kind: PageKind; doc: PageDoc }[] = [];
  drafts.forEach((p, i) => {
    if (p) pages.push({ id: metas[i]!.id, path: p.path, kind: p.kind, doc: p.doc });
  });
  let issues: SiteIssue[];
  try {
    issues = prepareRelease(draft.site, pages, {
      reserved: options.reserved ?? DEFAULT_RESERVED_PATHS,
      ...(options.brand ? { brand: options.brand } : {}),
      ...(store.assetOrigin ? { assetOrigins: [store.assetOrigin] } : {}),
    }).issues;
  } catch (err) {
    if (!(err instanceof PublishBlockedError)) {
      // A draft that doesn't even form a snapshot (a schema the store let through): report it, don't throw.
      issues = [{ severity: "error", code: "invalid-draft", message: `The drafts can't be checked: ${(err as Error).message}` }];
    } else issues = err.issues;
  }
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  return { issues: sorted, publishable: !sorted.some((i) => i.severity === "error") };
}

/** Publish after checking: a site with errors is refused before the store is asked. */
export async function publishSite(store: SiteStore, siteId: string, options: { brand: BrandInput; note?: string; reserved?: ReservedPaths }): Promise<{ release: Release } | { blocked: SiteIssue[] }> {
  const check = await checkSite(store, siteId, options);
  if (!check.publishable) return { blocked: check.issues };
  try {
    const release = await store.publish(siteId, { brand: options.brand, ...(options.note?.trim() ? { note: options.note.trim() } : {}), ...(options.reserved ? { reserved: options.reserved } : {}) });
    return { release };
  } catch (err) {
    if (err instanceof PublishBlockedError) return { blocked: err.issues };
    throw err;
  }
}

/** Why a path can't be a page's here (empty when it can): the pattern, reserved paths, and pages already there. */
export function pathProblems(path: string, pages: readonly Pick<PageMeta, "id" | "path">[], options: { reserved?: ReservedPaths; except?: string } = {}): string[] {
  const problems = pagePathProblems(path, options.reserved ?? DEFAULT_RESERVED_PATHS);
  if (pages.some((p) => p.path === path && p.id !== options.except)) problems.push(`A page is already at ${path}.`);
  return problems;
}

/** A page's title as a path segment: "Our classes" → "/our-classes". */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `/${slug || "page"}`;
}

/**
 * Move a page to a new address. The store writes a 301 from the old path
 * (and rewrites older redirects, so there are no chains). Refuses the home
 * page, reserved paths and a path another page has, before asking the store.
 */
export async function renamePage(store: SiteStore, pageId: string, path: string, options: { reserved?: ReservedPaths } = {}): Promise<PageMeta> {
  const current = await store.getPageDraft(pageId);
  if (!current) throw new Error("That page no longer exists.");
  if (current.path === "/") throw new Error("The home page stays at /.");
  const pages = await store.listPages(current.siteId);
  const problems = pathProblems(path, pages, { ...options, except: pageId });
  if (problems.length) throw new Error(problems.join(" "));
  return store.movePage(pageId, path);
}

/** A page a person can start from. */
export interface PageTemplate {
  id: string;
  label: string;
  description: string;
  kind: PageKind;
  doc(input: { title: string; brand: BrandInput }): PageDoc;
}

const blank = (title: string): PageDoc => ({ schemaVersion: 1, root: { props: { title } }, content: [] });

/**
 * The templates the Add page dialog offers: a blank page, the one-click
 * landing page from the brand, and each page of the starter site (about,
 * contact) after its home page.
 *
 * @stability Beta
 */
export function pageTemplates(): PageTemplate[] {
  const templates: PageTemplate[] = [
    { id: "blank", label: "Blank page", description: "Start empty and add sections.", kind: "page", doc: ({ title }) => blank(title) },
    {
      id: "landing",
      label: "Landing page from your brand",
      description: "A hero, what you offer, quotes and a call to action, in one click.",
      kind: "landing",
      doc: ({ title, brand }) => {
        const doc = landingPage({ brand, message: { headline: title } }).pages[0]!.doc;
        return { ...doc, root: { props: { ...doc.root.props, title } } };
      },
    },
  ];
  const starter = starterSite({ brand: exampleBrands.riverside, message: { headline: "Your headline" } });
  for (const page of starter.pages.slice(1)) {
    const name = page.doc.root.props.title;
    templates.push({
      id: `starter${page.path.replace(/\//g, "-")}`,
      label: `${name} page`,
      description: `The starter site's ${name.toLowerCase()} page.`,
      kind: page.kind,
      doc: ({ title, brand }) => {
        const fresh = starterSite({ brand, message: { headline: title } }).pages.find((p) => p.path === page.path)!.doc;
        return { ...fresh, root: { props: { ...fresh.root.props, title } } };
      },
    });
  }
  return templates;
}

/** Move one page up or down the list (through `reorderPages`, when the store has it). */
export async function movePageInList(store: EditorSiteStore, siteId: string, pageId: string, by: -1 | 1): Promise<PageMeta[]> {
  if (!store.reorderPages) throw new Error("This store keeps pages in its own order.");
  const pages = await store.listPages(siteId);
  const i = pages.findIndex((p) => p.id === pageId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= pages.length) return pages;
  const ids = pages.map((p) => p.id);
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await store.reorderPages(siteId, ids);
  return store.listPages(siteId);
}
