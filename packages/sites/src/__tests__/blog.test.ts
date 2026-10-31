/**
 * @feat:sites-blog
 * The blog: posts in the memory store (drafts, compare-and-swap, slugs,
 * publish checks, take-down, delete, import), the post page (index and
 * post routes, pages of posts, Article JSON-LD, breadcrumbs, og:type), the
 * sitemap and RSS, preview of drafts, and the release checks.
 */
import { describe, expect, it, vi } from "vitest";
import { handleSiteRequest, type SiteRequestOptions } from "../web/index";
import {
  checkBlog,
  checkHtmlOutline,
  checkPost,
  createMemorySiteStore,
  exampleBrands,
  isPublishable,
  PublishBlockedError,
  withCacheInvalidation,
  type PageDoc,
  type ReleaseSnapshot,
  type SectionNode,
} from "../index";
import { postDoc } from "./fixtures";
import { PostSummarySchema, rssXml, sitemapXml, type PostSummary } from "../index";

const ORIGIN = "https://hilltop.example";
const brand = exampleBrands.hilltop;
const get = (path: string) => new Request(`${ORIGIN}${path}`);

const node = (id: string, type: string, props: Record<string, unknown>, variant?: string): SectionNode => ({ id, type, v: 1, ...(variant ? { variant } : {}), props });
const page = (title: string, content: SectionNode[], description = `${title} at Hilltop Collective.`): PageDoc => ({ schemaVersion: 1, root: { props: { title } }, content, seo: { description } });

/** A site with a home page, a post page at /blog (the index and every post) and a latest-posts list on the home page. */
async function blogSite(now = () => new Date("2026-10-20T10:00:00Z")) {
  const store = createMemorySiteStore({ now });
  await store.createSite({
    id: "hilltop",
    site: { schemaVersion: 1, name: "Hilltop Collective", nav: [{ label: "Blog", href: "/blog" }], seo: { titleTemplate: "%s · Hilltop Collective", description: "Made on the hill." } },
    pages: [
      { path: "/", doc: page("Home", [node("hero", "hero", { heading: "Made on the hill" }), node("latest", "blog-list", { heading: "From the blog", perPage: 2, paginate: false }, "list")]) },
      { path: "/blog", kind: "post", doc: page("Blog", [node("post", "post-body", {}), node("more", "blog-list", { heading: "More posts", perPage: 2 }, "grid")], "Notes from the floor.") },
    ],
  });
  return store;
}

async function withPosts() {
  let clock = new Date("2026-09-01T09:00:00Z");
  const store = await blogSite(() => clock);
  const ids: Record<string, string> = {};
  for (const [i, slug] of ["first-steps", "warm-up", "scaling", "open-day", "secret"].entries()) {
    clock = new Date(Date.UTC(2026, 8, 1 + i, 9));
    const saved = await store.savePost!("hilltop", { slug, doc: postDoc(slug === "secret" ? "Secret plans" : `Post ${slug}`, slug === "warm-up" ? { cover: { src: "/images/tools.jpg", alt: "Tools" }, author: { name: "Sam Lee" }, category: "Training" } : {}) });
    ids[slug] = saved.id;
    if (slug !== "secret") await store.publishPost!(saved.id);
  }
  await store.publish("hilltop", { brand });
  return { store, ids };
}

const opts = (store: SiteRequestOptions["store"], over: Partial<SiteRequestOptions> = {}): SiteRequestOptions => ({ store, brand: { getBrand: () => brand }, siteId: "hilltop", origin: ORIGIN, ...over });

