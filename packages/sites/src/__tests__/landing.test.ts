/**
 * @feat:sites-editor
 * Landing pages: the site's landing directory (`landing.directory`, `/go`
 * by default), its path rules, and making, moving, re-homing, deleting and
 * publishing landing pages through the editor's actions on the memory store.
 */
import { describe, expect, it, vi } from "vitest";
import "../sections/index";
import {
  DEFAULT_LANDING_DIRECTORY,
  SiteDoc,
  createMemorySiteStore,
  landingDirectory,
  landingDirectoryProblems,
  landingMoves,
  landingPages,
  landingPath,
  landingSlugOf,
  landingSlugProblems,
  type PageDoc,
  type PageMeta,
} from "../index";
import { checkSite, createLandingPage, moveLandingPage, movePageInList, setLandingDirectory, type EditorSiteStore } from "../editor/site-actions";
import { brand } from "./fixtures";

const page = (title: string): PageDoc => ({ schemaVersion: 1, root: { props: { title } }, content: [] });

async function site(extra: Partial<SiteDoc> = {}) {
  const store = createMemorySiteStore();
  const { siteId, pageIds } = await store.createSite({
    site: { schemaVersion: 1, name: "Example Works", nav: [{ label: "About", href: "/about" }], ...extra },
    pages: [
      { path: "/", doc: page("Home") },
      { path: "/about", doc: page("About") },
    ],
  });
  return { store, siteId, home: pageIds[0]!, about: pageIds[1]! };
}

describe("the landing directory setting", () => {
  it("is optional on the site document and defaults to /go", () => {
    const doc = SiteDoc.parse({ schemaVersion: 1, name: "Example" });
    expect(doc.landing).toBeUndefined();
    expect(landingDirectory(doc)).toBe("/go");
    expect(DEFAULT_LANDING_DIRECTORY).toBe("/go");
    expect(landingDirectory(SiteDoc.parse({ schemaVersion: 1, name: "Example", landing: { directory: "/offers" } }))).toBe("/offers");
  });

  it("is a page path", () => {
    for (const bad of ["go", "/Go", "/go/", "/go//x", "/go_x", "https://example.com/go"]) {
      expect(SiteDoc.safeParse({ schemaVersion: 1, name: "Example", landing: { directory: bad } }).success, bad).toBe(false);
    }
    expect(SiteDoc.safeParse({ schemaVersion: 1, name: "Example", landing: { directory: "/campaigns/spring" } }).success).toBe(true);
  });

  it("refuses the app's reserved paths, as page paths do", () => {
    expect(landingDirectoryProblems("/api")[0]).toMatch(/reserved/);
    expect(landingDirectoryProblems("/auth/go")[0]).toMatch(/reserved/);
    expect(landingDirectoryProblems("/promo", ["/promo"])[0]).toMatch(/reserved/);
    expect(landingDirectoryProblems("/Go")[0]).toMatch(/^A landing page directory/);
    expect(landingDirectoryProblems("/go")).toEqual([]);
  });

  it("joins and splits a slug", () => {
    expect(landingPath("/go", "spring-offer")).toBe("/go/spring-offer");
    expect(landingPath("/", "spring-offer")).toBe("/spring-offer");
    expect(landingSlugOf("/go", "/go/spring-offer")).toBe("spring-offer");
    expect(landingSlugOf("/go", "/go")).toBeNull();
    expect(landingSlugOf("/go", "/gone/x")).toBeNull();
    expect(landingSlugOf("/", "/spring")).toBe("spring");
  });

  it("checks a slug is one segment and makes a usable path", () => {
    expect(landingSlugProblems("/go", "spring-offer")).toEqual([]);
    for (const bad of ["", "Spring", "spring/offer", "-spring", "spring--offer", "spring_offer"]) expect(landingSlugProblems("/go", bad).length, bad).toBeGreaterThan(0);
    expect(landingSlugProblems("/", "api")[0]).toMatch(/reserved/);
  });

  it("plans moves for the landing pages under the old directory only", () => {
    const pages: Pick<PageMeta, "id" | "kind" | "path">[] = [
      { id: "a", kind: "landing", path: "/go/spring" },
      { id: "b", kind: "landing", path: "/elsewhere" },
      { id: "c", kind: "page", path: "/go/about" },
    ];
    expect(landingPages(pages).map((p) => p.id)).toEqual(["a", "b"]);
    expect(landingMoves(pages, "/go", "/offers").map((m) => [m.page.id, m.path])).toEqual([["a", "/offers/spring"]]);
    expect(landingMoves(pages, "/go", "/go")).toEqual([]);
  });
});

