/**
 * What the editor's panels do to a site, as plain functions over a
 * `SiteStore`: check and publish, add, move, delete and reorder pages, and
 * the page templates. No React, so each is tested against the memory store.
 */
import { PublishBlockedError, SiteConflictError, isConflict, prepareRelease, type PublishOptions, type SiteStore } from "../core/store";
import type { SiteIssue } from "../core/a11y";
import type { PageDoc, PageKind, PageMeta, Release } from "../core/schemas";
import { exampleBrands } from "../core/examples";
import { landingDirectory, landingDirectoryProblems, landingMoves, landingPath, landingSlugProblems } from "../core/landing";
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

/** A page's title as a path segment: "Our services" → "/our-services". */
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

/**
 * Move one page up or down the list (through `reorderPages`, when the store has it). `within`
 * limits the list being reordered (the Pages panel's own pages, not the landing pages): the page
 * swaps with the next one that passes it.
 */
export async function movePageInList(store: EditorSiteStore, siteId: string, pageId: string, by: -1 | 1, options: { within?: (page: PageMeta) => boolean } = {}): Promise<PageMeta[]> {
  if (!store.reorderPages) throw new Error("This store keeps pages in its own order.");
  const pages = await store.listPages(siteId);
  const i = pages.findIndex((p) => p.id === pageId);
  let j = i + by;
  if (options.within) while (j >= 0 && j < pages.length && !options.within(pages[j]!)) j += by;
  if (i < 0 || j < 0 || j >= pages.length) return pages;
  const ids = pages.map((p) => p.id);
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await store.reorderPages(siteId, ids);
  return store.listPages(siteId);
}

// ── Landing pages ─────────────────────────────────────────────────────────────

/**
 * Make a landing page: the brand's landing page template (kind `landing`) at
 * `<directory>/<slug>`, under the site's landing directory. It isn't added to
 * the menu. Refuses a slug, reserved path or taken address before asking the
 * store.
 *
 * @stability Beta
 */
export async function createLandingPage(store: SiteStore, siteId: string, input: { title: string; slug: string; brand: BrandInput; reserved?: ReservedPaths }): Promise<PageMeta> {
  const title = input.title.trim();
  if (!title) throw new Error("Give the landing page a title.");
  const draft = await store.getDraft(siteId);
  if (!draft) throw new Error(`There's no site ${siteId}, or you can't edit it.`);
  const directory = landingDirectory(draft.site);
  const path = landingPath(directory, input.slug);
  const problems = landingSlugProblems(directory, input.slug, input.reserved ?? DEFAULT_RESERVED_PATHS);
  if ((await store.listPages(siteId)).some((p) => p.path === path)) problems.push(`A page is already at ${path}.`);
  if (problems.length) throw new Error(problems.join(" "));
  const template = pageTemplates().find((t) => t.id === "landing")!;
  return store.createPage(siteId, { path, kind: "landing", doc: template.doc({ title, brand: input.brand }) });
}

/**
 * Give a landing page a new slug under the site's landing directory (a page
 * outside the directory moves into it). The old address redirects (301), as
 * for any page move.
 *
 * @stability Beta
 */
export async function moveLandingPage(store: SiteStore, pageId: string, slug: string, options: { reserved?: ReservedPaths } = {}): Promise<PageMeta> {
  const current = await store.getPageDraft(pageId);
  if (!current) throw new Error("That page no longer exists.");
  const draft = await store.getDraft(current.siteId);
  if (!draft) throw new Error("You can't edit this site.");
  const directory = landingDirectory(draft.site);
  const problems = landingSlugProblems(directory, slug, options.reserved ?? DEFAULT_RESERVED_PATHS);
  if (problems.length) throw new Error(problems.join(" "));
  return renamePage(store, pageId, landingPath(directory, slug), options);
}

/**
 * Change where new landing pages go (`site.landing.directory`). With
 * `movePages`, every landing page under the old directory moves to the same
 * slug under the new one, and its old address redirects (301); every new
 * address is checked before anything moves. Without it, existing pages keep
 * their addresses and only new landing pages use the new directory.
 *
 * Throws `SiteConflictError` when someone saved the site meanwhile.
 *
 * @stability Beta
 */
export async function setLandingDirectory(store: SiteStore, siteId: string, directory: string, options: { movePages?: boolean; reserved?: ReservedPaths } = {}): Promise<{ directory: string; moved: PageMeta[] }> {
  const reserved = options.reserved ?? DEFAULT_RESERVED_PATHS;
  const problems = landingDirectoryProblems(directory, reserved);
  if (problems.length) throw new Error(problems.join(" "));
  const before = await store.getDraft(siteId);
  if (!before) throw new Error(`There's no site ${siteId}, or you can't edit it.`);
  const moved: PageMeta[] = [];
  if (options.movePages) {
    const pages = await store.listPages(siteId);
    const moves = landingMoves(pages, landingDirectory(before.site), directory);
    const moving = new Set(moves.map((m) => m.page.id));
    const staying = pages.filter((p) => !moving.has(p.id));
    const errors = moves.flatMap((m) => pathProblems(m.path, staying, { reserved }));
    if (errors.length) throw new Error(`The landing pages can't move to ${directory}: ${[...new Set(errors)].join(" ")}`);
    // A page moving onto an address another moving page is leaving: move in an order that frees it first.
    const pending = [...moves];
    while (pending.length) {
      const k = pending.findIndex((m) => !pending.some((o) => o !== m && o.page.path === m.path));
      if (k < 0) throw new Error("The landing pages' new addresses overlap their old ones; move them one at a time.");
      const [m] = pending.splice(k, 1);
      moved.push(await store.movePage(m!.page.id, m!.path));
    }
  }
  // Moves write redirects into the site document: save on top of what they left.
  const draft = moved.length ? await store.getDraft(siteId) : before;
  if (!draft) throw new Error(`There's no site ${siteId}, or you can't edit it.`);
  const saved = await store.saveSiteDraft(siteId, draft.rev, { ...draft.site, landing: { ...draft.site.landing, directory } });
  if (isConflict(saved)) throw new SiteConflictError();
  return { directory, moved };
}
