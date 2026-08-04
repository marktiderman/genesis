/**
 * VisuallyHidden — present to assistive tech, absent from the layout.
 *
 * The whole value of this primitive is a distinction nothing in a build can
 * check: `display: none` and `visibility: hidden` also make text invisible, and
 * they also remove it from the accessibility tree — which is the exact bug this
 * component exists to prevent. So the assertions are (a) the node is still
 * queryable/named, and (b) it is clipped rather than hidden.
 *
 * The clip styles are asserted on the ELEMENT's inline style, not on a class,
 * on purpose: Radix applies them inline precisely so a consumer's Tailwind
 * build can't drop them. If someone "simplifies" this to `className="sr-only"`,
 * these assertions fail — which is the point.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VisuallyHidden } from "../visually-hidden";

describe("VisuallyHidden", () => {
  it("keeps its text in the accessibility tree", () => {
    render(<VisuallyHidden testID="vh">Loading results</VisuallyHidden>);

    const node = screen.getByTestId("vh");
    expect(node.textContent).toBe("Loading results");
    // Queryable by text means it is a real, non-`display:none` node.
    expect(screen.getByText("Loading results")).toBe(node);
  });

  it("clips instead of hiding — display and visibility stay untouched", () => {
    render(<VisuallyHidden testID="vh">Close</VisuallyHidden>);

    const style = screen.getByTestId("vh").style;

    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
    expect(style.position).toBe("absolute");
    expect(style.overflow).toBe("hidden");
    expect(style.clip).toBe("rect(0, 0, 0, 0)");
    expect(style.whiteSpace).toBe("nowrap");
  });

  it("collapses to a 1px box so it never affects layout", () => {
    render(<VisuallyHidden testID="vh">Close</VisuallyHidden>);

    const style = screen.getByTestId("vh").style;
    expect(style.width).toBe("1px");
    expect(style.height).toBe("1px");
    expect(style.padding).toBe("0px");
    expect(style.border).toBe("0px");
  });

  it("names an icon-only control it is nested inside", () => {
    render(
      <button type="button">
        <span aria-hidden="true">x</span>
        <VisuallyHidden>Dismiss notification</VisuallyHidden>
      </button>
    );

    // Resolves only if the hidden text contributes to the accessible name.
    expect(
      screen.getByRole("button", { name: "Dismiss notification" })
    ).toBeTruthy();
  });

  // The next two tests are a pair, and they are the reason the component's
  // JSDoc says what it says. An earlier draft of that doc advertised a
  // `className`-driven focus reveal for skip links. That cannot work: an
  // inline style beats an ordinary class declaration, so the very property
  // that makes this primitive robust against a consumer's build ALSO makes it
  // impossible for a consumer to override deliberately with a class. The
  // override channel is the `style` prop, which Radix spreads last.
  //
  // A test asserting only "the class landed on the element" would pass in both
  // worlds and prove nothing, so these assert the computed outcome instead:
  // a real stylesheet is installed, and the class is one that WOULD un-clip the
  // element if classes won.

  function withStylesheet(css: string) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  }

  it("does NOT let a className override the clipping — the inline style wins", () => {
    const cleanup = withStylesheet(".unclip { position: static; }");
    try {
      render(
        <VisuallyHidden testID="vh" className="unclip">
          Skip to content
        </VisuallyHidden>
      );

      const node = screen.getByTestId("vh");
      // The class IS applied — it simply loses.
      expect(node.classList.contains("unclip")).toBe(true);
      expect(getComputedStyle(node).position).toBe("absolute");
    } finally {
      cleanup();
    }
  });

  it("DOES let the `style` prop override the clipping — the documented escape hatch", () => {
    render(
      <VisuallyHidden
        testID="vh"
        style={{ position: "static", clip: "auto", width: "auto", height: "auto" }}
      >
        Now visible
      </VisuallyHidden>
    );

    const node = screen.getByTestId("vh");
    expect(getComputedStyle(node).position).toBe("static");
    expect(node.style.clip).toBe("auto");
    expect(node.style.width).toBe("auto");
  });

  it("forwards a ref to the rendered element", () => {
    const ref = { current: null as HTMLElement | null };
    render(
      <VisuallyHidden ref={ref} testID="vh">
        Status
      </VisuallyHidden>
    );
    expect(ref.current).toBe(screen.getByTestId("vh"));
  });
});