describe("posts in the store", () => {
  it("saves drafts by compare-and-swap and keeps a slug once published", async () => {
    const store = await blogSite();
    const first = await store.savePost!("hilltop", { slug: "first-steps", doc: postDoc("First steps") });
    expect(first).toEqual({ id: expect.any(String), rev: 1 });
    await expect(store.savePost!("hilltop", { slug: "first-steps", doc: postDoc("Again") })).rejects.toThrow(/already/);
    await expect(store.savePost!("hilltop", { slug: "Bad Slug", doc: postDoc("Bad") })).rejects.toThrow(/slug/);
    expect(await store.savePost!("hilltop", { id: first.id, slug: "first-steps", rev: 1, doc: postDoc("Edited") })).toEqual({ id: first.id, rev: 2 });
    const stale = await store.savePost!("hilltop", { id: first.id, slug: "first-steps", rev: 1, doc: postDoc("Stale") });
    expect("conflict" in stale && stale.conflict.title).toBe("Edited");
    // A draft that was never published may move; a published one keeps its address.
    await store.savePost!("hilltop", { id: first.id, slug: "first-step", rev: 2, doc: postDoc("Edited") });
    await store.publishPost!(first.id);
    await expect(store.savePost!("hilltop", { id: first.id, slug: "renamed", rev: 3, doc: postDoc("Edited") })).rejects.toThrow(/keeps its slug/);
  });

  it("refuses to publish a post whose image has no alt text or whose text holds an h1 or skips a level", async () => {
    const store = await blogSite();
    const noAlt = await store.savePost!("hilltop", { slug: "no-alt", doc: postDoc("No alt", { cover: { src: "/images/x.jpg", alt: "" } }) });
    await expect(store.publishPost!(noAlt.id)).rejects.toBeInstanceOf(PublishBlockedError);
    const h1 = postDoc("Big heading", { body: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Too big" }] }] } });
    expect(checkPost("big", h1).map((i) => i.code)).toContain("heading-h1");
    const skip = postDoc("Skips", { body: { type: "doc", content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Skipped" }] }] } });
    expect(checkPost("skips", skip).map((i) => i.code)).toContain("heading-order");
    expect(isPublishable(checkPost("fine", postDoc("Fine")))).toBe(true);
  });

  it("serves only published copies, newest first, and only while the site is live", async () => {
    const store = await blogSite();
    const a = await store.savePost!("hilltop", { slug: "a", doc: postDoc("A") });
    await store.publishPost!(a.id);
    expect(await store.listLivePosts!("hilltop")).toEqual([]); // the site itself isn't published yet
    await store.publish("hilltop", { brand });
    await store.savePost!("hilltop", { id: a.id, slug: "a", rev: 1, doc: postDoc("A, draft edit") });
    const live = await store.listLivePosts!("hilltop");
    expect(live.map((p) => p.title)).toEqual(["A"]);
    expect((await store.getLivePost!("hilltop", "a"))?.doc.title).toBe("A");
    await store.unpublishPost!(a.id);
    expect(await store.getLivePost!("hilltop", "a")).toBeNull();
    await store.setStatus("hilltop", "archived");
    expect(await store.listLivePosts!("hilltop")).toEqual([]);
  });

  it("imports posts once: keeps slugs and dates, skips clashes, and drafts the ones that fail a check", async () => {
    const { store } = await withPosts();
    const result = await store.importPosts!("hilltop", [
      { slug: "old-news", doc: postDoc("Old news"), publishedAt: "2023-03-14T09:00:00Z" },
      { slug: "scaling", doc: postDoc("Clash") },
      { slug: "Bad Slug", doc: postDoc("Bad") },
      { slug: "no-alt-cover", doc: postDoc("No alt", { cover: { src: "https://cdn.example/x.jpg", alt: "" } }) },
      { slug: "kept-draft", doc: postDoc("Later"), status: "draft" },
      { slug: "bad-date", doc: postDoc("Bad date"), publishedAt: "yesterday-ish" },
    ]);
    expect(result.imported.map((i) => [i.slug, i.status])).toEqual([
      ["old-news", "published"],
      ["no-alt-cover", "draft"],
      ["kept-draft", "draft"],
    ]);
    expect(result.imported[1]!.issues?.join(" ")).toMatch(/alt text/);
    expect(result.skipped.map((s) => s.slug).sort()).toEqual(["Bad Slug", "bad-date", "scaling"]);
    const old = (await store.listLivePosts!("hilltop")).find((p) => p.slug === "old-news");
    expect(old?.publishedAt).toBe("2023-03-14T09:00:00.000Z");
  });

  it("dates an import no later than now, as the database does, and refuses one before 1970", async () => {
    const { store } = await withPosts();
    const r = await store.importPosts!("hilltop", [
      { slug: "from-the-future", doc: postDoc("Future"), publishedAt: "2999-01-01T00:00:00Z" },
      { slug: "too-old", doc: postDoc("Old"), publishedAt: "1969-12-31T00:00:00Z" },
    ]);
    expect(r.skipped.map((s) => s.slug)).toEqual(["too-old"]);
    const future = (await store.listLivePosts!("hilltop")).find((p) => p.slug === "from-the-future")!;
    expect(Date.parse(future.publishedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("publishes and imports nothing on an archived site", async () => {
    const { store, ids } = await withPosts();
    await store.setStatus("hilltop", "archived");
    await expect(store.publishPost!(ids.secret!)).rejects.toThrow(/archived/);
    await expect(store.importPosts!("hilltop", [{ slug: "x", doc: postDoc("X") }])).rejects.toThrow(/archived/);
  });

  it("purges the site's cache when a post goes up, comes down, is deleted or imported", async () => {
    const { store, ids } = await withPosts();
    const invalidate = vi.fn();
    const wrapped = withCacheInvalidation(store, invalidate);
    await wrapped.publishPost!(ids.secret!);
    await wrapped.unpublishPost!(ids.secret!);
    await wrapped.deletePost!(ids.scaling!);
    await wrapped.importPosts!("hilltop", [{ slug: "imported", doc: postDoc("Imported") }]);
    expect(invalidate.mock.calls.map((c) => [c[0], c[1].action])).toEqual([
      [["site:hilltop"], "post"],
      [["site:hilltop"], "post"],
      [["site:hilltop"], "post"],
      [["site:hilltop"], "post"],
    ]);
  });
});

describe("the post page", () => {
  it("is the blog's index at its own path: the posts, newest first, in pages, with an h1", async () => {
    const { store } = await withPosts();
    const res = (await handleSiteRequest(get("/blog"), opts(store)))!;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(checkHtmlOutline(html)).toEqual([]);
    expect(html).toContain('<h1 class="sr-only">Blog</h1>');
    expect(html).toContain('href="/blog/open-day"');
    expect(html).toContain('href="/blog/scaling"');
    expect(html).not.toContain("/blog/warm-up"); // page 2
    expect(html).not.toContain("Secret plans");
    expect(html).toContain('href="/blog?page=2" rel="next"');
    const two = await (await handleSiteRequest(get("/blog?page=2"), opts(store)))!.text();
    expect(two).toContain('href="/blog/warm-up"');
    expect(two).toContain('href="/blog/first-steps"');
    expect(two).toContain('href="/blog" rel="prev"');
    expect(html).toContain('<link rel="alternate" type="application/rss+xml" title="Hilltop Collective" href="/rss.xml"/>');
  });

  it("shows each post at /blog/<slug>: its title as the h1, Article JSON-LD, og:type article and a breadcrumb through the blog", async () => {
    const { store } = await withPosts();
    const res = (await handleSiteRequest(get("/blog/warm-up"), opts(store)))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("vercel-cache-tag")).toBe("site:hilltop");
    const html = await res.text();
    expect(checkHtmlOutline(html)).toEqual([]);
    expect(html).toMatch(/<h1[^>]*>Post warm-up<\/h1>/);
    expect(html).toContain("<title>Post warm-up · Hilltop Collective</title>");
    expect(html).toContain('<meta property="og:type" content="article"/>');
    expect(html).toContain('<meta property="article:published_time" content="2026-09-02T09:00:00.000Z"/>');
    expect(html).toContain('<link rel="canonical" href="https://hilltop.example/blog/warm-up"/>');
    expect(html).toMatch(/By (<!-- -->)?Sam Lee/);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
    const article = ld.find((d) => d["@type"] === "Article");
    expect(article).toMatchObject({ headline: "Post warm-up", datePublished: "2026-09-02T09:00:00.000Z", author: { "@type": "Person", name: "Sam Lee" }, articleSection: "Training" });
    expect(article.image).toEqual(["https://hilltop.example/images/tools.jpg"]);
    const crumbs = ld.find((d) => d["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Home", "Blog", "Post warm-up"]);
    // "More posts" leaves the post itself out.
    expect(html).not.toContain('href="/blog/warm-up"');
  });

  it("answers a draft, an unknown slug or a nested path like any unknown path", async () => {
    const { store } = await withPosts();
    expect(await handleSiteRequest(get("/blog/secret"), opts(store))).toBeNull();
    expect(await handleSiteRequest(get("/blog/nope"), opts(store))).toBeNull();
    expect(await handleSiteRequest(get("/blog/a/b"), opts(store))).toBeNull();
    expect((await handleSiteRequest(get("/blog/nope"), opts(store, { unknownPath: "not-found" })))!.status).toBe(404);
    // One address per post: lowercase, no trailing slash.
    const moved = (await handleSiteRequest(get("/blog/Warm-Up/"), opts(store)))!;
    expect(moved.status).toBe(308);
    expect(moved.headers.get("location")).toBe("/blog/warm-up");
  });

  it("lists the latest posts elsewhere, linking under the post page's path", async () => {
    const { store } = await withPosts();
    const html = await (await handleSiteRequest(get("/"), opts(store)))!.text();
    expect(html).toContain('href="/blog/open-day"');
    expect(html).not.toContain("rel=\"next\"");
  });

  it("previews drafts to a viewer, never cached", async () => {
    const { store } = await withPosts();
    const res = (await handleSiteRequest(get("/blog/secret"), opts(store, { mode: "preview", viewer: "user-1" })))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toContain("Secret plans");
  });

  it("reads no draft for an anonymous preview: the host answers, on a page, the post page and a post", async () => {
    const { store } = await withPosts();
    // As the Supabase store does for anon: no grant on the draft tables (42501).
    const denied = () => Promise.reject(Object.assign(new Error("permission denied for table site_posts"), { code: "42501" }));
    const drafts = { getDraft: vi.fn(denied), listPages: vi.fn(denied), getPageDraft: vi.fn(denied), listPosts: vi.fn(denied), getPost: vi.fn(denied) };
    const anon = { ...store, ...drafts } as unknown as SiteRequestOptions["store"];
    for (const path of ["/", "/blog", "/blog/secret", "/blog/warm-up"]) {
      expect(await handleSiteRequest(get(path), opts(anon, { mode: "preview" }))).toBeNull();
      expect(await handleSiteRequest(get(path), opts(anon, { mode: "preview", viewer: null, unknownPath: "not-found" }))).toBeNull();
    }
    for (const read of Object.values(drafts)) expect(read).not.toHaveBeenCalled();
  });

  it("serves the page with an empty list when the published posts can't be read", async () => {
    const { store } = await withPosts();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...store, listLivePosts: () => Promise.reject(new Error("connection reset")) } as unknown as SiteRequestOptions["store"];
    const home = (await handleSiteRequest(get("/"), opts(broken)))!;
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("Made on the hill");
    expect(html).not.toContain('href="/blog/open-day"');
    expect((await handleSiteRequest(get("/sitemap.xml"), opts(broken)))!.status).toBe(200);
    expect((await handleSiteRequest(get("/rss.xml"), opts(broken)))!.status).toBe(200);
    expect(error.mock.calls.some((c) => String(c[0]).includes("reading the published posts of site hilltop failed"))).toBe(true);
    error.mockRestore();
  });

  it("answers not found when a published post can't be read", async () => {
    const { store } = await withPosts();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...store, getLivePost: () => Promise.reject(new Error("connection reset")) } as unknown as SiteRequestOptions["store"];
    expect(await handleSiteRequest(get("/blog/warm-up"), opts(broken))).toBeNull();
    expect((await handleSiteRequest(get("/blog/warm-up"), opts(broken, { unknownPath: "not-found" })))!.status).toBe(404);
    expect(error.mock.calls.some((c) => String(c[0]).includes('reading the published post "warm-up" of site hilltop failed'))).toBe(true);
    error.mockRestore();
  });

  it("puts every published post in the sitemap and the RSS feed, escaped", async () => {
    const { store, ids } = await withPosts();
    await store.savePost!("hilltop", { id: ids.scaling!, slug: "scaling", rev: 1, doc: postDoc("Scaling & </title><script>x</script>") });
    await store.publishPost!(ids.scaling!);
    const sitemap = await (await handleSiteRequest(get("/sitemap.xml"), opts(store)))!.text();
    expect(sitemap).toContain("<loc>https://hilltop.example/blog/warm-up</loc>");
    expect(sitemap).not.toContain("/blog/secret");
    const rss = (await handleSiteRequest(get("/rss.xml"), opts(store)))!;
    expect(rss.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    const xml = await rss.text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<link>https://hilltop.example/blog/open-day</link>");
    expect(xml).toContain("Scaling &amp; &lt;/title&gt;&lt;script&gt;x&lt;/script&gt;");
    expect(xml).not.toContain("Secret plans");
    const page = await (await handleSiteRequest(get("/blog/scaling"), opts(store)))!.text();
    expect(page).not.toContain("</title><script>x");
  });

  it("has no feed on a site with no post page", async () => {
    const store = createMemorySiteStore();
    await store.createSite({ id: "plain", site: { schemaVersion: 1, name: "Plain" }, pages: [{ path: "/", doc: page("Home", [node("hero", "hero", { heading: "Hi" })]) }] });
    await store.publish("plain", { brand });
    expect(await handleSiteRequest(get("/rss.xml"), { store, brand: { getBrand: () => brand }, siteId: "plain" })).toBeNull();
  });
});

describe("a stored post that skipped the checks", () => {
  const good: PostSummary = { slug: "good", title: "Good", publishedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" };
  const bad = [
    { ...good, slug: "never", publishedAt: "-infinity", updatedAt: "-infinity" },
    { ...good, slug: "object-excerpt", excerpt: { html: "<b>x</b>" } },
  ] as unknown as PostSummary[];
  const siteDoc = { schemaVersion: 1 as const, name: "Hilltop Collective", lang: "en", theme: { colorScheme: "light" as const }, header: [], nav: [], footer: [], seo: {}, redirects: [] };
  const blogPage = { id: "b", path: "/blog", kind: "post" as const, doc: page("Blog", []) };

  it("is left out of the list, the feed and the sitemap instead of breaking them", () => {
    expect(PostSummarySchema.safeParse(bad[0]).success).toBe(false);
    expect(PostSummarySchema.safeParse(bad[1]).success).toBe(false);
    expect(PostSummarySchema.safeParse(good).success).toBe(true);
    const rss = rssXml({ site: siteDoc, posts: [...bad, good], postsPath: "/blog", origin: ORIGIN });
    expect(rss).toContain("/blog/good");
    expect(rss).not.toContain("/blog/never");
    expect(rss).not.toContain("[object Object]");
    const sitemap = sitemapXml({ site: siteDoc, pages: [blogPage], origin: ORIGIN, posts: { path: "/blog", items: [...bad, good] } });
    expect(sitemap).toContain("<loc>https://hilltop.example/blog/never</loc></url>"); // no lastmod, still a page
  });
});

describe("the release checks for a blog", () => {
  const snap = (pages: ReleaseSnapshot["pages"]): ReleaseSnapshot => ({ schemaVersion: 1, site: { schemaVersion: 1, name: "S", lang: "en", theme: { colorScheme: "light" }, header: [], nav: [], footer: [], seo: {}, redirects: [] }, pages });
  it("wants one post page, not at /, with a post section, and a post page for any post list", () => {
    const body = node("post", "post-body", {});
    const codes = (pages: ReleaseSnapshot["pages"]) => checkBlog(snap(pages)).map((i) => i.code);
    expect(codes([{ id: "b", path: "/blog", kind: "post", doc: page("Blog", [body]) }])).toEqual([]);
    expect(codes([{ id: "b", path: "/blog", kind: "post", doc: page("Blog", []) }])).toEqual(["post-page-body"]);
    expect(codes([{ id: "h", path: "/", kind: "post", doc: page("Home", [body]) }])).toContain("post-page-home");
    expect(
      codes([
        { id: "b", path: "/blog", kind: "post", doc: page("Blog", [body]) },
        { id: "n", path: "/news", kind: "post", doc: page("News", [body]) },
      ]),
    ).toContain("post-page-count");
    expect(codes([{ id: "h", path: "/", kind: "page", doc: page("Home", [node("l", "blog-list", { heading: "Posts" })]) }])).toEqual(["blog-list-no-post-page"]);
  });

  it("refuses the post section on any page but the post page", async () => {
    const store = createMemorySiteStore();
    await store.createSite({ id: "s", site: { schemaVersion: 1, name: "S" }, pages: [{ path: "/", doc: page("Home", [node("post", "post-body", {})]) }] });
    await expect(store.publish("s", { brand })).rejects.toThrow(/can't go on a page page/);
  });
});
