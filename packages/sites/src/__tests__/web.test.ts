/**
 * @feat:sites-renderer
 * handleSiteRequest: redirects, unknown and reserved paths, cache headers,
 * no hydration, preview, robots and sitemap, assets, forms, and the cache
 * after publish and rollback.
 */
import { describe, expect, it, vi } from "vitest";
import { ASSETS } from "../web/assets.generated";
import { ASSETS_PREFIX, handleSiteRequest, type SiteRequestOptions } from "../web/index";
import { checkHtmlOutline, createMemorySiteStore, exampleBrands, isConflict, landingPage, onePageSite, PublishBlockedError, withCacheInvalidation } from "../index";
import { brand, contactForm, formsResolver, seededStore } from "./fixtures";

const ORIGIN = "https://riverside.example";
const get = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);

async function opts(over: Partial<SiteRequestOptions> = {}): Promise<SiteRequestOptions> {
  return { store: await seededStore(), brand: { getBrand: () => brand }, siteId: "landing", forms: formsResolver, origin: ORIGIN, ...over };
}

describe("serving a page", () => {
  it("renders the landing page as cacheable HTML tagged with the site", async () => {
    const res = (await handleSiteRequest(get("/"), await opts()))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400");
    // The site's tag, and one per embedded form, so a host that edits the form can purge its pages.
    expect(res.headers.get("vercel-cache-tag")).toBe("site:landing,form:free-class");
    expect(res.headers.get("x-genesis-release")).toBe("1");
    const html = await res.text();
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<link rel="canonical" href="https://riverside.example/"/>');
    expect(html).toContain("<style data-gs-theme");
    expect(checkHtmlOutline(html)).toEqual([]);
  });

  it("ships no React hydration: the only script is the islands loader", async () => {
    const res = (await handleSiteRequest(get("/"), await opts()))!;
    const html = await res.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    const executable = scripts.filter((s) => !/type="application\/(ld\+json|json)"/.test(s));
    expect(executable).toEqual([`<script type="module" src="${ASSETS_PREFIX}/${ASSETS.islands.name}">`]);
    expect(html).not.toMatch(/\$RC|__reactContainer|hydrateRoot|self\.__next/);
    expect(ASSETS.islands.body.length).toBeLessThan(5 * 1024);
  });

  it("omits the islands script on a page with no menu and no form", async () => {
    const store = createMemorySiteStore();
    const t = onePageSite({ name: "Hilltop Collective", message: { headline: "Made on the hill", subhead: "Sessions for every level." }, colors: { primary: "#b45309" } });
    await store.createSite({ id: "one", site: t.site, pages: t.pages });
    await store.publish("one", { brand: t.brand });
    const res = (await handleSiteRequest(get("/"), { store, brand: { getBrand: () => t.brand }, siteId: "one" }))!;
    const html = await res.text();
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
  });

  it("sends a strict Content-Security-Policy with the theme's hash", async () => {
    const res = (await handleSiteRequest(get("/"), await opts()))!;
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toMatch(/style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });

  it("serves a simple form as a plain HTML form the loader sends: no form bundle, no form stylesheet", async () => {
    const html = await (await handleSiteRequest(get("/"), await opts()))!.text();
    expect(html).toContain('data-gs-island="light-form"');
    expect(html).toMatch(/<form[^>]*action="\/api\/forms\/free-class"[^>]*method="post"/);
    expect(html).not.toContain('data-gs-island="form"');
    expect(html).not.toContain(ASSETS.formsCss.name);
    expect(html).toContain(`<script type="module" src="${ASSETS_PREFIX}/${ASSETS.islands.name}">`);
  });

  it("serves a form that needs the engine as an island, with the form stylesheet", async () => {
    const forms = (slug: string) => formsResolver(slug === "free-class" ? "branching" : slug, { siteId: "landing", pagePath: "/", mode: "live" });
    const res = (await handleSiteRequest(get("/"), await opts({ forms })))!;
    const html = await res.text();
    expect(html).toContain('data-gs-island="form"');
    expect(html).toContain('data-gs-submit="https://forms.example/submit"');
    expect(html).toContain(`href="${ASSETS_PREFIX}/${ASSETS.formsCss.name}"`);
    expect(ASSETS.islands.body).toContain(ASSETS.formIsland.name);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("connect-src 'self' https://forms.example");
    expect(csp).toContain("form-action 'self' https://forms.example");
  });

  it("keeps the islands loader, light-form sending included, under 5 KB", () => {
    expect(new TextEncoder().encode(ASSETS.islands.body).length).toBeLessThan(5 * 1024);
    expect(ASSETS.islands.body).toContain("light-form");
  });

  it("logs and renders nothing for a form the resolver doesn't know", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = await (await handleSiteRequest(get("/"), await opts({ forms: () => null })))!.text();
    expect(html).not.toContain('data-gs-island="form"');
    expect(error.mock.calls.some((c) => String(c[0]).includes('"free-class"'))).toBe(true);
    error.mockRestore();
  });

  it("serves the other pages of a site under a base path", async () => {
    const o = await opts({ siteId: "starter", basePath: "/sites-demo/starter" });
    const res = (await handleSiteRequest(get("/sites-demo/starter/about"), o))!;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/sites-demo/starter/contact"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(await handleSiteRequest(get("/elsewhere"), o)).toBeNull();
  });

  it("answers HEAD with the headers and no body", async () => {
    const res = (await handleSiteRequest(get("/", { method: "HEAD" }), await opts()))!;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});

describe("what isn't a page", () => {
  it("returns null for the app's reserved paths, so the host answers", async () => {
    const o = await opts();
    for (const path of ["/api", "/api/forms/free-class", "/_server/fn", "/auth/callback"]) expect(await handleSiteRequest(get(path), o), path).toBeNull();
    expect(await handleSiteRequest(get("/admin"), { ...o, reserved: ["/admin"] })).toBeNull();
  });

  it("returns null for an unknown path, or the site's 404 page when asked", async () => {
    const o = await opts();
    expect(await handleSiteRequest(get("/nope"), o)).toBeNull();
    const res = (await handleSiteRequest(get("/nope"), { ...o, unknownPath: "not-found" }))!;
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
    const html = await res.text();
    expect(html).toContain("Page not found");
    expect(html).toContain('content="noindex, nofollow"');
  });

  it("returns null for a site that isn't published, and for POSTs", async () => {
    const store = createMemorySiteStore();
    const t = landingPage({ brand, message: { headline: "Soon" } });
    await store.createSite({ id: "draft", site: t.site, pages: t.pages });
    expect(await handleSiteRequest(get("/"), { store, brand: { getBrand: () => brand }, siteId: "draft" })).toBeNull();
    expect(await handleSiteRequest(get("/", { method: "POST" }), await opts())).toBeNull();
  });

  it("leaves the host's own casing and slashes alone on paths that aren't pages", async () => {
    expect(await handleSiteRequest(get("/Dashboard/"), await opts())).toBeNull();
  });
});

describe("redirects", () => {
  it("follows a moved page's redirect (301), before matching pages", async () => {
    const o = await opts({ siteId: "starter" });
    const store = o.store as Awaited<ReturnType<typeof seededStore>>;
    const about = (await store.listPages("starter")).find((p) => p.path === "/about")!;
    await store.movePage(about.id, "/our-story");
    await store.publish("starter", { brand: exampleBrands.hilltop });
    const res = (await handleSiteRequest(get("/about"), o))!;
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/our-story");
    expect(res.headers.get("vercel-cache-tag")).toBe("site:starter");
    expect((await handleSiteRequest(get("/our-story"), o))!.status).toBe(200);
  });

  it("sends a page's other spellings to its one address (308)", async () => {
    const o = await opts({ siteId: "starter" });
    const res = (await handleSiteRequest(get("/About/?ref=x"), o))!;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/about?ref=x");
  });
});

describe("robots.txt, sitemap.xml and assets", () => {
  it("serves robots.txt and sitemap.xml from the release", async () => {
    const o = await opts({ siteId: "starter" });
    const robots = (await handleSiteRequest(get("/robots.txt"), o))!;
    expect(await robots.text()).toContain("Sitemap: https://riverside.example/sitemap.xml");
    const sitemap = (await handleSiteRequest(get("/sitemap.xml"), o))!;
    expect(sitemap.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(await sitemap.text()).toContain("<loc>https://riverside.example/about</loc>");
  });

  it("serves its own files, content-hashed and immutable, and 404s anything else there", async () => {
    const o = await opts();
    const css = (await handleSiteRequest(get(`${ASSETS_PREFIX}/${ASSETS.css.name}`), o))!;
    expect(css.status).toBe(200);
    expect(css.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect((await handleSiteRequest(get(`${ASSETS_PREFIX}/nope.js`), o))!.status).toBe(404);
  });
});

describe("preview", () => {
  it("renders the drafts, noindex and never cached", async () => {
    const o = await opts({ mode: "preview", viewer: "user-1" });
    const store = o.store as Awaited<ReturnType<typeof seededStore>>;
    const home = (await store.listPages("landing"))[0]!;
    const draft = (await store.getPageDraft(home.id))!;
    const hero = draft.doc.content[0]!;
    await store.savePageDraft(home.id, draft.rev, { ...draft.doc, content: [{ ...hero, props: { ...hero.props, heading: "A draft headline" } }, ...draft.doc.content.slice(1)] });
    const res = (await handleSiteRequest(get("/"), o))!;
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("vercel-cache-tag")).toBeNull();
    const html = await res.text();
    expect(html).toContain("A draft headline");
    expect(html).toContain('content="noindex, nofollow"');
    // The live site still serves the release.
    expect(await (await handleSiteRequest(get("/"), { ...o, mode: "live" }))!.text()).not.toContain("A draft headline");
    expect(await (await handleSiteRequest(get("/robots.txt"), o))!.text()).toContain("Disallow: /");
  });

  it("is null for an anonymous viewer, before reading any draft", async () => {
    const o = await opts({ mode: "preview" });
    const store = o.store as Awaited<ReturnType<typeof seededStore>>;
    const getDraft = vi.spyOn(store, "getDraft");
    const listPages = vi.spyOn(store, "listPages");
    for (const path of ["/", "/robots.txt", "/sitemap.xml", "/nope"]) {
      expect(await handleSiteRequest(get(path), o)).toBeNull();
      expect(await handleSiteRequest(get(path), { ...o, viewer: null, unknownPath: "not-found" })).toBeNull();
    }
    expect(getDraft).not.toHaveBeenCalled();
    expect(listPages).not.toHaveBeenCalled();
    // The live site doesn't need a viewer.
    expect((await handleSiteRequest(get("/"), { ...o, mode: "live" }))!.status).toBe(200);
  });
});

describe("the cache after publish and rollback", () => {
  it("purges the site's tag after each, and the next request serves the new release", async () => {
    const base = await seededStore();
    const invalidate = vi.fn();
    const store = withCacheInvalidation(base, invalidate);
    const o = await opts({ store });
    const home = (await store.listPages("landing"))[0]!;
    const draft = (await store.getPageDraft(home.id))!;
    const hero = draft.doc.content[0]!;
    await store.savePageDraft(home.id, draft.rev, { ...draft.doc, content: [{ ...hero, props: { ...hero.props, heading: "Release two" } }, ...draft.doc.content.slice(1)] });
    const r2 = await store.publish("landing", { brand });
    expect(invalidate).toHaveBeenLastCalledWith(["site:landing"], { siteId: "landing", action: "publish" });
    const tags = vi.fn();
    const res = (await handleSiteRequest(get("/"), { ...o, onPublishedTags: tags }))!;
    expect(res.headers.get("x-genesis-release")).toBe(String(r2.number));
    expect(await res.text()).toContain("Release two");
    expect(tags).toHaveBeenCalledWith(["site:landing", "form:free-class"], expect.objectContaining({ releaseId: r2.id, status: 200 }));

    const r1 = (await store.listReleases("landing")).find((r) => r.number === 1)!;
    await store.rollback("landing", r1.id);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenLastCalledWith(["site:landing"], { siteId: "landing", action: "rollback" });
    const back = (await handleSiteRequest(get("/"), o))!;
    expect(back.headers.get("x-genesis-release")).toBe("1");
    expect(await back.text()).not.toContain("Release two");
  });

  it("rethrows a failed purge, loudly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = withCacheInvalidation(await seededStore(), () => Promise.reject(new Error("CDN down")));
    await expect(store.publish("landing", { brand })).rejects.toThrow("CDN down");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("the memory store", () => {
  it("compares and swaps revisions", async () => {
    const store = await seededStore();
    const page = (await store.listPages("landing"))[0]!;
    const d = (await store.getPageDraft(page.id))!;
    expect(await store.savePageDraft(page.id, d.rev, d.doc)).toEqual({ rev: d.rev + 1 });
    const stale = await store.savePageDraft(page.id, d.rev, d.doc);
    expect(isConflict(stale) && stale.rev).toBe(d.rev + 1);
  });

  it("refuses a publish the checks block, listing why", async () => {
    const store = createMemorySiteStore();
    const t = landingPage({ brand, message: { headline: "Soon" } });
    await store.createSite({ id: "x", site: t.site, pages: t.pages });
    const err = await store.publish("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishBlockedError);
    expect((err as PublishBlockedError).issues.some((i) => i.code === "placeholder")).toBe(true);
    expect(await store.getLive("x")).toBeNull();
  });

  it("refuses a publish without the brand, whose colours it must check", async () => {
    const store = await seededStore();
    const err = await store.publish("landing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishBlockedError);
    expect((err as PublishBlockedError).issues.map((i) => i.code)).toContain("brand-missing");
  });

  it("refuses reserved and duplicate paths, and keeps the home page", async () => {
    const store = await seededStore();
    const doc = { schemaVersion: 1 as const, root: { props: { title: "X" } }, content: [] };
    await expect(store.createPage("starter", { path: "/api/x", doc })).rejects.toThrow(/reserved/);
    await expect(store.createPage("starter", { path: "/about", doc })).rejects.toThrow(/already/);
    const home = (await store.listPages("starter")).find((p) => p.path === "/")!;
    await expect(store.deletePage(home.id)).rejects.toThrow(/home page/);
    await expect(store.movePage(home.id, "/home")).rejects.toThrow(/home page/);
  });

  it("keeps releases immutable to callers", async () => {
    const store = await seededStore();
    const live = (await store.getLive("landing"))!;
    live.snapshot.site.name = "Changed";
    expect((await store.getLive("landing"))!.snapshot.site.name).toBe("Riverside Works");
  });

  it("records uploads under sites/<siteId>/", async () => {
    const store = await seededStore();
    const asset = await store.putAsset!("landing", new Blob(["x"], { type: "image/png" }), { name: "Hero Photo.PNG", alt: "The studio" });
    expect(asset.path).toMatch(/^sites\/landing\/asset_[0-9a-z]+-hero-photo\.png$/);
  });
});

describe("review hardening", () => {
  it("keeps the query string on a moved page's redirect, and falls back to the default theme for a bad brand", async () => {
    const o = await opts({ siteId: "starter" });
    const store = o.store as Awaited<ReturnType<typeof seededStore>>;
    const about = (await store.listPages("starter")).find((p) => p.path === "/about")!;
    await store.movePage(about.id, "/our-story");
    await store.publish("starter", { brand: exampleBrands.hilltop });
    const res = (await handleSiteRequest(get("/about?utm_source=flyer"), o))!;
    expect(res.headers.get("location")).toBe("/our-story?utm_source=flyer");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bad = (await handleSiteRequest(get("/"), { ...o, brand: { getBrand: () => ({ name: "Hilltop", colors: { primary: "orange" } }) } }))!;
    expect(bad.status).toBe(200);
    expect(error.mock.calls.some((c) => String(c[0]).includes("can't make a theme"))).toBe(true);
    error.mockRestore();
  });

  it("leaves a hidden section out of the release, so it is never public", async () => {
    const store = await seededStore();
    const home = (await store.listPages("landing"))[0]!;
    const d = (await store.getPageDraft(home.id))!;
    await store.savePageDraft(home.id, d.rev, { ...d.doc, content: [...d.doc.content, { id: "secret", type: "rich-text", v: 1, hidden: true, props: { body: { type: "doc", content: [] }, heading: "Hidden plans" } }] });
    const release = await store.publish("landing", { brand });
    expect(JSON.stringify(release.snapshot)).not.toContain("Hidden plans");
    expect((await store.getPageDraft(home.id))!.doc.content.some((n) => n.id === "secret")).toBe(true);
  });

  it("serves the pages that parse when one stored page doesn't", async () => {
    const store = await seededStore();
    const live = (await store.getLive("starter"))!;
    const broken = { ...live, snapshot: { ...live.snapshot, pages: live.snapshot.pages.map((p) => (p.path === "/about" ? { ...p, doc: { ...p.doc, root: { props: { title: "" } } } } : p)) } };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const o = await opts({ siteId: "starter", store: { getLive: async () => broken as typeof live } });
    expect((await handleSiteRequest(get("/"), o))!.status).toBe(200);
    expect(await handleSiteRequest(get("/about"), o)).toBeNull();
    expect(error.mock.calls.some((c) => String(c[0]).includes('"/about"'))).toBe(true);
    error.mockRestore();
  });

  it("percent-encodes a redirect to a path a header can't carry", async () => {
    const store = await seededStore();
    const draft = (await store.getDraft("starter"))!;
    await store.saveSiteDraft("starter", draft.rev, { ...draft.site, redirects: [{ from: "/old", to: "/caf\u00e9-\u65e5\u672c", status: 301 }] });
    await store.publish("starter", { brand: exampleBrands.hilltop });
    const res = (await handleSiteRequest(get("/old"), await opts({ siteId: "starter", store })))!;
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/caf%C3%A9-%E6%97%A5%E6%9C%AC");
  });

  it("gives the home page under a base path one address, ending in a slash like its canonical URL", async () => {
    const o = await opts({ siteId: "starter", basePath: "/demo" });
    const bare = (await handleSiteRequest(get("/demo?x=1"), o))!;
    expect(bare.status).toBe(308);
    expect(bare.headers.get("location")).toBe("/demo/?x=1");
    const home = (await handleSiteRequest(get("/demo/"), o))!;
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('<link rel="canonical" href="https://riverside.example/demo/"/>');
    expect(html).toContain('href="/demo/"');
  });

  it("leaves out a section placed where it doesn't belong, and resolves only well-formed form slugs", async () => {
    const store = await seededStore();
    const draft = (await store.getDraft("landing"))!;
    const formInFooter = { id: "ff", type: "form-embed", v: 1, variant: "card", props: { heading: "Footer form", form: "free-class" } };
    await store.saveSiteDraft("landing", draft.rev, { ...draft.site, footer: [...draft.site.footer, formInFooter] });
    // The publish check refuses it, so put it in the release the way a direct database write could.
    const live = (await store.getLive("landing"))!;
    const tampered = { ...live, snapshot: { ...live.snapshot, site: { ...live.snapshot.site, footer: [...live.snapshot.site.footer, formInFooter] } } };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resolver = vi.fn(formsResolver);
    const html = await (await handleSiteRequest(get("/"), await opts({ store: { getLive: async () => tampered as typeof live }, forms: resolver })))!.text();
    expect(html).not.toContain("Footer form");
    expect(error.mock.calls.some((c) => String(c[0]).includes("belongs in the body"))).toBe(true);
    error.mockRestore();
    const bad = { ...tampered, snapshot: { ...tampered.snapshot, pages: tampered.snapshot.pages.map((p) => ({ ...p, doc: { ...p.doc, content: p.doc.content.map((n) => (n.type === "form-embed" ? { ...n, props: { ...n.props, form: "../../admin" } } : n)) } })) } };
    resolver.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await (await handleSiteRequest(get("/"), await opts({ store: { getLive: async () => bad as typeof live }, forms: resolver })))!.text();
    expect(resolver).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("refuses a form endpoint that isn't https or a site path", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const forms = () => ({ kind: "definition" as const, definition: contactForm.definition, submitUrl: "http://forms.example/submit" });
    const html = await (await handleSiteRequest(get("/"), await opts({ forms })))!.text();
    expect(html).not.toContain("http://forms.example");
    expect(html).not.toContain('data-gs-island="light-form"');
    error.mockRestore();
  });

  it("caches a page briefly, and warns, when the brand changed since the release was checked", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = (await handleSiteRequest(get("/"), await opts({ brand: { getBrand: () => ({ ...brand, colors: { primary: "#1d4ed8" } }) } })))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    const same = (await handleSiteRequest(get("/"), await opts()))!;
    expect(same.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400");
  });
});
