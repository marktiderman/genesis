/**
 * @feat:sites-sections
 * Template content is data on the neutral sections: every preset is on its
 * section's own shape (a variant it has, props its schema takes) and renders.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "../sections/index";
import { getSection, landingPage, type AnySectionDefinition, type SectionNode } from "../index";
import { testCtx } from "../__tests__/fixtures";
import { fitness, industryTemplates } from "./index";

describe.each(Object.values(industryTemplates))("the $id template", (template) => {
  const presets = Object.entries(template.presets).flatMap(([type, list]) => (list ?? []).map((preset) => ({ type, preset })));

  it("has presets", () => expect(presets.length).toBeGreaterThan(0));

  it.each(presets.map(({ type, preset }) => [`${type}: ${preset.name}`, type, preset] as const))("%s parses and renders", (_, type, preset) => {
    const def = getSection(type) as AnySectionDefinition;
    expect(def.variants.map((v) => v.id)).toContain(preset.variant);
    const parsed = def.schema.parse(preset.props);
    const node: SectionNode = { id: "t", type, v: def.version, variant: preset.variant, props: parsed as Record<string, unknown> };
    expect(renderToStaticMarkup(<>{def.render({ props: parsed, variant: preset.variant, node, ctx: testCtx({ idPrefix: "gs-t" }) })}</>)).toContain("<section");
  });

  it("seeds a landing page from its sample data", () => {
    const page = landingPage({ brand: template.brand, message: template.message });
    expect(page.site.name).toBe(template.brand.name);
  });
});

it("lists fitness under its id", () => expect(industryTemplates.fitness).toBe(fitness));

it("reads as classes on a fitness timetable", () => {
  const preset = fitness.presets.schedule![0]!;
  const def = getSection("schedule") as AnySectionDefinition;
  const parsed = def.schema.parse(preset.props);
  const node: SectionNode = { id: "s", type: "schedule", v: def.version, variant: "grid", props: parsed as Record<string, unknown> };
  const html = renderToStaticMarkup(<>{def.render({ props: parsed, variant: "grid", node, ctx: testCtx({ idPrefix: "gs-s" }) })}</>);
  expect(html).toContain("<caption class=\"sr-only\">Class times: classes by time and day</caption>");
  expect(html).toContain('aria-label="Class types"');
  expect(html).toContain("Show the classes on</legend>");
});
