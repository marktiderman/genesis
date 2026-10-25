/**
 * Where sites live: the `SiteStore` contract, the publish pipeline every
 * store shares, cache invalidation, and an in-memory store for tests, demos
 * and previews. `@marktiderman/genesis-sites/supabase` has the Postgres one.
 */
import { checkPost, checkRelease, isPublishable, type SiteIssue } from "./a11y";
import {
  MAX_IMPORT_POSTS,
  MAX_LIVE_POSTS,
  PostDoc,
  postSummary,
  validatePostSlug,
  type ImportPost,
  type ImportPostsResult,
  type LivePost,
  type PostDraft,
  type PostMeta,
  type PostStatus,
  type PostSummary,
  type SavePostInput,
  type SavePostResult,
} from "./posts";
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

/**
 * The file types a site asset may be, as the database checks them: images
 * and PDF. Never SVG or HTML, which a browser runs as a page.
 */
export const ASSET_TYPES: readonly string[] = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif", "application/pdf"]);

/**
 * The storage key for an upload: `sites/<siteId>/<id>-<name>` for an image,
 * `sites/<siteId>/files/<id>-<name>` for a file to download (a PDF), so
 * storage policies scope by site with `can_edit`.
 */
export function assetPath(siteId: string, id: string, name: string | undefined, mime: string): string {
  const clean = (name ?? "file").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[.-]+/, "").slice(0, 80) || "file";
  return `sites/${siteId}/${mime === "application/pdf" ? "files/" : ""}${id}-${clean}`;
}

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
  /** The brand to check contrast against (and record the hash of). Required: a publish without it is blocked. */
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
  /** Store an upload under `sites/<siteId>/...` (a PDF under `files/`) and record it. Images and PDF only. */
  putAsset?(siteId: string, file: Blob, meta?: AssetMeta): Promise<Asset>;

  // Posts. Optional: a store without them serves a site with no blog.

  /** The published posts, newest first, without bodies (at most `MAX_LIVE_POSTS`). Public, like `getLive`. */
  listLivePosts?(siteId: string): Promise<PostSummary[]>;
  /** One published post. Public, like `getLive`. Null for a draft, an unknown slug, or a site that isn't live. */
  getLivePost?(siteId: string, slug: string): Promise<LivePost | null>;
  /** Every post's meta for the editor (drafts too), newest first. */
  listPosts?(siteId: string): Promise<PostMeta[]>;
  getPost?(postId: string): Promise<PostDraft | null>;
  /** Create a post (no `id`) or save its draft by compare-and-swap. A post keeps its slug once published. */
  savePost?(siteId: string, input: SavePostInput): Promise<SavePostResult>;
  /** Check the draft (`checkPost`) and make it the published copy. Throws `PublishBlockedError`. */
  publishPost?(postId: string): Promise<PostMeta>;
  /** Take the post down; its draft stays. */
  unpublishPost?(postId: string): Promise<PostMeta>;
  deletePost?(postId: string): Promise<void>;
  /**
   * A one-time import from another site: each post keeps its slug and its
   * date, and is published unless asked otherwise or a check fails (then it
   * is a draft, with its issues). A slug the site already has is skipped.
   */
  importPosts?(siteId: string, posts: readonly ImportPost[]): Promise<ImportPostsResult>;
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
  // A hidden section stays in the draft, never in the release: a release is public.
  const visible = <T extends { hidden?: boolean | undefined }>(nodes: T[]) => nodes.filter((n) => !n.hidden);
  const snapshot: ReleaseSnapshot = ReleaseSnapshot.parse({
    schemaVersion: 1,
    site: { ...migratedSite.site, header: visible(migratedSite.site.header), footer: visible(migratedSite.site.footer) },
    pages: releasePages.map((p) => ({ ...p, doc: { ...p.doc, content: visible(p.doc.content) } })),
  });
  const theme = options.brand ? siteTheme(options.brand, snapshot.site.theme) : undefined;
  const issues = checkRelease(snapshot, { ...(theme ? { theme } : {}), reserved: options.reserved ?? DEFAULT_RESERVED_PATHS });
  // The contrast check needs the brand: without it a publish can't show its colours are readable.
  if (!theme) issues.push({ severity: "error", code: "brand-missing", message: "Publish with the site's brand (`brand`), so its colours can be checked for contrast." });
  if (!isPublishable(issues)) throw new PublishBlockedError(issues);
  return { snapshot, issues, migratedPages, migratedSite: migratedSite.changed ? migratedSite.site : null, brandHash: theme?.brandHash ?? null };
}

