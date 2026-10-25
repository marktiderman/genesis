/**
 * @feat:sites-editor
 * The editor: the Puck config generated from the registry, documents to
 * Puck data and back, autosave with compare-and-swap conflicts, publish
 * blocked by the checks, and page moves writing redirects.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import "../sections/index";
import { BUILT_IN_SECTION_TYPES, createMemorySiteStore, defineSection, getSection, landingPage, listSections, registerSection, sectionJsonSchema, toCanonicalBrand, unregisterSection, type PageDoc, type SaveResult, type SiteDoc } from "../index";
import { createEditorConfig, type CanvasMetadata } from "../editor/config";
import { countTypes, fromEditorData, h1SectionId, placeholderSnapshot, pruneEmpty, toEditorData } from "../editor/data";
import { sectionFields } from "../editor/fields";
import { Autosaver, AutosaveBlockedError } from "../editor/autosave";
import { checkSite, pageTemplates, pathProblems, publishSite, renamePage, slugify } from "../editor/site-actions";
import { brand, sectionProps } from "./fixtures";

// ── Puck stays in the editor ────────────────────────────────────────────────

describe("the entry points without the editor", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..");
  /** Every source file an entry reaches through relative imports, and every package it names. */
  const graph = (entry: string) => {
    const seen = new Set<string>();
    const bare = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
        const spec = (m[1] ?? m[2] ?? m[3])!;
        if (!spec.startsWith(".")) {
          bare.add(spec);
          continue;
        }
        const base = resolve(dirname(file), spec);
        const target = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((p) => existsSync(p) && !p.endsWith("/"))!;
        if (target && /\.tsx?$/.test(target)) visit(target);
      }
    };
    visit(join(src, entry));
    return { seen, bare };
  };

  // Puck is an optional peer: an app that only serves sites never installs it, so only /editor may import it.
  it.each([
    [".", "index.ts"],
    ["/web", "web/index.ts"],
    ["/sections", "sections/index.ts"],
    ["/supabase", "supabase/index.ts"],
    ["/blocks", "blocks.ts"],
  ])("%s never reaches Puck or the editor through its imports", (_name, entry) => {
    const { seen, bare } = graph(entry);
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].filter((f) => f.includes(`${join(src, "editor")}`))).toEqual([]);
    expect([...bare].filter((s) => s.startsWith("@puckeditor") || s.startsWith("@measured"))).toEqual([]);
  });

  it("follows the imports far enough to mean something", () => {
    expect(graph("web/index.ts").seen.size).toBeGreaterThan(10);
    expect(graph("index.ts").seen.size).toBeGreaterThan(10);
    // The check itself finds Puck where it is.
    expect([...graph("editor/index.ts").bare].some((s) => s.startsWith("@puckeditor"))).toBe(true);
  });

  it("lists Puck as an optional peer, never a dependency", () => {
    const pkg = JSON.parse(readFileSync(join(src, "..", "package.json"), "utf8")) as Record<string, Record<string, unknown> | undefined>;
    expect(pkg.dependencies?.["@puckeditor/core"]).toBeUndefined();
    expect(pkg.peerDependencies?.["@puckeditor/core"]).toBeDefined();
    expect(pkg.peerDependenciesMeta?.["@puckeditor/core"]).toEqual({ optional: true });
    expect(pkg.devDependencies?.["@puckeditor/core"]).toBeDefined();
  });
});

// ── Config from the registry ────────────────────────────────────────────────

