/**
 * @feat:genesis-sites
 * Schemas, URL rules, the section registry and props migrations.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import "../sections/index";
import {
  BUILT_IN_SECTION_TYPES,
  Href,
  Image,
  PageDoc,
  SectionDefinitionError,
  SiteDoc,
  defineSection,
  getSection,
  isReservedPath,
  isSafeHref,
  isSafeImageSrc,
  listSections,
  migrateNode,
  migratePage,
  nodeFromPreset,
  normalizeRequestPath,
  pagePathProblems,
  registerSection,
  sectionJsonSchema,
  sectionManifests,
  unregisterSection,
  type SectionNode,
} from "../index";

describe("links and paths", () => {
  it.each([
    ["/about", true],
    ["#pricing", true],
    ["https://riverside.example/x?y=1", true],
    ["http://riverside.example", true],
    ["mailto:hello@riverside.example", true],
    ["tel:+15555550101", true],
    ["javascript:alert(1)", false],
    ["JaVaScRiPt:alert(1)", false],
    [" javascript:alert(1)", false],
    ["java\tscript:alert(1)", false],
    ["data:text/html,<script>alert(1)</script>", false],
    ["vbscript:msgbox(1)", false],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["https://user:pass@evil.example", false],
    ["", false],
    ["about", false],
  ])("isSafeHref(%j) is %s", (href, safe) => {
    expect(isSafeHref(href)).toBe(safe);
    expect(Href.safeParse(href).success).toBe(safe);
  });

  it("loads images only from site paths and https", () => {
    expect(isSafeImageSrc("/a.png")).toBe(true);
    expect(isSafeImageSrc("https://cdn.example/a.png")).toBe(true);
    expect(isSafeImageSrc("http://cdn.example/a.png")).toBe(false);
    expect(isSafeImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(Image.safeParse({ src: "javascript:alert(1)", alt: "x" }).success).toBe(false);
  });

  it("keeps page paths to lowercase segments and away from the app's reserved paths", () => {
    expect(pagePathProblems("/")).toEqual([]);
    expect(pagePathProblems("/classes/strength-101")).toEqual([]);
    expect(pagePathProblems("/About")).toHaveLength(1);
    expect(pagePathProblems("/about/")).toHaveLength(1);
    expect(pagePathProblems("/a..b")).toHaveLength(1);
    expect(pagePathProblems("/api")[0]).toContain("reserved");
    expect(pagePathProblems("/auth/callback")[0]).toContain("reserved");
    expect(pagePathProblems("/apiary")).toEqual([]);
    expect(pagePathProblems("/admin", ["/admin"])[0]).toContain("reserved");
    expect(isReservedPath("/x/y", (p) => p.startsWith("/x"))).toBe(true);
    expect(isReservedPath("/AUTH/callback")).toBe(true);
    expect(isReservedPath("/Api", ["/API/"])).toBe(true);
  });

  it("normalises a request path to the page path it asks for", () => {
    expect(normalizeRequestPath("/About/")).toBe("/about");
    expect(normalizeRequestPath("/")).toBe("/");
    expect(normalizeRequestPath("/%61bout")).toBe("/about");
    expect(normalizeRequestPath("/%E0%A4%A")).toBeNull();
    expect(normalizeRequestPath("//evil")).toBeNull();
    expect(normalizeRequestPath("/a%5Cb")).toBeNull();
  });
});

describe("documents", () => {
  const page = { schemaVersion: 1, root: { props: { title: "Home" } }, content: [{ id: "hero", type: "hero", v: 1, props: { heading: "Hi" } }] };

  it("parses a page in Puck's shape: root props and a content list of {type, props}", () => {
    const parsed = PageDoc.parse(page);
    expect(parsed.content[0]!.type).toBe("hero");
    expect(PageDoc.safeParse({ ...page, schemaVersion: 2 }).success).toBe(false);
    expect(PageDoc.safeParse({ ...page, content: [{ ...page.content[0], id: "bad id!" }] }).success).toBe(false);
  });

  it("fills a site's defaults", () => {
    const site = SiteDoc.parse({ schemaVersion: 1, name: "Riverside Gym" });
    expect(site).toMatchObject({ lang: "en", theme: { colorScheme: "light" }, header: [], nav: [], footer: [], redirects: [] });
  });

  it("refuses a redirect to an unsafe URL", () => {
    expect(SiteDoc.safeParse({ schemaVersion: 1, name: "x", redirects: [{ from: "/a", to: "javascript:alert(1)", status: 301 }] }).success).toBe(false);
  });
});

describe("the section registry", () => {
  afterEach(() => {
    for (const def of listSections()) if (!(BUILT_IN_SECTION_TYPES as readonly string[]).includes(def.type)) unregisterSection(def.type);
  });

  const quote = () =>
    defineSection({
      type: "quote",
      version: 1,
      label: "Quote",
      category: "content",
      schema: z.object({ text: z.string().min(1) }),
      variants: [{ id: "plain", label: "Plain" }],
      defaultVariant: "plain",
      presets: [{ name: "Quote", variant: "plain", props: { text: "Hello" } }],
      render: ({ props }) => props.text,
    });

  it("freezes a definition", () => {
    const def = quote();
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.variants)).toBe(true);
  });

  it("lists every problem in a bad definition, including a preset that doesn't match the schema", () => {
    const err = (() => {
      try {
        defineSection({
          type: "Bad Type",
          version: 2,
          label: "",
          category: "nope" as never,
          schema: z.object({ text: z.string() }),
          variants: [],
          defaultVariant: "x",
          presets: [{ name: "P", variant: "x", props: { text: 1 } as never }],
          render: () => null,
        });
      } catch (e) {
        return e as SectionDefinitionError;
      }
    })();
    expect(err).toBeInstanceOf(SectionDefinitionError);
    const text = err!.problems.join("\n");
    expect(text).toContain("`type`");
    expect(text).toContain("label");
    expect(text).toContain("category");
    expect(text).toContain("at least one variant");
    expect(text).toContain("needs a migration to 2");
  });

  it("lets a host add a section and re-register it (hot reload)", () => {
    registerSection(quote());
    expect(getSection("quote")!.label).toBe("Quote");
    registerSection({ ...quote(), label: "Pull quote" });
    expect(getSection("quote")!.label).toBe("Pull quote");
  });

  it("refuses to replace a built-in without { replace: true }", () => {
    const hero = getSection("hero")!;
    expect(() => registerSection({ ...hero, label: "My hero" })).toThrow(/built-in/);
    registerSection({ ...hero, label: "My hero" }, { replace: true });
    expect(getSection("hero")!.label).toBe("My hero");
    registerSection(hero, { replace: true });
    expect(() => unregisterSection("hero")).toThrow(/built in/);
  });

  it("keeps one registry per process, on a Symbol.for global", () => {
    const registry = (globalThis as Record<symbol, Map<string, unknown>>)[Symbol.for("@marktiderman/genesis-sites/sections@1")];
    expect(registry).toBeInstanceOf(Map);
    expect(registry!.get("hero")).toBe(getSection("hero"));
  });

  it("derives JSON Schema and the editor's manifest from the definition", () => {
    const schema = sectionJsonSchema("hero");
    expect(schema).toMatchObject({ type: "object", required: ["heading"] });
    expect((schema.properties as Record<string, { maxLength?: number }>).heading!.maxLength).toBe(90);
    const hero = sectionManifests().find((m) => m.type === "hero")!;
    expect(hero).toMatchObject({ label: "Hero", category: "intro", limit: 1, defaultVariant: "centered" });
    expect(hero.variants.map((v) => v.id)).toEqual(["centered", "split", "image-bg"]);
    expect(hero).not.toHaveProperty("render");
  });

  it("makes a node from a preset", () => {
    const node = nodeFromPreset("cta", "Banner");
    expect(node).toMatchObject({ type: "cta", v: 1, variant: "banner", props: { heading: "Ready to start?" } });
    expect(node.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});

describe("migrations", () => {
  afterEach(() => unregisterSection("banner-v3"));

  const banner = defineSection({
    type: "banner-v3",
    version: 3,
    label: "Banner",
    category: "content",
    schema: z.object({ heading: z.string(), tone: z.enum(["calm", "loud"]) }),
    variants: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    defaultVariant: "a",
    presets: [{ name: "Banner", variant: "a", props: { heading: "Hi", tone: "calm" } }],
    migrations: {
      // v1 → v2: `title` became `heading`.
      2: ({ title, ...rest }) => ({ ...rest, heading: title }),
      // v2 → v3: `loud: boolean` became `tone`.
      3: ({ loud, ...rest }) => ({ ...rest, tone: loud ? "loud" : "calm" }),
    },
    render: () => null,
  });

  it("runs every step from the node's version to the current one", () => {
    registerSection(banner);
    const node: SectionNode = { id: "b1", type: "banner-v3", v: 1, props: { title: "Old", loud: true } };
    const m = migrateNode(node);
    expect(m.issues).toEqual([]);
    expect(m.changed).toBe(true);
    expect(m.node).toMatchObject({ v: 3, variant: "a", props: { heading: "Old", tone: "loud" } });
    expect(node.props).toEqual({ title: "Old", loud: true });
  });

  it("reports an unknown section, a newer version, a failing step and invalid props, and never throws", () => {
    registerSection(banner);
    const spy = vi.fn();
    expect(migrateNode({ id: "x", type: "nope", v: 1, props: {} }).issues[0]!.code).toBe("unknown-section");
    expect(migrateNode({ id: "x", type: "banner-v3", v: 9, props: {} }).issues[0]!.code).toBe("newer-version");
    registerSection({ ...banner, migrations: { ...banner.migrations, 2: () => { spy(); throw new Error("boom"); } } });
    expect(migrateNode({ id: "x", type: "banner-v3", v: 1, props: {} }).issues[0]!.code).toBe("migration-failed");
    expect(spy).toHaveBeenCalled();
    registerSection(banner);
    expect(migrateNode({ id: "x", type: "banner-v3", v: 3, props: { heading: 1 } }).issues[0]!.code).toBe("invalid-props");
  });

  it("falls back to the default variant for an unknown one, with a warning", () => {
    registerSection(banner);
    const m = migrateNode({ id: "x", type: "banner-v3", v: 3, variant: "zz", props: { heading: "Hi", tone: "calm" } });
    expect(m.node!.variant).toBe("a");
    expect(m.issues[0]).toMatchObject({ severity: "warning", code: "unknown-variant" });
  });

  it("migrates a page and keeps nodes it can't show", () => {
    registerSection(banner);
    const doc = PageDoc.parse({
      schemaVersion: 1,
      root: { props: { title: "x" } },
      content: [
        { id: "a", type: "banner-v3", v: 2, props: { heading: "H", loud: false } },
        { id: "b", type: "unknown", v: 1, props: { keep: true } },
      ],
    });
    const m = migratePage(doc);
    expect(m.changed).toBe(true);
    expect(m.doc.content[0]).toMatchObject({ v: 3, props: { heading: "H", tone: "calm" } });
    expect(m.doc.content[1]).toEqual(doc.content[1]);
    expect(m.issues.map((i) => i.code)).toEqual(["unknown-section"]);
  });
});