/** The cache tag every response of a site carries (`Vercel-Cache-Tag`). */
export function siteCacheTag(siteId: string): string {
  return `site:${siteId}`;
}

/** The cache tag of every page that embeds a form: purge it when the host changes that form. */
export function formCacheTag(slug: string): string {
  return `form:${slug}`;
}

/** Why a site's cache is being purged. */
export interface InvalidationInfo {
  siteId: string;
  /** `post`: a post was published, taken down, deleted or imported. */
  action: "publish" | "rollback" | "post";
}

/**
 * A store that purges the site's cached pages after every publish and
 * rollback: `invalidate` gets `["site:<id>"]` and what happened.
 *
 * Mind what your CDN's purge does. On Vercel, `invalidateByTag` marks pages
 * stale, so each cached URL serves the old release once more while it
 * regenerates (no stampede); `dangerouslyDeleteByTag` drops them, so the
 * next request waits for a render. Use the delete for a rollback that takes
 * something down:
 *
 *   withCacheInvalidation(store, (tags, { action }) =>
 *     action === "rollback" ? dangerouslyDeleteByTag(tags) : invalidateByTag(tags));
 *
 * Archiving a site goes through your own server or the database (the
 * `genesis_sites` notification), so purge there too. A failed purge is
 * logged and rethrown, so the editor shows that the live site may be stale.
 *
 * @stability Beta
 */
