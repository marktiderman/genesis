// @vitest-environment happy-dom
/**
 * @feat:sites-sections
 * Every built-in section renders every variant on the server, matches its
 * snapshot, and passes axe (WCAG 2.x A/AA rules that don't need layout).
 * Colour contrast needs layout, so it is checked on the theme instead
 * (a11y.test.ts); 24px targets are pinned by class here.
 */
import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { builtInSections } from "../sections/index";
import { BUILT_IN_SECTION_TYPES, getSection, sectionJsonSchema, type AnySectionDefinition } from "../core/registry";
import { checkHtmlOutline } from "../core/a11y";
import type { SectionNode } from "../core/schemas";
import { sectionProps, testCtx } from "./fixtures";

function render(def: AnySectionDefinition, variant: string, props = sectionProps[def.type]!, ctxOverrides = {}) {
  const parsed = def.schema.parse(props);
  const node: SectionNode = { id: def.type.replace(/[^a-z]/g, ""), type: def.type, v: def.version, variant, props: parsed as Record<string, unknown> };
  const level = def.providesH1 ? 1 : 2;
  return renderToStaticMarkup(<>{def.render({ props: parsed, variant, node, ctx: testCtx({ headingLevel: level, idPrefix: `gs-${node.id}`, ...ctxOverrides }) })}</>);
}

async function axeViolations(html: string, def: AnySectionDefinition) {
  // A page around the section: one h1 before it unless it is the h1, a main landmark.
  const before = def.providesH1 ? "" : '<h1 class="sr-only">Page</h1>';
  const placement = def.placement ?? "body";
  document.documentElement.lang = "en";
  document.title = "Test";
  document.body.innerHTML = placement === "body" ? `<main>${before}${html}</main>` : `${html}<main>${before}<p>Body</p></main>`;
  const results = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    rules: {
      // Needs layout and computed colours (happy-dom has neither); checked on the theme instead.
      "color-contrast": { enabled: false },
      // A section alone isn't a whole page.
      "page-has-heading-one": { enabled: false },
      region: { enabled: false },
    },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")})`);
}

describe("the axe harness", () => {
  it("catches what it should (a missing alt, an unnamed link), so a pass means something", async () => {
    const violations = await axeViolations('<img src="/x.png"><a href="/y"></a>', getSection("features")!);
    expect(violations.some((v) => v.startsWith("image-alt"))).toBe(true);
    expect(violations.some((v) => v.startsWith("link-name"))).toBe(true);
  });
});

describe("the built-in catalog", () => {
  it("registers all 13 sections, each with 2 to 4 variants and a preset", () => {
    expect(builtInSections.map((d) => d.type).sort()).toEqual([...BUILT_IN_SECTION_TYPES].sort());
    for (const def of builtInSections) {
      expect(getSection(def.type), def.type).toBe(def);
      expect(def.variants.length, def.type).toBeGreaterThanOrEqual(2);
      expect(def.variants.length, def.type).toBeLessThanOrEqual(4);
      expect(def.presets.length, def.type).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives each section a JSON Schema for the editor's fields", () => {
    for (const def of builtInSections) {
      const schema = sectionJsonSchema(def.type);
      expect(schema.type, def.type).toBe("object");
      expect(Object.keys(schema.properties as object).length, def.type).toBeGreaterThan(0);
    }
  });

  it("parses every preset and every fixture", () => {
    for (const def of builtInSections) {
      for (const preset of def.presets) expect(def.schema.safeParse(preset.props).success, `${def.type} ${preset.name}`).toBe(true);
      expect(def.schema.safeParse(sectionProps[def.type]).success, def.type).toBe(true);
    }
  });
});

describe.each(builtInSections.map((d) => [d.type, d] as const))("%s", (_type, def) => {
  it.each(def.variants.map((v) => [v.id]))("renders the %s variant: snapshot, outline and axe", async (variant) => {
    const html = render(def, variant);
    expect(html).toMatchSnapshot();
    expect(html).not.toMatch(/<script(?![^>]*type="application\/(?:ld\+)?json")/);
    if (def.providesH1) expect(checkHtmlOutline(html)).toEqual([]);
    expect(await axeViolations(html, def)).toEqual([]);
  });

  it("renders every preset", () => {
    for (const preset of def.presets) expect(() => render(def, preset.variant, preset.props as Record<string, unknown>)).not.toThrow();
  });
});

describe("section markup rules", () => {
  it("puts the h1 on the hero and h2s elsewhere", () => {
    expect(render(getSection("hero")!, "centered")).toMatch(/^<section[^>]*><div[^>]*><div[^>]*>.*<h1 /);
    expect(render(getSection("features")!, "grid")).toContain("<h2 ");
    expect(render(getSection("features")!, "grid")).toContain("<h3 ");
  });

  it("makes buttons and links at least 24px (most 44px) tall", () => {
    const html = render(getSection("hero")!, "centered");
    for (const m of html.matchAll(/<a [^>]*class="([^"]*)"/g)) expect(m[1]).toMatch(/min-h-(11|6)\b/);
    const nav = render(getSection("nav")!, "simple");
    for (const m of nav.matchAll(/<(?:a|summary) [^>]*class="([^"]*)"/g)) expect(m[1]).toMatch(/min-h-11\b/);
  });

  it("refuses unsafe links and images at render time, even past the schema", () => {
    const def = getSection("cta")!;
    const node: SectionNode = { id: "x", type: "cta", v: 1, variant: "banner", props: {} };
    const html = renderToStaticMarkup(
      <>{def.render({ props: { heading: "Hi", primaryCta: { label: "Go", href: "javascript:alert(1)" }, surface: "accent" }, variant: "banner", node, ctx: testCtx() })}</>,
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("sanitises rich text: no raw HTML, no script links", () => {
    const def = getSection("rich-text")!;
    const props = def.schema.parse({
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }, { type: "text", text: "bad", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        ],
      },
    });
    const node: SectionNode = { id: "r", type: "rich-text", v: 1, variant: "narrow", props: props as Record<string, unknown> };
    const html = renderToStaticMarkup(<>{def.render({ props, variant: "narrow", node, ctx: testCtx() })}</>);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("javascript:");
  });

  it("shows the phone menu as a disclosure that works without script", () => {
    const html = render(getSection("nav")!, "simple");
    expect(html).toContain('<details class="group md:hidden" data-gs-island="menu">');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("<summary");
  });

  it("renders a hosted form as a titled, sandboxed frame and an unknown form as nothing", () => {
    const def = getSection("form-embed")!;
    const hosted = render(def, "card", { ...sectionProps["form-embed"], form: "hosted" }, {
      forms: new Map([["hosted", { kind: "embed", url: "https://forms.example/riverside", title: "Riverside sign-up" }]]),
    });
    expect(hosted).toContain('<iframe src="https://forms.example/riverside" title="Riverside sign-up"');
    expect(hosted).toContain("sandbox=");
    const unknown = render(def, "card", { ...sectionProps["form-embed"], form: "nope" }, { forms: new Map([["nope", null]]) });
    expect(unknown).not.toContain("<form");
    const preview = render(def, "card", { ...sectionProps["form-embed"], form: "nope" }, { forms: new Map([["nope", null]]), mode: "preview" });
    expect(preview).toContain("isn&#x27;t available");
  });

  it("keeps the embedded form's title below the section heading", () => {
    const html = render(getSection("form-embed")!, "split");
    expect(html).not.toContain("<h1");
    expect(html).toContain('<h3 class="text-lg font-semibold">Free class</h3>');
    expect(html).toContain('<script type="application/json" data-gs-form-definition="">');
  });
});
