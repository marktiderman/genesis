/**
 * ScrollArea — Radix viewport + rendered scrollbar.
 *
 * What the hand-rolled version was: one `overflow-auto` div carrying a stack
 * of `::-webkit-scrollbar` pseudo-element rules. That vocabulary is WebKit-
 * only, so Firefox ignored every one of them and drew the OS scrollbar — the
 * "design system scrollbar" was a Chrome/Safari-only promise. Radix hides the
 * native scrollbar and renders a real element instead, which is what these
 * tests assert exists.
 *
 * Sizes are all zero under happy-dom, so the THUMB (whose presence depends on
 * a measured thumb size) never mounts here and `type="auto"` — the default,
 * which shows a scrollbar only while the content overflows — has nothing to
 * detect. Scrollbar assertions therefore pass `type="always"`, which is the
 * one mode whose visibility does not depend on layout.
 */
import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScrollArea } from "../scroll-area";

const VIEWPORT = "[data-radix-scroll-area-viewport]";

function viewport(container: HTMLElement) {
  return container.querySelector<HTMLElement>(VIEWPORT);
}

/** The scrollbars are the only nodes a ScrollArea gives `data-orientation`. */
function scrollbars(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-orientation]"));
}

describe("ScrollArea — structure", () => {
  it("renders its content inside a Radix viewport", () => {
    const { container } = render(
      <ScrollArea>
        <div>scrollable content</div>
      </ScrollArea>
    );

    const vp = viewport(container);
    expect(vp).not.toBeNull();
    expect(vp!.contains(screen.getByText("scrollable content"))).toBe(true);
  });

  it("renders a scrollbar element instead of relying on the native one", () => {
    const { container } = render(
      <ScrollArea type="always">
        <div>scrollable content</div>
      </ScrollArea>
    );

    const bars = scrollbars(container);
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute("data-orientation")).toBe("vertical");
    // The same 8px track the ::-webkit-scrollbar rules used to draw.
    expect(bars[0].classList.contains("w-2")).toBe(true);
  });

  it("merges the caller className onto the root", () => {
    const { container } = render(
      <ScrollArea className="h-72 w-48 rounded-md border">
        <div>scrollable content</div>
      </ScrollArea>
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains("h-72")).toBe(true);
    expect(root.classList.contains("relative")).toBe(true);
    expect(root.classList.contains("overflow-hidden")).toBe(true);
  });
});

describe("ScrollArea — orientation", () => {
  it("scrolls vertically and clips horizontally by default", () => {
    const { container } = render(
      <ScrollArea type="always">
        <div>scrollable content</div>
      </ScrollArea>
    );

    // Radix derives the viewport's overflow from which scrollbars are mounted,
    // which is how the old `overflow-y-auto overflow-x-hidden` pair survives.
    expect(viewport(container)!.style.overflowY).toBe("scroll");
    expect(viewport(container)!.style.overflowX).toBe("hidden");
    expect(scrollbars(container).map((b) => b.getAttribute("data-orientation"))).toEqual([
      "vertical",
    ]);
  });

  it("scrolls horizontally and clips vertically when asked", () => {
    const { container } = render(
      <ScrollArea orientation="horizontal" type="always">
        <div>scrollable content</div>
      </ScrollArea>
    );

    expect(viewport(container)!.style.overflowX).toBe("scroll");
    expect(viewport(container)!.style.overflowY).toBe("hidden");
    expect(scrollbars(container).map((b) => b.getAttribute("data-orientation"))).toEqual([
      "horizontal",
    ]);
  });

  it("mounts both scrollbars for orientation=both", () => {
    const { container } = render(
      <ScrollArea orientation="both" type="always">
        <div>scrollable content</div>
      </ScrollArea>
    );

    expect(viewport(container)!.style.overflowX).toBe("scroll");
    expect(viewport(container)!.style.overflowY).toBe("scroll");
    expect(scrollbars(container).map((b) => b.getAttribute("data-orientation"))).toEqual([
      "vertical",
      "horizontal",
    ]);
  });
});

// ---------------------------------------------------------------------------
// PROP DESTINATIONS. This used to be one element; it is now a root plus an
// inner viewport, and the root does not scroll. A prop that lands on the root
// and silently does nothing is worse than one that errors, so the three with no
// other correct destination are routed inward.
// ---------------------------------------------------------------------------

describe("ScrollArea — prop destinations", () => {
  it("attaches onScroll to the viewport, not the non-scrolling root", () => {
    const onScroll = vi.fn();
    const { container } = render(
      <ScrollArea onScroll={onScroll}>
        <div>scrollable content</div>
      </ScrollArea>
    );

    // `scroll` does not bubble. A handler left on the root would never fire
    // once, silently breaking infinite-loading and scroll-position UI.
    fireEvent.scroll(viewport(container)!);
    expect(onScroll).toHaveBeenCalledTimes(1);

    onScroll.mockClear();
    fireEvent.scroll(container.firstElementChild!);
    expect(onScroll).not.toHaveBeenCalled();
  });

  it("forwards nonce onto the scrollbar-hiding style tag", () => {
    const { container } = render(
      <ScrollArea nonce="test-nonce">
        <div>scrollable content</div>
      </ScrollArea>
    );

    // Radix reads the nonce only off Viewport, and spends it on the <style>
    // element it injects. Left on the root the prop is inert, and a strict
    // `style-src 'nonce-…'` policy blocks the rule that hides the native
    // scrollbar — so it shows up alongside the custom one.
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    expect(style!.getAttribute("nonce")).toBe("test-nonce");
    expect(container.firstElementChild!.hasAttribute("nonce")).toBe(false);
  });

  it("gives viewportProps a ref to the element that actually scrolls", () => {
    const viewportRef = createRef<HTMLDivElement>();
    const rootRef = createRef<HTMLDivElement>();
    const { container } = render(
      <ScrollArea
        ref={rootRef}
        viewportProps={{ ref: viewportRef, tabIndex: 0 }}
      >
        <div>scrollable content</div>
      </ScrollArea>
    );

    expect(rootRef.current).toBe(container.firstElementChild);
    expect(viewportRef.current).toBe(viewport(container));
    expect(viewportRef.current).not.toBe(rootRef.current);
    expect(viewport(container)!.getAttribute("tabindex")).toBe("0");
  });

  it("merges viewportProps className rather than replacing the layout classes", () => {
    const { container } = render(
      <ScrollArea viewportProps={{ className: "extra" }}>
        <div>scrollable content</div>
      </ScrollArea>
    );

    const vp = viewport(container)!;
    expect(vp.classList.contains("extra")).toBe(true);
    expect(vp.classList.contains("h-full")).toBe(true);
  });

  it("keeps everything else on the root", () => {
    const { container } = render(
      <ScrollArea id="scroller" aria-label="Log" data-testid="root">
        <div>scrollable content</div>
      </ScrollArea>
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("id")).toBe("scroller");
    expect(root.getAttribute("aria-label")).toBe("Log");
    expect(root.getAttribute("data-testid")).toBe("root");
  });
});

describe("ScrollArea — visibility mode", () => {
  it("defaults to type=auto, so no scrollbar shows without overflow", () => {
    const { container } = render(
      <ScrollArea>
        <div>scrollable content</div>
      </ScrollArea>
    );

    // `auto` mirrors what `overflow-auto` did: a scrollbar exactly while the
    // content overflows. Nothing overflows in a zero-height jsdom layout.
    expect(scrollbars(container)).toHaveLength(0);
    expect(viewport(container)).not.toBeNull();
  });
});
