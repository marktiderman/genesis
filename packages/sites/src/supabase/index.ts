/**
 * @marktiderman/genesis-sites/supabase: `createSupabaseSiteStore`, the
 * `SiteStore` over the `genesis_sites` schema (migration
 * `migrations/0001_genesis_sites.sql`).
 *
 * Pass a client signed in as the editor for drafts and publishing (row level
 * security and `can_edit` / `can_view` decide), or an anonymous one for the
 * public read (`getLive`, through `genesis_sites.live_release`). The schema
 * must be exposed to the API.
 *
 * @packageDocumentation
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPost, isPublishable } from "../core/a11y";
import { MAX_IMPORT_POSTS, PostDoc, PostSummarySchema, validatePostSlug, type ImportPostsResult, type LivePost, type PostMeta, type PostStatus, type PostSummary } from "../core/posts";
import { PageDoc, ReleaseSnapshot, SiteDoc, parseSnapshot, type PageKind, type PageMeta, type Release, type ReleaseMeta } from "../core/schemas";
import { ASSET_TYPES, PublishBlockedError, assetPath, prepareImportPost, prepareRelease, type Asset, type AssetMeta, type PublishOptions, type SaveResult, type SiteStore } from "../core/store";

export const SITES_SCHEMA = "genesis_sites";

/** The file types a site asset may be, as the database checks them. */
export { ASSET_TYPES };

export interface SupabaseSiteStoreOptions {
  /** The storage bucket for `putAsset`. Default `site-assets`. */
  bucket?: string;
}

/** A database error with its SQLSTATE (`GS409` a conflict, `42501` not allowed). */
export class SiteStoreError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "SiteStoreError";
  }
}

interface PgError {
  message: string;
  code?: string;
  details?: string;
}

function fail(error: PgError, what: string): never {
  throw new SiteStoreError(`${what}: ${error.message}`, error.code, error.details);
}

interface ReleaseJson {
  id: string;
  siteId: string;
  number: number;
  note: string | null;
  createdAt: string;
  publishedAt: string | null;
  brandHash: string | null;
  snapshot?: unknown;
}

const metaOf = (r: ReleaseJson): ReleaseMeta => ({ id: r.id, siteId: r.siteId, number: r.number, note: r.note, createdAt: r.createdAt, publishedAt: r.publishedAt, brandHash: r.brandHash });

interface ReleaseRow {
  id: string;
  site_id: string;
  number: number;
  note: string | null;
  created_at: string;
  published_at: string | null;
  brand_hash: string | null;
  snapshot?: unknown;
}

const fromRow = (r: ReleaseRow): ReleaseJson => ({
  id: r.id,
  siteId: r.site_id,
  number: r.number,
  note: r.note,
  createdAt: r.created_at,
  publishedAt: r.published_at,
  brandHash: r.brand_hash,
  ...(r.snapshot !== undefined ? { snapshot: r.snapshot } : {}),
});

interface PageRow {
  id: string;
  site_id: string;
  path: string;
  kind: PageKind;
  sort: number;
  draft_rev: number;
  title?: string | null;
  draft?: unknown;
}

const pageMeta = (r: PageRow): PageMeta => ({ id: r.id, siteId: r.site_id, path: r.path, kind: r.kind, title: r.title ?? "", sort: r.sort, rev: r.draft_rev });

interface PostRow {
  id: string;
  site_id: string;
  slug: string;
  status: PostStatus;
  draft_rev: number;
  published_at: string | null;
  updated_at: string;
  title?: string | null;
  draft?: unknown;
}

const POST_META = "id, site_id, slug, status, draft_rev, published_at, updated_at, title:draft->>title";
const postMeta = (r: PostRow): PostMeta => ({ id: r.id, siteId: r.site_id, slug: r.slug, title: r.title ?? "", status: r.status, rev: r.draft_rev, publishedAt: r.published_at, updatedAt: r.updated_at });
const fromPostJson = (j: { id: string; siteId: string; slug: string; title: string | null; status: PostStatus; rev: number; publishedAt: string | null; updatedAt: string }): PostMeta => ({
  id: j.id,
  siteId: j.siteId,
  slug: j.slug,
  title: j.title ?? "",
  status: j.status,
  rev: j.rev,
  publishedAt: j.publishedAt,
  updatedAt: j.updatedAt,
});

/**
 * A `SiteStore` on Supabase.
 *
 * @stability Beta
 */