describe("createEditorConfig", () => {
  const { config, components } = createEditorConfig();

  it("gives every built-in section a component with a field for every prop", () => {
    for (const type of BUILT_IN_SECTION_TYPES) {
      const component = config.components[type];
      expect(component, type).toBeDefined();
      const props = Object.keys((sectionJsonSchema(type).properties ?? {}) as Record<string, unknown>);
      expect(props.length, type).toBeGreaterThan(0);
      for (const prop of props) expect(component!.fields?.[prop], `${type}.${prop}`).toBeDefined();
      // No built-in prop falls back to "can't be edited here".
      expect(sectionFields(getSection(type)!).unsupported, type).toEqual([]);
    }
  });

  it("offers each preset in the Add picker, grouped by category", () => {
    for (const def of listSections()) {
      def.presets.forEach((preset, i) => {
        const name = i === 0 ? def.type : `${def.type}@${i}`;
        expect(config.components[name]?.defaultProps).toMatchObject({ ...(preset.props as Record<string, unknown>), _variant: preset.variant, _v: def.version });
        expect(components.get(name)).toMatchObject({ type: def.type, label: preset.name, category: def.category });
        expect((config.categories as Record<string, { components: string[] }>)[def.category]?.components).toContain(name);
      });
    }
  });

  it("maps schema shapes to the right field types", () => {
    const hero = config.components.hero!.fields as Record<string, { type: string; options?: { value: unknown }[]; objectFields?: Record<string, { type: string }> }>;
    expect(hero._variant).toMatchObject({ type: "select", label: "Layout" });
    expect(hero._variant!.options!.map((o) => o.value)).toEqual(["centered", "split", "image-bg"]);
    expect(hero.heading!.type).toBe("text");
    expect(hero.body!.type).toBe("textarea");
    expect(hero.image!.type).toBe("custom");
    expect(hero.primaryCta).toMatchObject({ type: "object", label: "Primary CTA" });
    expect(hero.primaryCta!.objectFields!.newTab!.type).toBe("radio");
    const features = config.components.features!.fields as Record<string, { type: string; options?: { value: unknown }[]; arrayFields?: Record<string, { type: string }>; max?: number; min?: number }>;
    expect(features.items).toMatchObject({ type: "array", min: 1, max: 12 });
    expect(features.items!.arrayFields!.icon!.type).toBe("select");
    expect(features.columns!.options!.map((o) => o.value)).toEqual(["", 2, 3, 4]);
    expect(features.surface!.type).toBe("select");
    const rich = config.components["rich-text"]!.fields as Record<string, { type: string }>;
    expect(rich.body!.type).toBe("custom");
    const pricing = config.components.pricing!.fields as Record<string, { arrayFields: Record<string, { type: string }> }>;
    expect(pricing.tiers!.arrayFields.features!.type).toBe("custom"); // one per line
    const gallery = config.components.gallery!.fields as Record<string, { arrayFields: Record<string, { type: string }> }>;
    expect(Object.keys(gallery.images!.arrayFields)).toEqual(["src", "alt", "decorative", "caption"]);
  });

  it("puts header and footer sections in the root's slots only", () => {
    const root = config.root!.fields as Record<string, { type: string; allow?: string[] }>;
    expect(root.header).toMatchObject({ type: "slot" });
    expect(root.header!.allow).toEqual(expect.arrayContaining(["nav"]));
    expect(root.header!.allow).not.toContain("hero");
    expect(root.footer!.allow).toEqual(expect.arrayContaining(["footer"]));
  });

  it("turns insert off for a section at its limit", () => {
    let counts = new Map<string, number>();
    const limited = createEditorConfig({ counts: () => counts });
    expect(limited.config.components.hero!.permissions?.insert).toBe(true);
    counts = new Map([["hero", 1]]);
    expect(limited.config.components.hero!.permissions?.insert).toBe(false);
    expect(limited.config.components["hero@1"]!.permissions?.insert).toBe(false);
    expect(limited.config.components.features!.permissions?.insert).toBe(true); // no limit
  });

  it("picks up a section registered later, with no editor change", () => {
    registerSection(
      defineSection({
        type: "team-test",
        version: 1,
        label: "Team",
        category: "content",
        schema: z.object({ heading: z.string().min(1).max(80), people: z.array(z.object({ name: z.string().min(1), bio: z.string().max(400).optional() })).max(8) }),
        variants: [{ id: "grid", label: "Grid" }],
        defaultVariant: "grid",
        presets: [{ name: "Team grid", variant: "grid", props: { heading: "Our coaches", people: [{ name: "Ada" }] } }],
        render: ({ props }) => <section>{props.heading}</section>,
      }),
    );
    try {
      const fresh = createEditorConfig();
      const fields = fresh.config.components["team-test"]!.fields as Record<string, { type: string; arrayFields?: Record<string, { type: string }> }>;
      expect(fields.heading!.type).toBe("text");
      expect(fields.people!.arrayFields!.bio!.type).toBe("textarea");
      expect(fields._variant).toBeUndefined(); // one variant: no layout picker
    } finally {
      unregisterSection("team-test");
    }
  });

  it("leaves sections out of page kinds they aren't enabled on", () => {
    registerSection(
      defineSection({
        type: "landing-only-test",
        version: 1,
        label: "Countdown",
        category: "conversion",
        enabledOn: ["landing"],
        schema: z.object({ heading: z.string().min(1) }),
        variants: [{ id: "a", label: "A" }],
        defaultVariant: "a",
        presets: [{ name: "Countdown", variant: "a", props: { heading: "Soon" } }],
        render: () => null,
      }),
    );
    try {
      expect(createEditorConfig({ kind: "page" }).config.components["landing-only-test"]).toBeUndefined();
      expect(createEditorConfig({ kind: "landing" }).config.components["landing-only-test"]).toBeDefined();
    } finally {
      unregisterSection("landing-only-test");
    }
  });

  it("draws a section on the canvas with its own renderer, h1 where the page puts it", () => {
    const meta: CanvasMetadata = { site: { name: "Riverside Gym", lang: "en", nav: [] }, pagePath: "/", forms: {}, h1Id: "h1", placeholders: {} };
    const render = config.components.hero!.render as (p: Record<string, unknown>) => React.ReactElement;
    const html = renderToStaticMarkup(render({ ...sectionProps.hero, id: "h1", _variant: "centered", _v: 1, puck: { metadata: meta, isEditing: true } }));
    expect(html).toContain("<h1");
    expect(html).toContain("Train with people who know your name");
    const second = renderToStaticMarkup(render({ ...sectionProps.hero, id: "other", _v: 1, puck: { metadata: meta, isEditing: true } }));
    expect(second).toContain("<h2");
  });

  it("shows what to fix instead of a section whose props don't parse", () => {
    const meta: CanvasMetadata = { site: { name: "x", lang: "en", nav: [] }, pagePath: "/", forms: {}, h1Id: null, placeholders: {} };
    const render = config.components.hero!.render as (p: Record<string, unknown>) => React.ReactElement;
    const html = renderToStaticMarkup(render({ id: "bad", heading: "", _v: 1, puck: { metadata: meta } }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Fix the Hero section");
  });

  it("never renders an unsafe link an editor typed", () => {
    const meta: CanvasMetadata = { site: { name: "x", lang: "en", nav: [] }, pagePath: "/", forms: {}, h1Id: null, placeholders: {} };
    const render = config.components.cta!.render as (p: Record<string, unknown>) => React.ReactElement;
    const html = renderToStaticMarkup(render({ id: "c", heading: "Go", primaryCta: { label: "Click", href: "javascript:alert(1)" }, _v: 1, puck: { metadata: meta } }));
    expect(html).not.toContain("javascript:");
  });
});

// ── Documents and Puck data ─────────────────────────────────────────────────

describe("toEditorData / fromEditorData", () => {
  const t = landingPage({ brand, message: { headline: "Train with people who know your name", subhead: "Small classes." } });
  const page = t.pages[0]!.doc;
  const site = { header: t.site.header ?? [], footer: t.site.footer ?? [] };

  it("round-trips a page and the site's header and footer", () => {
    const placeholders = placeholderSnapshot([...page.content, ...site.header, ...site.footer]);
    const back = fromEditorData(toEditorData(page, site) as never, { placeholders });
    expect(back.page.content).toEqual(page.content.map((n) => ({ ...n })));
    expect(back.page.root.props.title).toBe(page.root.props.title);
    expect(back.page.seo).toEqual(page.seo);
    expect(back.header).toEqual(site.header);
    expect(back.footer).toEqual(site.footer);
  });

  it("clears a template placeholder once its section is edited", () => {
    const placeholders = placeholderSnapshot(page.content);
    const data = toEditorData(page, site);
    const testimonials = data.content.find((i) => i.type === "testimonials")!;
    expect(fromEditorData(data as never, { placeholders }).page.content.find((n) => n.type === "testimonials")!.placeholder).toBe(true);
    testimonials.props.heading = "Members say";
    expect(fromEditorData(data as never, { placeholders }).page.content.find((n) => n.type === "testimonials")!.placeholder).toBeUndefined();
  });

  it("stores a preset's component as its section type, with node fields out of props", () => {
    const back = fromEditorData({
      root: { props: { title: "T", header: [], footer: [] } },
      content: [{ type: "hero@1", props: { id: "x1", heading: "Hi", _v: 1, _variant: "split", _hidden: true, _hideOn: "mobile", secondaryCta: { label: "", href: "" }, _arrayId: "z" } }],
    });
    expect(back.page.content[0]).toEqual({ id: "x1", type: "hero", v: 1, variant: "split", hidden: true, hideOn: ["mobile"], props: { heading: "Hi" } });
  });

  it("drops Puck's array bookkeeping and empty optional values", () => {
    expect(pruneEmpty({ a: "", b: { c: "" }, d: [{ e: "x", _arrayId: "1" }], f: ["", "y"] })).toEqual({ d: [{ e: "x", _arrayId: "1" }], f: ["", "y"] });
    const back = fromEditorData({ root: { props: { title: "T" } }, content: [{ type: "faq", props: { id: "f", _v: 1, heading: "Q", items: [{ question: "a", answer: "b", _arrayId: "q1", _originalIndex: 0 }] } }] });
    expect(back.page.content[0]!.props.items).toEqual([{ question: "a", answer: "b" }]);
  });

  it("finds the h1 section and counts sections in every zone", () => {
    const data = toEditorData(page, site);
    expect(h1SectionId(data.content)).toBe("hero");
    const counts = countTypes(data);
    expect(counts.get("nav")).toBe(1);
    expect(counts.get("hero")).toBe(1);
    expect(counts.get("footer")).toBe(1);
  });
});

// ── Autosave ────────────────────────────────────────────────────────────────

/** A store-like save with a revision, and a manual clock. */
function harness(startRev = 1) {
  let rev = startRev;
  let doc = { n: 0 };
  const saves: { rev: number; doc: { n: number } }[] = [];
  let fail: Error | null = null;
  let gate: Promise<void> | null = null;
  const save = vi.fn(async (r: number, d: { n: number }): Promise<SaveResult<{ n: number }>> => {
    if (gate) await gate;
    if (fail) throw fail;
    saves.push({ rev: r, doc: d });
    if (r !== rev) return { conflict: doc, rev };
    doc = d;
    rev += 1;
    return { rev };
  });
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let next = 0;
  const saver = new Autosaver<{ n: number }>(
    {
      rev: startRev,
      save,
      delay: 500,
      setTimer: (fn, ms) => {
        const id = ++next;
        timers.push({ fn, ms, id });
        return id;
      },
      clearTimer: (h) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    },
    { n: 0 },
  );
  const tick = async () => {
    const due = timers.splice(0);
    for (const t of due) t.fn();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  };
  return {
    saver,
    save,
    saves,
    tick,
    timers,
    someoneElseSaves(n: number) {
      doc = { n };
      rev += 1;
    },
    fail(err: Error | null) {
      fail = err;
    },
    hold() {
      let release!: () => void;
      gate = new Promise((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    get rev() {
      return rev;
    },
  };
}

describe("Autosaver", () => {
  it("saves once after the last of several quick changes", async () => {
    const h = harness();
    h.saver.update({ n: 1 });
    h.saver.update({ n: 2 });
    h.saver.update({ n: 3 });
    expect(h.saver.current.status).toBe("pending");
    expect(h.timers).toHaveLength(1);
    await h.tick();
    expect(h.saves).toEqual([{ rev: 1, doc: { n: 3 } }]);
    expect(h.saver.current).toMatchObject({ status: "saved", rev: 2 });
    expect(h.saver.dirty).toBe(false);
  });

  it("doesn't save a change back to what is saved", async () => {
    const h = harness();
    h.saver.update({ n: 0 });
    expect(h.timers).toHaveLength(0);
    expect(h.saver.current.status).toBe("saved");
  });

  it("saves a change made during a save right after it, on the new revision", async () => {
    const h = harness();
    h.saver.update({ n: 1 });
    const release = h.hold();
    const first = h.tick();
    h.saver.update({ n: 2 });
    release();
    await first;
    await h.tick();
    await h.tick();
    expect(h.saves).toEqual([
      { rev: 1, doc: { n: 1 } },
      { rev: 2, doc: { n: 2 } },
    ]);
    expect(h.saver.current).toMatchObject({ status: "saved", rev: 3 });
  });

  it("stops on a conflict, keeps every edit, and saves them all on overwrite", async () => {
    const h = harness();
    h.someoneElseSaves(99);
    h.saver.update({ n: 1 });
    await h.tick();
    expect(h.saver.current.status).toBe("conflict");
    expect(h.saver.current.conflict).toEqual({ doc: { n: 99 }, rev: 2 });
    // Editing during the conflict: kept, not saved.
    h.saver.update({ n: 2 });
    await h.tick();
    expect(h.saves).toHaveLength(1);
    expect(h.saver.latest).toEqual({ n: 2 });
    await expect(h.saver.flush()).rejects.toBeInstanceOf(AutosaveBlockedError);
    await h.saver.overwrite();
    expect(h.saves.at(-1)).toEqual({ rev: 2, doc: { n: 2 } });
    expect(h.saver.current).toMatchObject({ status: "saved", rev: 3, conflict: null });
  });

  it("loads the other version on reload and drops local edits", async () => {
    const h = harness();
    h.someoneElseSaves(42);
    h.saver.update({ n: 1 });
    await h.tick();
    expect(h.saver.reload()).toEqual({ n: 42 });
    expect(h.saver.current).toMatchObject({ status: "saved", rev: 2 });
    expect(h.saver.dirty).toBe(false);
    h.saver.update({ n: 43 });
    await h.tick();
    expect(h.saves.at(-1)).toEqual({ rev: 2, doc: { n: 43 } });
    expect(h.saver.current.status).toBe("saved");
  });

  it("keeps a change a failed save couldn't store, and retries it", async () => {
    const h = harness();
    h.fail(new Error("offline"));
    h.saver.update({ n: 5 });
    await h.tick();
    expect(h.saver.current.status).toBe("error");
    expect(h.saver.dirty).toBe(true);
    expect(h.timers).toHaveLength(1); // the retry
    h.fail(null);
    await h.tick();
    expect(h.saves).toEqual([{ rev: 1, doc: { n: 5 } }]);
    expect(h.saver.current.status).toBe("saved");
  });

  it("flush saves at once and resolves when the store has it", async () => {
    const h = harness();
    h.saver.update({ n: 7 });
    await h.saver.flush();
    expect(h.saves).toEqual([{ rev: 1, doc: { n: 7 } }]);
    expect(h.timers).toHaveLength(0);
  });

  it("works against the memory store's compare-and-swap", async () => {
    const store = createMemorySiteStore();
    const t = landingPage({ brand, message: { headline: "Hello there" } });
    const { siteId, pageIds } = await store.createSite({ site: t.site, pages: t.pages });
    const pageId = pageIds[0]!;
    const draft = (await store.getPageDraft(pageId))!;
    const mine = new Autosaver<PageDoc>({ rev: draft.rev, save: (r, d) => store.savePageDraft(pageId, r, d) }, draft.doc);
    // Another editor saves first.
    await store.savePageDraft(pageId, draft.rev, { ...draft.doc, root: { props: { title: "Theirs" } } });
    mine.update({ ...draft.doc, root: { props: { title: "Mine" } } });
    await mine.flush().catch(() => undefined);
    expect(mine.current.status).toBe("conflict");
    expect((mine.current.conflict?.doc as PageDoc).root.props.title).toBe("Theirs");
    await mine.overwrite();
    expect((await store.getPageDraft(pageId))!.doc.root.props.title).toBe("Mine");
    expect(siteId).toBeTruthy();
    mine.dispose();
  });
});

// ── Publishing and pages ────────────────────────────────────────────────────

async function landingStore() {
  const store = createMemorySiteStore();
  const t = landingPage({ brand, message: { headline: "Train with people who know your name", subhead: "Small classes." } });
  const { siteId, pageIds } = await store.createSite({ site: t.site, pages: [...t.pages, { path: "/about", doc: { schemaVersion: 1, root: { props: { title: "About" } }, content: [] } }] });
  return { store, siteId, home: pageIds[0]!, about: pageIds[1]! };
}

describe("publishing", () => {
  it("lists the checks' errors and refuses to publish while any remain", async () => {
    const { store, siteId } = await landingStore();
    const check = await checkSite(store, siteId, { brand });
    expect(check.publishable).toBe(false);
    expect(check.issues.filter((i) => i.severity === "error").map((i) => i.code)).toContain("placeholder");
    expect(check.issues[0]!.severity).toBe("error"); // errors first
    const publish = vi.spyOn(store, "publish");
    const result = await publishSite(store, siteId, { brand, note: "First" });
    expect("blocked" in result && result.blocked.some((i) => i.code === "placeholder")).toBe(true);
    expect(publish).not.toHaveBeenCalled();
    expect(await store.listReleases(siteId)).toEqual([]);
  });

  it("refuses an image with no alt text, and contrast the brand fails", async () => {
    const { store, siteId, home } = await landingStore();
    const draft = (await store.getPageDraft(home))!;
    const content = draft.doc.content.filter((n) => !n.placeholder).map((n) => (n.type === "hero" ? { ...n, props: { ...n.props, image: { src: "/a.jpg", alt: "" } } } : n));
    await store.savePageDraft(home, draft.rev, { ...draft.doc, content });
    const faint = { ...toCanonicalBrand(brand), text: { DEFAULT: "#bbbbbb", light: "#bbbbbb", dark: "#fafafa" } };
    const check = await checkSite(store, siteId, { brand: faint });
    const codes = check.issues.map((i) => i.code);
    expect(codes).toContain("image-alt");
    expect(codes).toContain("contrast");
  });

  it("publishes once the problems are fixed, with the note, and rolls back", async () => {
    const { store, siteId, home } = await landingStore();
    const draft = (await store.getPageDraft(home))!;
    await store.savePageDraft(home, draft.rev, { ...draft.doc, content: draft.doc.content.map((n) => (n.placeholder ? { ...n, hidden: true } : n)) });
    const site = (await store.getDraft(siteId))!;
    await store.saveSiteDraft(siteId, site.rev, { ...site.site, footer: site.site.footer.map((n) => ({ ...n, placeholder: false })) } as SiteDoc);
    const first = await publishSite(store, siteId, { brand, note: "  First  " });
    expect("release" in first && first.release.note).toBe("First");
    const second = await publishSite(store, siteId, { brand });
    expect("release" in second && second.release.number).toBe(2);
    const releases = await store.listReleases(siteId);
    await store.rollback(siteId, releases.at(-1)!.id);
    expect((await store.getLive(siteId))!.number).toBe(1);
  });
});

describe("pages", () => {
  it("moves a page and leaves a redirect from the old address", async () => {
    const { store, siteId, about } = await landingStore();
    const moved = await renamePage(store, about, "/our-story");
    expect(moved.path).toBe("/our-story");
    expect((await store.getDraft(siteId))!.site.redirects).toEqual([{ from: "/about", to: "/our-story", status: 301 }]);
    // Moving again rewrites the first redirect: no chains.
    await renamePage(store, about, "/story");
    expect((await store.getDraft(siteId))!.site.redirects).toEqual(
      expect.arrayContaining([
        { from: "/about", to: "/story", status: 301 },
        { from: "/our-story", to: "/story", status: 301 },
      ]),
    );
  });

  it("refuses reserved paths, taken paths, bad paths and the home page", async () => {
    const { store, home, about } = await landingStore();
    const move = vi.spyOn(store, "movePage");
    await expect(renamePage(store, about, "/api/things")).rejects.toThrow(/reserved/);
    await expect(renamePage(store, about, "/")).rejects.toThrow(/already/);
    await expect(renamePage(store, about, "/About Us")).rejects.toThrow(/lowercase/);
    await expect(renamePage(store, home, "/home")).rejects.toThrow(/home page/);
    expect(move).not.toHaveBeenCalled();
    expect(pathProblems("/auth", [], { reserved: ["/auth"] })[0]).toMatch(/reserved/);
  });

  it("makes addresses from titles", () => {
    expect(slugify("Our Classes & Prices")).toBe("/our-classes-prices");
    expect(slugify("Café crème")).toBe("/cafe-creme");
    expect(slugify("!!!")).toBe("/page");
  });

  it("offers blank, landing and starter pages that parse and use the title", async () => {
    const templates = pageTemplates();
    expect(templates.map((t) => t.id)).toEqual(expect.arrayContaining(["blank", "landing", "starter-about", "starter-contact"]));
    const store = createMemorySiteStore();
    const { siteId } = await store.createSite({ site: { schemaVersion: 1, name: "S" }, pages: [] });
    for (const t of templates) {
      const doc = t.doc({ title: "Spring offer", brand });
      expect(doc.root.props.title).toBe("Spring offer");
      await store.createPage(siteId, { path: slugify(`${t.id} page`), kind: t.kind, doc });
    }
    const landing = templates.find((t) => t.id === "landing")!.doc({ title: "Spring offer", brand });
    expect(landing.content.find((n) => n.type === "hero")!.props.heading).toBe("Spring offer");
  });
});