export function withCacheInvalidation(store: SiteStore, invalidate: (tags: string[], info: InvalidationInfo) => Promise<void> | void): SiteStore {
  const purge = async (siteId: string, action: InvalidationInfo["action"]) => {
    try {
      await invalidate([siteCacheTag(siteId)], { siteId, action });
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
    ...(store.listLivePosts ? { listLivePosts: store.listLivePosts.bind(store) } : {}),
    ...(store.getLivePost ? { getLivePost: store.getLivePost.bind(store) } : {}),
    ...(store.listPosts ? { listPosts: store.listPosts.bind(store) } : {}),
    ...(store.getPost ? { getPost: store.getPost.bind(store) } : {}),
    ...(store.savePost ? { savePost: store.savePost.bind(store) } : {}),
    ...(store.publishPost
      ? {
          async publishPost(postId: string) {
            const meta = await store.publishPost!(postId);
            await purge(meta.siteId, "post");
            return meta;
          },
        }
      : {}),
    ...(store.unpublishPost
      ? {
          async unpublishPost(postId: string) {
            const meta = await store.unpublishPost!(postId);
            await purge(meta.siteId, "post");
            return meta;
          },
        }
      : {}),
    ...(store.deletePost
      ? {
          async deletePost(postId: string) {
            const before = await store.getPost?.(postId);
            await store.deletePost!(postId);
            if (before) await purge(before.siteId, "post");
          },
        }
      : {}),
    ...(store.importPosts
      ? {
          async importPosts(siteId: string, list: readonly ImportPost[]) {
            const result = await store.importPosts!(siteId, list);
            await purge(siteId, "post");
            return result;
          },
        }
      : {}),
    async publish(siteId, options) {
      const release = await store.publish(siteId, options);
      await purge(siteId, "publish");
      return release;
    },
    async rollback(siteId, releaseId) {
      const release = await store.rollback(siteId, releaseId);
      await purge(siteId, "rollback");
      return release;
    },
  };
}

/**
 * One post of an import, checked: its document parsed, its status (a draft
 * when asked for, or when a check fails, with the reasons) and its date.
 * Every store's `importPosts` runs it.
 */
export function prepareImportPost(item: ImportPost): { doc: PostDoc; status: PostStatus; publishedAt: string; issues: string[] } | { slug: string; reason: string } {
  const slug = typeof item?.slug === "string" ? item.slug : String(item?.slug);
  try {
    validatePostSlug(slug);
  } catch (err) {
    return { slug, reason: (err as Error).message };
  }
  const parsed = PostDoc.safeParse(item.doc);
  if (!parsed.success) return { slug, reason: `The post doesn't parse: ${parsed.error.issues.map((i) => `${i.path.join(".") || "post"} ${i.message}`).join("; ")}` };
  const now = Date.now();
  const given = item.publishedAt ? new Date(item.publishedAt) : new Date(now);
  // The same rule as the database: a real date from 1970 on, and never later than now.
  if (Number.isNaN(given.getTime()) || given.getTime() < 0) return { slug, reason: `"${item.publishedAt}" isn't a usable publish date.` };
  const date = new Date(Math.min(given.getTime(), now));
  const errors = checkPost(slug, parsed.data).filter((i) => i.severity === "error").map((i) => i.message);
  const status: PostStatus = item.status === "draft" || errors.length ? "draft" : "published";
  return { doc: parsed.data, status, publishedAt: date.toISOString(), issues: errors };
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
interface MemPost {
  id: string;
  siteId: string;
  slug: string;
  doc: PostDoc;
  rev: number;
  status: PostStatus;
  published: { doc: PostDoc; at: string } | null;
  publishedAt: string | null;
  updatedAt: string;
  deleted: boolean;
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
  const posts = new Map<string, MemPost>();
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
  const sitePosts = (siteId: string) => [...posts.values()].filter((p) => p.siteId === siteId && !p.deleted);
  const postMeta = (p: MemPost): PostMeta => ({ id: p.id, siteId: p.siteId, slug: p.slug, title: p.doc.title, status: p.status, rev: p.rev, publishedAt: p.publishedAt, updatedAt: p.updatedAt });
  const byNewest = (a: { publishedAt: string | null; updatedAt: string }, b: { publishedAt: string | null; updatedAt: string }) =>
    (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt);
  const livePost = (p: MemPost): LivePost | null =>
    p.status === "published" && p.published && p.publishedAt ? { slug: p.slug, publishedAt: p.publishedAt, updatedAt: p.published.at, doc: clone(p.published.doc) } : null;
  const siteIsLive = (siteId: string) => {
    const s = sites.get(siteId);
    return Boolean(s && s.status === "live" && s.liveReleaseId);
  };
  const editablePost = (postId: string): MemPost => {
    const p = posts.get(postId);
    if (!p || p.deleted) throw new Error(`No post ${postId}.`);
    editable(p.siteId);
    return p;
  };

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
      const mime = file.type || "application/octet-stream";
      if (!ASSET_TYPES.includes(mime)) throw new Error(`${mime} isn't an image (PNG, JPEG, WebP, AVIF, GIF) or a PDF.`);
      const assetId = id("asset");
      const path = assetPath(siteId, assetId, assetMeta.name, mime);
      return { id: assetId, siteId, path, url: `/${path}`, mime, alt: assetMeta.alt ?? null, width: assetMeta.width ?? null, height: assetMeta.height ?? null };
    },
    async listLivePosts(siteId) {
      if (!siteIsLive(siteId)) return [];
      return sitePosts(siteId)
        .map(livePost)
        .filter((p): p is LivePost => p !== null)
        .sort(byNewest)
        .slice(0, MAX_LIVE_POSTS)
        .map(postSummary);
    },
    async getLivePost(siteId, slug) {
      if (!siteIsLive(siteId)) return null;
      const p = sitePosts(siteId).find((x) => x.slug === slug);
      return p ? livePost(p) : null;
    },
    async listPosts(siteId) {
      if (options.canEdit && !options.canEdit(siteId)) return [];
      return sitePosts(siteId).map(postMeta).sort(byNewest);
    },
    async getPost(postId) {
      const p = posts.get(postId);
      if (!p || p.deleted || (options.canEdit && !options.canEdit(p.siteId))) return null;
      return { ...postMeta(p), doc: clone(p.doc) };
    },
    async savePost(siteId, input) {
      editable(siteId);
      validatePostSlug(input.slug);
      const doc = PostDoc.parse(clone(input.doc));
      const at = now().toISOString();
      if (!input.id) {
        if (sitePosts(siteId).some((p) => p.slug === input.slug)) throw new Error(`A post is already at ${input.slug}.`);
        const postId = id("post");
        posts.set(postId, { id: postId, siteId, slug: input.slug, doc, rev: 1, status: "draft", published: null, publishedAt: null, updatedAt: at, deleted: false });
        return { id: postId, rev: 1 };
      }
      const p = editablePost(input.id);
      if (p.siteId !== siteId) throw new Error(`Post ${input.id} isn't one of site ${siteId}'s.`);
      if (p.rev !== input.rev) return { id: p.id, conflict: clone(p.doc), rev: p.rev };
      if (input.slug !== p.slug) {
        if (p.publishedAt) throw new Error("A post keeps its slug once it has been published: its address is out in the world.");
        if (sitePosts(siteId).some((x) => x.slug === input.slug && x.id !== p.id)) throw new Error(`A post is already at ${input.slug}.`);
        p.slug = input.slug;
      }
      p.doc = doc;
      p.rev += 1;
      p.updatedAt = at;
      return { id: p.id, rev: p.rev };
    },
    async publishPost(postId) {
      const p = editablePost(postId);
      // Archiving is a takedown: no post goes back up (as publish_post refuses).
      if (sites.get(p.siteId)?.status === "archived") throw new Error("An archived site can't publish posts.");
      const issues = checkPost(p.slug, p.doc);
      if (!isPublishable(issues)) throw new PublishBlockedError(issues);
      const at = now().toISOString();
      p.published = { doc: clone(p.doc), at };
      p.status = "published";
      p.publishedAt ??= at;
      p.updatedAt = at;
      return postMeta(p);
    },
    async unpublishPost(postId) {
      const p = editablePost(postId);
      p.status = "draft";
      p.published = null;
      p.updatedAt = now().toISOString();
      return postMeta(p);
    },
    async deletePost(postId) {
      const p = posts.get(postId);
      if (!p || p.deleted) return;
      editable(p.siteId);
      p.deleted = true;
      p.status = "draft";
      p.published = null;
    },
    async importPosts(siteId, list) {
      if (editable(siteId).status === "archived") throw new Error(`No site ${siteId} to import into: it is archived.`);
      if (list.length > MAX_IMPORT_POSTS) throw new Error(`Import at most ${MAX_IMPORT_POSTS} posts at a time.`);
      const result: ImportPostsResult = { imported: [], skipped: [] };
      const seen = new Set(sitePosts(siteId).map((p) => p.slug));
      for (const item of list) {
        const prepared = prepareImportPost(item);
        if ("reason" in prepared) {
          result.skipped.push(prepared);
          continue;
        }
        if (seen.has(item.slug)) {
          result.skipped.push({ slug: item.slug, reason: "The site already has a post at this slug." });
          continue;
        }
        seen.add(item.slug);
        const postId = id("post");
        const at = now().toISOString();
        const published = prepared.status === "published" ? { doc: clone(prepared.doc), at: prepared.publishedAt } : null;
        posts.set(postId, { id: postId, siteId, slug: item.slug, doc: prepared.doc, rev: 1, status: prepared.status, published, publishedAt: published ? prepared.publishedAt : null, updatedAt: at, deleted: false });
        result.imported.push({ slug: item.slug, id: postId, status: prepared.status, ...(prepared.issues.length ? { issues: prepared.issues } : {}) });
      }
      return result;
    },
  };
  return store;
}
