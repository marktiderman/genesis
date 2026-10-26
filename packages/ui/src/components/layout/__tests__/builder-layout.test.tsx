/**
 * BuilderLayout contract: which slots render, as which landmarks, with which
 * column classes, and that the preview is never remounted by changes to the
 * other slots.
 *
 * happy-dom does not evaluate container queries, so the column geometry is
 * measured in a real browser by the play functions in
 * apps/sample/stories/BuilderLayout.stories.tsx (1440, 1024, 768, 375). Here
 * the classes are pinned instead.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BuilderLayout } from "../builder-layout";

const slot = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-slot="builder-layout-${name}"]`) as HTMLElement | null;
const grid = (container: HTMLElement) => container.querySelector('[data-slot="builder-layout"] > div') as HTMLElement;

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      Clicked {n}
    </button>
  );
}

describe("BuilderLayout slots", () => {
  it("renders the editor alone, in one column", () => {
    const { container } = render(<BuilderLayout editor={<p>Editor</p>} />);
    expect(screen.getByText("Editor")).toBeTruthy();
    expect(slot(container, "outline")).toBeNull();
    expect(slot(container, "preview")).toBeNull();
    expect(grid(container).className).not.toMatch(/grid-cols/);
    expect(container.firstElementChild!.className).toMatch(/@container/);
  });

  it("renders all three slots in order, as labelled landmarks", () => {
    const { container } = render(
      <BuilderLayout
        outline={<p>Outline body</p>}
        outlineLabel="Outline"
        editor={<p>Editor body</p>}
        preview={<p>Preview body</p>}
        previewLabel="Preview"
      />,
    );
    expect(screen.getByRole("navigation", { name: "Outline" }).textContent).toBe("Outline body");
    expect(screen.getByRole("complementary", { name: "Preview" }).textContent).toBe("Preview body");
    const order = Array.from(grid(container).children).map((c) => c.getAttribute("data-slot"));
    expect(order).toEqual(["builder-layout-outline", "builder-layout-editor", "builder-layout-preview"]);
  });

  it("uses plain divs, not landmarks, without labels", () => {
    const { container } = render(<BuilderLayout outline="o" editor="e" preview="p" />);
    expect(slot(container, "outline")!.tagName).toBe("DIV");
    expect(slot(container, "preview")!.tagName).toBe("DIV");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("matches the forms-builder breakpoints for each slot combination", () => {
    const three = render(<BuilderLayout outline="o" editor="e" preview="p" />);
    expect(grid(three.container).className).toContain("@min-[34rem]:grid-cols-[13rem_minmax(0,1fr)]");
    expect(grid(three.container).className).toContain("@min-[56rem]:grid-cols-[13rem_minmax(0,1fr)_20rem]");
    expect(grid(three.container).className).toContain("@min-[76rem]:grid-cols-[16rem_minmax(0,1fr)_24.5rem]");
    // Under 56rem the preview spans the outline and editor columns, under them.
    expect(slot(three.container, "preview")!.className).toContain("@min-[34rem]:col-span-2");
    expect(slot(three.container, "preview")!.className).toContain("@min-[56rem]:col-span-1");
    three.unmount();

    const outlined = render(<BuilderLayout outline="o" editor="e" />);
    expect(grid(outlined.container).className).toContain("@min-[34rem]:grid-cols-[13rem_minmax(0,1fr)]");
    expect(grid(outlined.container).className).toContain("@min-[48rem]:grid-cols-[16rem_minmax(0,1fr)]");
    outlined.unmount();

    const previewed = render(<BuilderLayout editor="e" preview="p" />);
    expect(grid(previewed.container).className).toContain("@min-[56rem]:grid-cols-[minmax(0,1fr)_20rem]");
    expect(grid(previewed.container).className).toContain("@min-[76rem]:grid-cols-[minmax(0,1fr)_24.5rem]");
    expect(slot(previewed.container, "preview")!.className).not.toContain("col-span-2");
  });

  it("pins the outline and preview only when asked, with their own scroll when asked", () => {
    const plain = render(<BuilderLayout outline="o" editor="e" preview="p" />);
    expect(slot(plain.container, "outline")!.className).not.toMatch(/sticky/);
    expect(slot(plain.container, "preview")!.className).not.toMatch(/sticky/);
    plain.unmount();

    const pinned = render(<BuilderLayout outline="o" editor="e" preview="p" sticky={{ preview: true }} />);
    expect(slot(pinned.container, "outline")!.className).not.toMatch(/sticky/);
    expect(slot(pinned.container, "preview")!.className).toContain("@min-[56rem]:sticky");
    expect(slot(pinned.container, "preview")!.className).not.toMatch(/overflow-y-auto/);
    pinned.unmount();

    const scrolling = render(<BuilderLayout outline="o" editor="e" preview="p" sticky scrollSticky />);
    expect(slot(scrolling.container, "outline")!.className).toContain("@min-[34rem]:sticky");
    expect(slot(scrolling.container, "outline")!.className).toContain("@min-[34rem]:overflow-y-auto");
    expect(slot(scrolling.container, "preview")!.className).toContain("@min-[56rem]:overflow-y-auto");
  });

  it("passes slot props through and merges classes", () => {
    const { container } = render(
      <BuilderLayout
        data-testid="root"
        className="extra"
        outline="o"
        outlineProps={{ className: "space-y-3", "data-testid": "the-outline" }}
        editor="e"
        editorProps={{ "data-testid": "the-editor" }}
        preview="p"
        previewProps={{ className: "space-y-4", "data-testid": "the-preview" }}
      />,
    );
    expect(screen.getByTestId("root").className).toMatch(/@container.*extra/);
    expect(screen.getByTestId("the-outline").className).toMatch(/min-w-0.*space-y-3/);
    expect(screen.getByTestId("the-editor")).toBe(slot(container, "editor"));
    expect(screen.getByTestId("the-preview").className).toMatch(/space-y-4/);
  });
});

describe("BuilderLayout keeps the preview mounted", () => {
  it("across editor changes", () => {
    const { rerender } = render(
      <BuilderLayout outline="o" editor={<p key="a">Section A</p>} preview={<Counter />} previewLabel="Preview" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clicked 0" }));
    const button = screen.getByRole("button", { name: "Clicked 1" });
    const aside = screen.getByRole("complementary");

    rerender(<BuilderLayout outline="o" editor={<section key="b">Section B</section>} preview={<Counter />} previewLabel="Preview" />);
    expect(screen.getByText("Section B")).toBeTruthy();
    expect(screen.getByRole("complementary")).toBe(aside);
    expect(screen.getByRole("button", { name: "Clicked 1" })).toBe(button);
  });

  it("when the outline comes and goes", () => {
    const { rerender } = render(<BuilderLayout outline="o" editor="A" preview={<Counter />} />);
    fireEvent.click(screen.getByRole("button", { name: "Clicked 0" }));
    const button = screen.getByRole("button", { name: "Clicked 1" });
    rerender(<BuilderLayout editor="Settings" preview={<Counter />} />);
    expect(screen.getByRole("button", { name: "Clicked 1" })).toBe(button);
    rerender(<BuilderLayout outline="o" editor="A" preview={<Counter />} />);
    expect(screen.getByRole("button", { name: "Clicked 1" })).toBe(button);
  });

  it("while hidden, and gives its column back to the editor", () => {
    const { container, rerender } = render(<BuilderLayout editor="A" preview={<Counter />} />);
    fireEvent.click(screen.getByRole("button", { name: "Clicked 0" }));
    const button = screen.getByRole("button", { name: "Clicked 1" });

    rerender(<BuilderLayout editor="Wide settings" preview={<Counter />} previewHidden />);
    expect(button.isConnected).toBe(true);
    expect(slot(container, "preview")!.className).toMatch(/\bhidden\b/);
    expect(grid(container).className).not.toMatch(/grid-cols/);

    rerender(<BuilderLayout editor="A" preview={<Counter />} />);
    expect(screen.getByRole("button", { name: "Clicked 1" })).toBe(button);
    expect(slot(container, "preview")!.className).not.toMatch(/\bhidden\b/);
  });
});
