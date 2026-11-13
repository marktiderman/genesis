// @feat:page-layouts
/**
 * DocumentPage (ADR 0022): cover, icon, title and a centred reading column.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentPage } from "../document-page";
import { DocumentPage as FromBarrel } from "..";

describe("DocumentPage", () => {
  it("renders one h1, the icon and the body in a reading column", () => {
    const { container } = render(
      <DocumentPage title="Trip notes" subtitle="Edited today" icon="🌊" actions={<button type="button">Share</button>} testID="doc">
        <p>Body</p>
      </DocumentPage>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const root = screen.getByTestId("doc");
    expect(root.getAttribute("data-slot")).toBe("document-page");
    expect(root.getAttribute("data-width")).toBe("reading");
    expect(container.querySelector('[data-slot="document-page-icon"]')?.textContent).toBe("🌊");
    expect(container.querySelector('[data-slot="document-page-title"]')?.className).toContain("var(--page-title-font-weight)");
    expect(container.querySelector('[data-slot="document-page-body"]')?.parentElement?.className).toContain("max-w-3xl");
    expect(container.querySelector('[data-slot="document-page-cover"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Share" })).not.toBeNull();
  });

  it("draws an image cover as decoration, takes a node as a cover, and goes full width", () => {
    const { container, rerender } = render(<DocumentPage title="T" cover="/c.jpg" />);
    const img = container.querySelector('[data-slot="document-page-cover"] img');
    expect(img?.getAttribute("src")).toBe("/c.jpg");
    expect(img?.getAttribute("alt")).toBe("");
    rerender(<DocumentPage title="T" cover={<div data-testid="band" />} width="full" />);
    expect(screen.getByTestId("band")).not.toBeNull();
    expect(container.querySelector('[data-slot="document-page"]')?.getAttribute("data-width")).toBe("full");
  });

  it("ships from the layout barrel", () => {
    expect(FromBarrel).toBe(DocumentPage);
  });
});