export function createSupabaseSiteStore(client: SupabaseClient, options: SupabaseSiteStoreOptions = {}): SiteStore {
  const db = client.schema(SITES_SCHEMA);
  const bucket = options.bucket ?? "site-assets";

  async function release(id: string): Promise<Release> {
    const { data, error } = await db.from("site_releases").select("id, site_id, number, note, created_at, published_at, brand_hash, snapshot").eq("id", id).single();
    if (error) fail(error, "reading the release");
    const r = fromRow(data as ReleaseRow);
    return { ...metaOf(r), snapshot: ReleaseSnapshot.parse(r.snapshot) };
  }

  async function pageRows(siteId: string, withDraft: boolean): Promise<PageRow[]> {
    const columns = withDraft ? "id, site_id, path, kind, sort, draft_rev, draft" : "id, site_id, path, kind, sort, draft_rev, title:draft->root->props->>title";
    const { data, error } = await db.from("site_pages").select(columns).eq("site_id", siteId).is("deleted_at", null).order("sort").order("path");
    if (error) fail(error, "listing pages");
    return (data ?? []) as unknown as PageRow[];
  }

  const store: SiteStore = {
    async getLive(siteId) {
      const { data, error } = await db.rpc("live_release", { site_id: siteId });
      if (error) fail(error, "reading the live site");
      if (!data) return null;
      const r = data as ReleaseJson;
      // Page by page: a stored page that no longer parses is left out (and logged), not the whole site.
      const snapshot = parseSnapshot(r.snapshot, (m) => console.error(`[genesis-sites] the live release of site ${siteId}: ${m}`));
      if (!snapshot) return null;
      return { ...metaOf(r), snapshot };
    },
    async getDraft(siteId) {
      const { data, error } = await db.from("sites").select("draft, draft_rev").eq("id", siteId).maybeSingle();
      if (error) fail(error, "reading the site");
      if (!data) return null;
      return { site: SiteDoc.parse((data as { draft: unknown }).draft), rev: (data as { draft_rev: number }).draft_rev };
    },
    async saveSiteDraft(siteId, rev, site): Promise<SaveResult<SiteDoc>> {
      const doc = SiteDoc.parse(site);
      const { data, error } = await db.rpc("save_site_draft", { site_id: siteId, expected_rev: rev, doc });
      if (error?.code === "GS409") {
        const current = await store.getDraft(siteId);
        if (!current) fail(error, "saving the site");
        return { conflict: current.site, rev: current.rev };
      }
      if (error) fail(error, "saving the site");
      return { rev: data as number };
    },
    async listPages(siteId) {
      return (await pageRows(siteId, false)).map(pageMeta);
    },
    async getPageDraft(pageId) {
      const { data, error } = await db.from("site_pages").select("id, site_id, path, kind, draft, draft_rev").eq("id", pageId).is("deleted_at", null).maybeSingle();
      if (error) fail(error, "reading the page");
      if (!data) return null;
      const row = data as PageRow;
      return { doc: PageDoc.parse(row.draft), rev: row.draft_rev, siteId: row.site_id, path: row.path, kind: row.kind };
    },
    async savePageDraft(pageId, rev, doc): Promise<SaveResult<PageDoc>> {
      const parsed = PageDoc.parse(doc);
      const { data, error } = await db.rpc("save_page_draft", { page_id: pageId, expected_rev: rev, doc: parsed });
      if (error?.code === "GS409") {
        const current = await store.getPageDraft(pageId);
        if (!current) fail(error, "saving the page");
        return { conflict: current.doc, rev: current.rev };
      }
      if (error) fail(error, "saving the page");
      return { rev: data as number };
    },
    async createPage(siteId, page) {
      const doc = PageDoc.parse(page.doc);
      const { data, error } = await db.rpc("create_page", { site_id: siteId, path: page.path, kind: page.kind ?? "page", doc });
      if (error) fail(error, "creating the page");
      const meta = (await store.listPages(siteId)).find((p) => p.id === data);
      if (!meta) throw new SiteStoreError("The page was created but can't be read back.", undefined);
      return meta;
    },
    async movePage(pageId, path) {
      const { error } = await db.rpc("move_page", { page_id: pageId, new_path: path });
      if (error) fail(error, "moving the page");
      const draft = await store.getPageDraft(pageId);
      if (!draft) throw new SiteStoreError("The page moved but can't be read back.", undefined);
      const meta = (await store.listPages(draft.siteId)).find((p) => p.id === pageId)!;
      return meta;
    },
    async deletePage(pageId) {
      const { error } = await db.rpc("delete_page", { page_id: pageId });
      if (error) fail(error, "deleting the page");
    },
    async publish(siteId, opts: PublishOptions = {}) {
      const draft = await store.getDraft(siteId);
      if (!draft) throw new SiteStoreError(`No site ${siteId} (or you can't see it).`, "P0002");
      const rows = await pageRows(siteId, true);
      const pages = rows.map((r) => ({ id: r.id, path: r.path, kind: r.kind, doc: PageDoc.parse(r.draft), rev: r.draft_rev }));
      // Throws PublishBlockedError when a check fails.
      const prepared = prepareRelease(draft.site, pages, opts);
      // Migrated props go back into the drafts first, so the release holds them.
      const revs: Record<string, number> = Object.fromEntries(pages.map((p) => [p.id, p.rev]));
      let siteRev = draft.rev;
      for (const m of prepared.migratedPages) {
        const saved = await store.savePageDraft(m.id, revs[m.id]!, m.doc);
        if ("conflict" in saved) throw new SiteStoreError("A page changed while publishing; check again.", "GS409");
        revs[m.id] = saved.rev;
      }
      if (prepared.migratedSite) {
        const saved = await store.saveSiteDraft(siteId, siteRev, prepared.migratedSite);
        if ("conflict" in saved) throw new SiteStoreError("The site changed while publishing; check again.", "GS409");
        siteRev = saved.rev;
      }
      const { data, error } = await db.rpc("publish_site", {
        site_id: siteId,
        expected_site_rev: siteRev,
        expected_pages: revs,
        note: opts.note ?? null,
        brand_hash: prepared.brandHash,
      });
      if (error) fail(error, "publishing");
      return release((data as ReleaseJson).id);
    },
    async rollback(siteId, releaseId) {
      const { data, error } = await db.rpc("rollback_site", { site_id: siteId, release_id: releaseId });
      if (error) fail(error, "rolling back");
      return release((data as ReleaseJson).id);
    },
    async listReleases(siteId) {
      const { data, error } = await db.from("site_releases").select("id, site_id, number, note, created_at, published_at, brand_hash").eq("site_id", siteId).order("number", { ascending: false });
      if (error) fail(error, "listing releases");
      return ((data ?? []) as ReleaseRow[]).map((r) => metaOf(fromRow(r)));
    },
    async putAsset(siteId, file: Blob, meta: AssetMeta = {}): Promise<Asset> {
      const mime = file.type || "application/octet-stream";
      // Images under sites/<id>/, files to download (a PDF) under sites/<id>/files/.
      const path = assetPath(siteId, crypto.randomUUID(), meta.name, mime);
      // The types the database records (no SVG or HTML: a browser runs them as pages). Checked before the upload,
      // so a refused file never reaches the bucket.
      if (!ASSET_TYPES.includes(mime)) throw new SiteStoreError(`uploading: ${mime} isn't an image (PNG, JPEG, WebP, AVIF, GIF) or a PDF.`, "22023");
      const upload = await client.storage.from(bucket).upload(path, file, { contentType: mime, upsert: false });
      if (upload.error) throw new SiteStoreError(`uploading: ${upload.error.message}`, undefined);
      const { data, error } = await db
        .from("site_assets")
        .insert({ site_id: siteId, path, mime, alt: meta.alt ?? null, width: meta.width ?? null, height: meta.height ?? null })
        .select("id")
        .single();
      if (error) {
        await client.storage.from(bucket).remove([path]);
        fail(error, "recording the upload");
      }
      const url = client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      return { id: (data as { id: string }).id, siteId, path, url, mime, alt: meta.alt ?? null, width: meta.width ?? null, height: meta.height ?? null };
    },

    // ── Posts ──
    async listLivePosts(siteId): Promise<PostSummary[]> {
      const { data, error } = await db.rpc("live_posts", { site_id: siteId });
      if (error) fail(error, "reading the posts");
      // Item by item, as a page is: a stored post that no longer parses is left out and logged.
      const out: PostSummary[] = [];
      for (const item of Array.isArray(data) ? data : []) {
        const parsed = PostSummarySchema.safeParse(item);
        if (parsed.success) out.push(parsed.data as PostSummary);
        else console.error(`[genesis-sites] a post of site ${siteId} doesn't parse and is left out of the list: ${parsed.error.message}`);
      }
      return out;
    },
    async getLivePost(siteId, slug): Promise<LivePost | null> {
      const { data, error } = await db.rpc("live_post", { site_id: siteId, slug });
      if (error) fail(error, "reading the post");
      if (!data) return null;
      const raw = data as { slug: string; publishedAt: string; updatedAt: string; doc: unknown };
      // A stored post that no longer parses is left out (and logged), as a page would be.
      const doc = PostDoc.safeParse(raw.doc);
      if (!doc.success) {
        console.error(`[genesis-sites] the post ${JSON.stringify(slug)} of site ${siteId} doesn't parse and is left out: ${doc.error.message}`);
        return null;
      }
      return { slug: raw.slug, publishedAt: raw.publishedAt, updatedAt: raw.updatedAt, doc: doc.data };
    },
    async listPosts(siteId) {
      const { data, error } = await db.from("site_posts").select(POST_META).eq("site_id", siteId).is("deleted_at", null).order("published_at", { ascending: false, nullsFirst: true }).order("updated_at", { ascending: false });
      if (error) fail(error, "listing posts");
      return ((data ?? []) as unknown as PostRow[]).map(postMeta);
    },
    async getPost(postId) {
      const { data, error } = await db.from("site_posts").select(`${POST_META}, draft`).eq("id", postId).is("deleted_at", null).maybeSingle();
      if (error) fail(error, "reading the post");
      if (!data) return null;
      const row = data as unknown as PostRow;
      const doc = PostDoc.safeParse(row.draft);
      if (!doc.success) {
        console.error(`[genesis-sites] the draft of post ${postId} doesn't parse: ${doc.error.message}`);
        return null;
      }
      return { ...postMeta(row), doc: doc.data };
    },
    async savePost(siteId, input) {
      validatePostSlug(input.slug);
      const doc = PostDoc.parse(input.doc);
      const { data, error } = await db.rpc("save_post", { site_id: siteId, post_id: input.id ?? null, slug: input.slug, expected_rev: input.rev ?? null, doc });
      if (error?.code === "GS409" && input.id) {
        const current = await store.getPost!(input.id);
        if (!current) fail(error, "saving the post");
        return { id: input.id, conflict: current.doc, rev: current.rev };
      }
      if (error) fail(error, "saving the post");
      const saved = data as { id: string; rev: number };
      return { id: saved.id, rev: saved.rev };
    },
    async publishPost(postId) {
      const draft = await store.getPost!(postId);
      if (!draft) throw new SiteStoreError(`No post ${postId} (or you can't see it).`, "P0002");
      const issues = checkPost(draft.slug, draft.doc);
      if (!isPublishable(issues)) throw new PublishBlockedError(issues);
      // The revision just checked: if someone saved since, the database refuses (GS409).
      const { data, error } = await db.rpc("publish_post", { post_id: postId, expected_rev: draft.rev });
      if (error) fail(error, "publishing the post");
      return fromPostJson(data as Parameters<typeof fromPostJson>[0]);
    },
    async unpublishPost(postId) {
      const { data, error } = await db.rpc("unpublish_post", { post_id: postId });
      if (error) fail(error, "taking the post down");
      return fromPostJson(data as Parameters<typeof fromPostJson>[0]);
    },
    async deletePost(postId) {
      const { error } = await db.rpc("delete_post", { post_id: postId });
      if (error) fail(error, "deleting the post");
    },
    async importPosts(siteId, list): Promise<ImportPostsResult> {
      if (list.length > MAX_IMPORT_POSTS) throw new SiteStoreError(`Import at most ${MAX_IMPORT_POSTS} posts at a time.`, "22023");
      // The checks run here; a post that fails one is imported as a draft, with its issues.
      const result: ImportPostsResult = { imported: [], skipped: [] };
      const issues = new Map<string, string[]>();
      const rows: { slug: string; doc: PostDoc; status: PostStatus; publishedAt: string }[] = [];
      for (const item of list) {
        const prepared = prepareImportPost(item);
        if ("reason" in prepared) result.skipped.push(prepared);
        else {
          rows.push({ slug: item.slug, doc: prepared.doc, status: prepared.status, publishedAt: prepared.publishedAt });
          if (prepared.issues.length) issues.set(item.slug, prepared.issues);
        }
      }
      if (rows.length) {
        const { data, error } = await db.rpc("import_posts", { site_id: siteId, posts: rows });
        if (error) fail(error, "importing posts");
        const out = data as ImportPostsResult;
        for (const imported of out.imported) result.imported.push({ ...imported, ...(issues.has(imported.slug) ? { issues: issues.get(imported.slug)! } : {}) });
        result.skipped.push(...out.skipped);
      }
      return result;
    },
  };
  return store;
}
