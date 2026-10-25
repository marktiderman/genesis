/**
 * Blog posts: a site's collection of dated articles.
 *
 * A post is its own document (`PostDoc`), kept beside the pages rather than
 * in them, with a draft and a published copy. `publishPost` checks the draft
 * and copies it to the published copy; that copy is what visitors see, so
 * a post goes live (and comes down) on its own, without republishing the
 * site. The site's `post` page is the template every post renders in: at its
 * own path it is the blog's index, and at `<path>/<slug>` it shows the post.
 */
import { z } from "zod";
import { Copy, Href, Image, Line, RichText, Seo } from "./schemas";

/** A post's slug: lowercase letters, digits and single hyphens (`september-testing`). */
export const PostSlug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "A post slug is lowercase letters, digits and single hyphens.");

export const PostAuthor = z.object({
  name: Line(80),
  /** Their page: a site path or an http(s) URL. */
  url: Href.optional(),
});

export const PostDoc = z.object({
  schemaVersion: z.literal(1),
  title: Line(160),
  /** A sentence or two for the list, search results and the feed. */
  excerpt: Copy(400).optional(),
  body: RichText,
  cover: Image.optional(),
  author: PostAuthor.optional(),
  category: Line(60).optional(),
  tags: z.array(Line(40)).max(12).optional(),
  seo: Seo.optional(),
});
export type PostDoc = z.infer<typeof PostDoc>;
export type PostDocInput = z.input<typeof PostDoc>;

export type PostStatus = "draft" | "published";

/** A post as the editor lists it. */
export interface PostMeta {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  status: PostStatus;
  /** The draft's revision, for compare-and-swap saves. */
  rev: number;
  /** When it was first published (kept when it is published again), or null. */
  publishedAt: string | null;
  updatedAt: string;
}

/** A post's draft, for the editor. */
export interface PostDraft extends PostMeta {
  doc: PostDoc;
}

/** A published post, as visitors see it. */
export interface LivePost {
  slug: string;
  publishedAt: string;
  /** When its published copy last changed. */
  updatedAt: string;
  doc: PostDoc;
}

/** A published post in a list: everything but the body. */
export interface PostSummary {
  slug: string;
  title: string;
  excerpt?: string;
  cover?: Image;
  author?: z.infer<typeof PostAuthor>;
  category?: string;
  /** Kept out of the sitemap and the feed (`seo.noindex`, or a canonical elsewhere). */
  noindex?: boolean;
  publishedAt: string;
  updatedAt: string;
}

/** The most posts a list reads (the newest first). */
export const MAX_LIVE_POSTS = 500;

/** A save of a post: a new one (no `id`), or a compare-and-swap of an existing one's draft. */
export interface SavePostInput {
  id?: string;
  slug: string;
  /** The draft revision this save started from (required with `id`). */
  rev?: number;
  doc: PostDocInput;
}

export type SavePostResult = { id: string; rev: number } | { id: string; conflict: PostDoc; rev: number };

/** One post to import (a move from another site): published as of `publishedAt` unless it fails a check. */
export interface ImportPost {
  slug: string;
  doc: PostDocInput;
  /** When it was first published, kept from the old site (default: now). */
  publishedAt?: string;
  /** `draft` imports it unpublished. Default `published`. */
  status?: PostStatus;
}

export interface ImportPostsResult {
  /** Imported posts: published, or a draft when asked for or when a check failed (see `issues`). */
  imported: { slug: string; id: string; status: PostStatus; issues?: string[] }[];
  /** Posts left out: a slug the site already has, or a document that doesn't parse. */
  skipped: { slug: string; reason: string }[];
}

/** The most posts one `importPosts` call takes. */
export const MAX_IMPORT_POSTS = 500;

/** A published post as a list item. */
export function postSummary(post: LivePost): PostSummary {
  const d = post.doc;
  return {
    slug: post.slug,
    title: d.title,
    ...(d.excerpt ? { excerpt: d.excerpt } : {}),
    ...(d.cover ? { cover: d.cover } : {}),
    ...(d.author ? { author: d.author } : {}),
    ...(d.category ? { category: d.category } : {}),
    ...(d.seo?.noindex || d.seo?.canonical ? { noindex: true } : {}),
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  };
}

/** Plain text of a rich text document (for a feed's description when a post has no excerpt). */
export function richTextPlain(value: unknown, max = 400): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (out.join(" ").length > max || !node || typeof node !== "object") return;
    const n = node as { type?: unknown; text?: unknown; content?: unknown };
    if (n.type === "text" && typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(value);
  const text = out.join(" ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Validate a post slug, throwing with a readable message. */
export function validatePostSlug(slug: string): string {
  const parsed = PostSlug.safeParse(slug);
  if (!parsed.success) throw new Error(`"${slug}": ${parsed.error.issues[0]?.message ?? "not a post slug"}`);
  return slug;
}