describe("landing pages on the memory store", () => {
  it("makes a landing page from the brand under the directory, out of the menu", async () => {
    const { store, siteId } = await site();
    const meta = await createLandingPage(store, siteId, { title: "Spring offer", slug: "spring-offer", brand });
    expect(meta).toMatchObject({ path: "/go/spring-offer", kind: "landing", title: "Spring offer" });
    const draft = (await store.getPageDraft(meta.id))!;
    expect(draft.doc.content.map((n) => n.type)).toContain("hero");
    expect((await store.getDraft(siteId))!.site.nav).toEqual([{ label: "About", href: "/about" }]);
  });

  it("uses the site's own directory", async () => {
    const { store, siteId } = await site({ landing: { directory: "/offers" } });
    expect((await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand })).path).toBe("/offers/spring");
  });

  it("refuses a bad slug, a reserved path and a taken address before asking the store", async () => {
    const { store, siteId } = await site({ landing: { directory: "/" } });
    const create = vi.spyOn(store, "createPage");
    await expect(createLandingPage(store, siteId, { title: "X", slug: "Bad Slug", brand })).rejects.toThrow(/lowercase/);
    await expect(createLandingPage(store, siteId, { title: "X", slug: "api", brand })).rejects.toThrow(/reserved/);
    await expect(createLandingPage(store, siteId, { title: "X", slug: "about", brand })).rejects.toThrow(/already/);
    await expect(createLandingPage(store, siteId, { title: "  ", slug: "ok", brand })).rejects.toThrow(/title/);
    expect(create).not.toHaveBeenCalled();
  });

  it("moves a landing page within the directory and leaves a redirect", async () => {
    const { store, siteId } = await site();
    const meta = await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand });
    const moved = await moveLandingPage(store, meta.id, "spring-2027");
    expect(moved.path).toBe("/go/spring-2027");
    expect((await store.getDraft(siteId))!.site.redirects).toEqual([{ from: "/go/spring", to: "/go/spring-2027", status: 301 }]);
    await expect(moveLandingPage(store, meta.id, "a/b")).rejects.toThrow(/lowercase/);
  });

  it("deletes a landing page the way it deletes any page", async () => {
    const { store, siteId } = await site();
    const meta = await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand });
    await store.deletePage(meta.id);
    expect(landingPages(await store.listPages(siteId))).toEqual([]);
    expect(await store.getPageDraft(meta.id)).toBeNull();
  });

  it("publishes landing pages in the same release, through the same checks", async () => {
    const { store, siteId } = await site();
    const meta = await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand });
    // The template's sample copy is placeholder: the same check that blocks any page blocks this one.
    const check = await checkSite(store, siteId, { brand });
    expect(check.issues.some((i) => i.code === "placeholder")).toBe(true);
    const draft = (await store.getPageDraft(meta.id))!;
    await store.savePageDraft(meta.id, draft.rev, { ...draft.doc, content: draft.doc.content.filter((n) => !n.placeholder) });
    const release = await store.publish(siteId, { brand });
    expect(release.snapshot.pages.find((p) => p.id === meta.id)).toMatchObject({ path: "/go/spring", kind: "landing" });
  });

  it("changes the directory for new pages only, unless asked to move them", async () => {
    const { store, siteId } = await site();
    const spring = await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand });
    const kept = await setLandingDirectory(store, siteId, "/offers");
    expect(kept.moved).toEqual([]);
    expect((await store.getPageDraft(spring.id))!.path).toBe("/go/spring");
    expect(landingDirectory((await store.getDraft(siteId))!.site)).toBe("/offers");
    expect((await createLandingPage(store, siteId, { title: "Summer", slug: "summer", brand })).path).toBe("/offers/summer");
  });

  it("moves the landing pages under the old directory, with redirects", async () => {
    const { store, siteId } = await site();
    const spring = await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand });
    const outside = await store.createPage(siteId, { path: "/promo", kind: "landing", doc: page("Promo") });
    const result = await setLandingDirectory(store, siteId, "/offers", { movePages: true });
    expect(result.moved.map((m) => m.path)).toEqual(["/offers/spring"]);
    expect((await store.getPageDraft(outside.id))!.path).toBe("/promo");
    const doc = (await store.getDraft(siteId))!.site;
    expect(doc.landing).toEqual({ directory: "/offers" });
    expect(doc.redirects).toEqual([{ from: "/go/spring", to: "/offers/spring", status: 301 }]);
    expect((await store.getPageDraft(spring.id))!.path).toBe("/offers/spring");
  });

  it("moves nothing when one new address is taken or the directory is bad", async () => {
    const { store, siteId } = await site();
    await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand });
    await store.createPage(siteId, { path: "/offers/spring", doc: page("Taken") });
    const move = vi.spyOn(store, "movePage");
    await expect(setLandingDirectory(store, siteId, "/offers", { movePages: true })).rejects.toThrow(/already/);
    await expect(setLandingDirectory(store, siteId, "/api", { movePages: true })).rejects.toThrow(/reserved/);
    expect(move).not.toHaveBeenCalled();
    expect(landingDirectory((await store.getDraft(siteId))!.site)).toBe("/go");
  });

  it("moves into a directory under the old one without colliding", async () => {
    const { store, siteId } = await site();
    const a = await createLandingPage(store, siteId, { title: "A", slug: "a", brand });
    const nested = await store.createPage(siteId, { path: "/go/sub/a", kind: "landing", doc: page("Nested") });
    await setLandingDirectory(store, siteId, "/go/sub", { movePages: true });
    expect((await store.getPageDraft(a.id))!.path).toBe("/go/sub/a");
    expect((await store.getPageDraft(nested.id))!.path).toBe("/go/sub/sub/a");
  });

  it("reorders ordinary pages past the landing pages between them", async () => {
    const { store, siteId, home, about } = await site();
    const landing = await createLandingPage(store, siteId, { title: "Spring", slug: "spring", brand });
    const contact = await store.createPage(siteId, { path: "/contact", doc: page("Contact") });
    const order: string[][] = [];
    const editor: EditorSiteStore = {
      ...store,
      async reorderPages(_siteId, ids) {
        order.push(ids);
      },
    };
    await movePageInList(editor, siteId, contact.id, -1, { within: (p) => p.kind !== "landing" });
    expect(order[0]).toEqual([home, contact.id, landing.id, about]);
  });
});
