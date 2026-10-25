/**
 * Where sites live: the `SiteStore` contract, the publish pipeline every
 * store shares, cache invalidation, and an in-memory store for tests, demos
 * and previews. `@marktiderman/genesis-sites/supabase` has the Postgres one.
 */
import { checkRelease, isPublishable, type SiteIssue } from "./a11y";
import { migratePage, migrateSite } from "./migrate";
import {
  PageDoc,
  ReleaseSnapshot,
  SiteDoc,
  type PageKind,
  type PageMeta,
  type Release,
  type ReleaseMeta,
  type ReleasePage,
  type SiteDocInput,
} from "./schemas";
import { redirectsAfterMove } from "./seo";
import { siteTheme, type BrandInput } from "./theme";
import { DEFAULT_RESERVED_PATHS, validatePagePath, type ReservedPaths } from "./urls";

export type SaveResult<T> = { rev: number } | { conflict: T; rev: number };

export const isConflict = <T>(result: SaveResult<T>): result is { conflict: T; rev: number } => "conflict" in result;

export interface AssetMeta {
  alt?: string;
  width?: number;
  height?: number;
  /** The file's name, for the storage key. */
  name?: string;
}

export interface Asset {
  id: string;
  siteId: string;
  /** The storage key: always `sites/<siteId>/...`, so storage policies can scope by site. */
  path: string;
  /** Where the browser loads it. */
  url: string;
  mime: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface PublishOptions {
  note?: string;
  /** The brand to check contrast against (and record the hash of). */
  brand?: BrandInput | null;
  reserved?: ReservedPaths;
}

export interface NewPage {
  path: string;
  kind?: PageKind;
  doc: PageDoc;
}

export interface SiteDraft {
  site: SiteDoc;
  rev: number;
}

export interface PageDraft {
  doc: PageDoc;
  rev: number;
  siteId: string;
  path: string;
  kind: PageKind;
}

/**
 * A site's storage.
 *
 * Drafts change by compare-and-swap on a revision: a save names the revision
 * it started from and gets the new one, or the current document when someone
 * saved first. A publish checks the drafts (`checkRelease`) and freezes them
 * into an immutable release that the live site points at; a rollback moves
 * the pointer back. `getLive` is the public read and needs no session.
 *
 * @stability Beta
 */
export interface SiteStore {
  /** The release the live site serves, or null (not published, archived, or unknown). */
  getLive(siteId: string): Promise<Release | null>;
  getDraft(siteId: string): Promise<SiteDraft | null>;
  saveSiteDraft(siteId: string, rev: number, site: SiteDoc): Promise<SaveResult<SiteDoc>>;
  listPages(siteId: string): Promise<PageMeta[]>;
  getPageDraft(pageId: string): Promise<PageDraft | null>;
  savePageDraft(pageId: string, rev: number, doc: PageDoc): Promise<SaveResult<PageDoc>>;
  createPage(siteId: string, page: NewPage): Promise<PageMeta>;
  /** Move a page to a new path; the old path redirects to it (301). */
  movePage(pageId: string, path: string): Promise<PageMeta>;
  deletePage(pageId: string): Promise<void>;
  publish(siteId: string, options?: PublishOptions): Promise<Release>;
  rollback(siteId: string, releaseId: string): Promise<Release>;
  listReleases(siteId: string): Promise<ReleaseMeta[]>;
  putAsset?(siteId: string, file: Blob, meta?: AssetMeta): Promise<Asset>;
}

/** A publish the checks refused: `issues` lists why. */
export class PublishBlockedError extends Error {
  constructor(readonly issues: SiteIssue[]) {
    const errors = issues.filter((i) => i.severity === "error");
    super(`The site can't be published yet:\n${errors.map((i) => `  - ${i.message}`).join("\n")}`);
    this.name = "PublishBlockedError";
  }
}

/** Someone saved first; the store's current document is in the result of the save that raised this. */
export class SiteConflictError extends Error {
  constructor(message = "Someone else changed this site; reload it and try again.") {
    super(message);
    this.name = "SiteConflictError";
  }
}

export interface PreparedRelease {
  snapshot: ReleaseSnapshot;
  issues: SiteIssue[];
  /** Drafts whose props a migration changed: a store saves these before it publishes. */
  migratedPages: { id: string; doc: PageDoc }[];
  migratedSite: SiteDoc | null;
  brandHash: string | null;
}

/**
 * The publish pipeline every store shares: migrate every node, freeze the
 * drafts into a snapshot, and check it. Throws `PublishBlockedError` when a
 * check fails. Pages come in the order they are listed.
 *
 * @stability Beta
 */
export function prepareRelease(
  site: SiteDoc,
  pages: readonly { id: string; path: string; kind: PageKind; doc: PageDoc }[],
  options: PublishOptions = {},
): PreparedRelease {
  const migratedSite = migrateSite(site);
  const migratedPages: { id: string; doc: PageDoc }[] = [];
  const releasePages: ReleasePage[] = pages.map((p) => {
    const m = migratePage(p.doc);
    if (m.changed) migratedPages.push({ id: p.id, doc: m.doc });
    return { id: p.id, path: p.path, kind: p.kind, doc: m.doc };
  });
  const snapshot: ReleaseSnapshot = ReleaseSnapshot.parse({ schemaVersion: 1, site: migratedSite.site, pages: releasePages });
  const theme = options.brand ? siteTheme(options.brand, snapshot.site.theme) : undefined;
  const issues = checkRelease(snapshot, { ...(theme ? { theme } : {}), reserved: options.reserved ?? DEFAULT_RESERVED_PATHS });
  if (!isPublishable(issues)) throw new PublishBlockedError(issues);
  return { snapshot, issues, migratedPages, migratedSite: migratedSite.changed ? migratedSite.site : null, brandHash: theme?.brandHash ?? null };
}

/** The cache tag every response of a site carries (`Vercel-Cache-Tag`). */
export function siteCacheTag(siteId: string): string {
  return `site:${siteId}`;
}

/**
 * A store that purges the site's cached pages after every publish and
 * rollback: `invalidate` gets `["site:<id>"]` (for example
 * `invalidateByTags` from `@vercel/functions`). A failed purge is logged and
 * rethrown, so the editor shows that the live site may be stale.
 *
 * @stability Beta
 */
export function withCacheInvalidation(store: SiteStore, invalidate: (tags: string[]) => Promise<void> | void): SiteStore {
  const purge = async (siteId: string) => {
    try {
      await invalidate([siteCacheTag(siteId)]);
    } catch (err) {
      console.error(`[genesis-sites] published site ${siteId}, but purging its cache failed; the old pages may be served until their cache expires.`, err);
      throw err;
    }
  };
  return {
    ...store,
    getLive: (id) => store.getLive(id),
    getDraft: (id) => store.getDraft(id),
    saveSiteDraft: (id, rev, site) => store.saveSiteDraft(id, rev, site),
    listPages: (id) => store.listPages(id),
    getPageDraft: (id) => store.getPageDraft(id),
    savePageDraft: (id, rev, doc) => store.savePageDraft(id, rev, doc),
    createPage: (id, page) => store.createPage(id, page),
    movePage: (id, path) => store.movePage(id, path),
    deletePage: (id) => store.deletePage(id),
    listReleases: (id) => store.listReleases(id),
    ...(store.putAsset ? { putAsset: store.putAsset.bind(store) } : {}),
    async publish(siteId, options) {
      const release = await store.publish(siteId, options);
      await purge(siteId);
      return release;
    },
    async rollback(siteId, releaseId) {
      const release = await store.rollback(siteId, releaseId);
      await purge(siteId);
      return release;
    },
  };
}

// ── In memory ───────────────────────────────────────────────────────────────

export interface NewSite {
  id?: string;
  /** The site document (defaults applied). */
  site: SiteDocInput;
  pages: { id?: string; path: string; kind?: PageKind; doc: PageDoc }[];
}

export interface MemorySiteStore extends SiteStore {
  createSite(input: NewSite): Promise<{ siteId: string; pageIds: string[] }>;
  /** Archive (or bring back) a site: an archived site serves nothing. */
  setStatus(siteId: string, status: "draft" | "live" | "archived"): Promise<void>;
}

interface MemSite {
  id: string;
  site: SiteDoc;
  rev: number;
  liveReleaseId: string | null;
  status: "draft" | "live" | "archived";
}
interface MemPage {
  id: string;
  siteId: string;
  path: string;
  kind: PageKind;
  doc: PageDoc;
  rev: number;
  sort: number;
  deleted: boolean;
}

export interface MemoryStoreOptions {
  reserved?: ReservedPaths;
  /** Who may edit (default: everyone). Mirrors the database's `can_edit` hook, for tests. */
  canEdit?: (siteId: string) => boolean;
  now?: () => Date;
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * An in-memory `SiteStore`: the same rules as the database (compare-and-swap
 * revisions, path checks, redirects on move, immutable releases), for tests,
 * demos and local previews. Documents are copied in and out, so callers
 * can't change stored state by mutating what they hold.
 *
 * @stability Beta
 */
export function createMemorySiteStore(options: MemoryStoreOptions = {}): MemorySiteStore {
  const reserved = options.reserved ?? DEFAULT_RESERVED_PATHS;
  const now = options.now ?? (() => new Date());
  const sites = new Map<string, MemSite>();
  const pages = new Map<string, MemPage>();
  const releases = new Map<string, Release>();
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${(++seq).toString(36).padStart(4, "0")}`;

  const editable = (siteId: string): MemSite => {
    const s = sites.get(siteId);
    if (!s) throw new Error(`No site ${siteId}.`);
    if (options.canEdit && !options.canEdit(siteId)) throw new Error(`Not allowed to edit site ${siteId}.`);
    return s;
  };
  const livePages = (siteId: string) => [...pages.values()].filter((p) => p.siteId === siteId && !p.deleted).sort((a, b) => a.sort - b.sort || a.path.localeCompare(b.path));
  const meta = (p: MemPage): PageMeta => ({ id: p.id, siteId: p.siteId, path: p.path, kind: p.kind, title: p.doc.root.props.title, sort: p.sort, rev: p.rev });
  const releaseMeta = ({ snapshot: _s, ...m }: Release): ReleaseMeta => clone(m);
  const pathTaken = (siteId: string, path: string, except?: string) => livePages(siteId).some((p) => p.path === path && p.id !== except);

  const store: MemorySiteStore = {
    async createSite(input) {
      const siteId = input.id ?? id("site");
      if (sites.has(siteId)) throw new Error(`Site ${siteId} exists.`);
      const site = SiteDoc.parse(input.site);
      sites.set(siteId, { id: siteId, site, rev: 1, liveReleaseId: null, status: "draft" });
      const pageIds: string[] = [];
      input.pages.forEach((p, i) => {
        validatePagePath(p.path, reserved);
        if (pathTaken(siteId, p.path)) throw new Error(`Two pages at ${p.path}.`);
        const pageId = p.id ?? id("page");
        pages.set(pageId, { id: pageId, siteId, path: p.path, kind: p.kind ?? "page", doc: PageDoc.parse(clone(p.doc)), rev: 1, sort: i, deleted: false });
        pageIds.push(pageId);
      });
      return { siteId, pageIds };
    },
    async setStatus(siteId, status) {
      editable(siteId).status = status;
    },
    async getLive(siteId) {
      const s = sites.get(siteId);
      if (!s || s.status !== "live" || !s.liveReleaseId) return null;
      const r = releases.get(s.liveReleaseId);
      return r ? clone(r) : null;
    },
    async getDraft(siteId) {
      const s = sites.get(siteId);
      if (!s || (options.canEdit && !options.canEdit(siteId))) return null;
      return { site: clone(s.site), rev: s.rev };
    },
    async saveSiteDraft(siteId, rev, doc) {
      const s = editable(siteId);
      if (s.rev !== rev) return { conflict: clone(s.site), rev: s.rev };
      s.site = SiteDoc.parse(clone(doc));
      s.rev += 1;
      return { rev: s.rev };
    },
    async listPages(siteId) {
      if (options.canEdit && !options.canEdit(siteId)) return [];
      return livePages(siteId).map(meta);
    },
    async getPageDraft(pageId) {
      const p = pages.get(pageId);
      if (!p || p.deleted || (options.canEdit && !options.canEdit(p.siteId))) return null;
      return { doc: clone(p.doc), rev: p.rev, siteId: p.siteId, path: p.path, kind: p.kind };
    },
    async savePageDraft(pageId, rev, doc) {
      const p = pages.get(pageId);
      if (!p || p.deleted) throw new Error(`No page ${pageId}.`);
      editable(p.siteId);
      if (p.rev !== rev) return { conflict: clone(p.doc), rev: p.rev };
      p.doc = PageDoc.parse(clone(doc));
      p.rev += 1;
      return { rev: p.rev };
    },
    async createPage(siteId, page) {
      const s = editable(siteId);
      validatePagePath(page.path, reserved);
      if (pathTaken(siteId, page.path)) throw new Error(`A page is already at ${page.path}.`);
      const pageId = id("page");
      const sort = Math.max(-1, ...livePages(siteId).map((p) => p.sort)) + 1;
      const p: MemPage = { id: pageId, siteId, path: page.path, kind: page.kind ?? "page", doc: PageDoc.parse(clone(page.doc)), rev: 1, sort, deleted: false };
      pages.set(pageId, p);
      // A page now lives at this path: a redirect away from it would hide it.
      if (s.site.redirects.some((r) => r.from === page.path)) {
        s.site = { ...s.site, redirects: s.site.redirects.filter((r) => r.from !== page.path) };
        s.rev += 1;
      }
      return meta(p);
    },
    async movePage(pageId, path) {
      const p = pages.get(pageId);
      if (!p || p.deleted) throw new Error(`No page ${pageId}.`);
      const s = editable(p.siteId);
      validatePagePath(path, reserved);
      if (p.path === "/") throw new Error("The home page stays at /.");
      if (pathTaken(p.siteId, path, pageId)) throw new Error(`A page is already at ${path}.`);
      const from = p.path;
      p.path = path;
      p.rev += 1;
      s.site = { ...s.site, redirects: redirectsAfterMove(s.site.redirects, from, path) };
      s.rev += 1;
      return meta(p);
    },
    async deletePage(pageId) {
      const p = pages.get(pageId);
      if (!p || p.deleted) return;
      editable(p.siteId);
      if (p.path === "/") throw new Error("The home page can't be deleted; replace its content instead.");
      p.deleted = true;
    },
    async publish(siteId, opts = {}) {
      const s = editable(siteId);
      const list = livePages(siteId);
      const prepared = prepareRelease(s.site, list, { reserved, ...opts });
      for (const { id: pid, doc } of prepared.migratedPages) {
        const p = pages.get(pid)!;
        p.doc = doc;
        p.rev += 1;
      }
      if (prepared.migratedSite) {
        s.site = prepared.migratedSite;
        s.rev += 1;
      }
      const number = Math.max(0, ...[...releases.values()].filter((r) => r.siteId === siteId).map((r) => r.number)) + 1;
      const at = now().toISOString();
      const release: Release = {
        id: id("rel"),
        siteId,
        number,
        note: opts.note ?? null,
        createdAt: at,
        publishedAt: at,
        brandHash: prepared.brandHash,
        snapshot: Object.freeze(clone(prepared.snapshot)) as ReleaseSnapshot,
      };
      releases.set(release.id, release);
      s.liveReleaseId = release.id;
      s.status = "live";
      return clone(release);
    },
    async rollback(siteId, releaseId) {
      const s = editable(siteId);
      const r = releases.get(releaseId);
      if (!r || r.siteId !== siteId) throw new Error(`Release ${releaseId} isn't one of site ${siteId}'s.`);
      s.liveReleaseId = r.id;
      s.status = "live";
      return clone(r);
    },
    async listReleases(siteId) {
      if (options.canEdit && !options.canEdit(siteId)) return [];
      return [...releases.values()].filter((r) => r.siteId === siteId).sort((a, b) => b.number - a.number).map(releaseMeta);
    },
    async putAsset(siteId, file, assetMeta = {}) {
      editable(siteId);
      const assetId = id("asset");
      const name = (assetMeta.name ?? "file").toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(0, 80) || "file";
      const path = `sites/${siteId}/${assetId}-${name}`;
      return { id: assetId, siteId, path, url: `/${path}`, mime: file.type || "application/octet-stream", alt: assetMeta.alt ?? null, width: assetMeta.width ?? null, height: assetMeta.height ?? null };
    },
  };
  return store;
}
