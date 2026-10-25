/**
 * Band, Display and BandLead: the marketing primitives genesis-sites builds
 * its sections from. Structure assertions, as in layout-primitives.test.tsx:
 * the element, the slot and the class string are the contract.
 */
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Band, BandLead, Display, bandVariants, displayVariants } from "../band";

const slot = (container: HTMLElement, name: string) => container.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;

describe("Band", () => {
  it("renders a full-width section with a gutter column inside", () => {
    const { container } = render(
      <Band aria-labelledby="t" testID="b">
        <h2 id="t">Title</h2>
      </Band>,
    );
    const band = slot(container, "band");
    expect(band.tagName).toBe("SECTION");
    expect(band.className).toContain("w-full");
    expect(band.getAttribute("aria-labelledby")).toBe("t");
    expect(band.dataset.testid).toBe("b");
    expect(band.dataset.surface).toBe("base");
    const inner = slot(container, "band-inner");
    expect(inner.className).toContain("mx-auto");
    expect(inner.className).toContain("max-w-7xl");
    expect(inner.className).toContain("px-4");
  });

  it("pairs every surface with its own foreground", () => {
    expect(bandVariants({ surface: "base" })).toContain("bg-background text-foreground");
    expect(bandVariants({ surface: "muted" })).toContain("bg-muted text-foreground");
    expect(bandVariants({ surface: "accent" })).toContain("bg-primary text-primary-foreground");
    expect(bandVariants({ surface: "inverse" })).toContain("bg-foreground text-background");
  });

  it("renders as a header, footer or div, with a named width", () => {
    const { container } = render(
      <Band as="footer" surface="inverse" width="sm" spacing="sm">
        x
      </Band>,
    );
    const band = slot(container, "band");
    expect(band.tagName).toBe("FOOTER");
    expect(band.dataset.surface).toBe("inverse");
    expect(band.className).toContain("py-8");
    expect(slot(container, "band-inner").className).toContain("max-w-3xl");
  });

  it("renders on the server with no effects", () => {
    const html = renderToStaticMarkup(
      <Band surface="accent">
        <Display as="h1" size="xl">
          Hello
        </Display>
        <BandLead tone="inherit">Lead</BandLead>
      </Band>,
    );
    expect(html).toContain('<section data-slot="band" data-surface="accent"');
    expect(html).toContain("<h1");
    expect(html).toContain("Lead</p>");
  });
});

describe("Display", () => {
  it("keeps the heading level apart from the size", () => {
    const { container } = render(
      <Display as="h1" size="md">
        Title
      </Display>,
    );
    const el = slot(container, "display");
    expect(el.tagName).toBe("H1");
    expect(el.className).toContain("text-2xl");
    expect(el.className).toContain("font-display");
  });

  it("defaults to an h2 at the section size, responsive from mobile up", () => {
    const { container } = render(<Display>Title</Display>);
    expect(slot(container, "display").tagName).toBe("H2");
    expect(displayVariants({ size: "xl" })).toMatch(/text-4xl.*sm:text-5xl.*lg:text-6xl/);
  });
});
