/** NativeLightbox: a full-screen pager with close, counter, caption and actions. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../gallery-types";
import { NativeLightbox } from "../lightbox";

const items: GalleryItem[] = [
  { id: "a", src: "https://example.test/a.jpg", alt: "First", caption: "Warm-up" },
  { id: "b", src: "https://example.test/b.jpg", alt: "Second", caption: "Lift" },
  { id: "c", src: "https://example.test/c.jpg" },
];

describe("NativeLightbox", () => {
  it("renders nothing while closed", () => {
    render(<NativeLightbox open={false} onOpenChange={() => undefined} items={items} index={0} onIndexChange={() => undefined} testID="lb" />);
    expect(screen.queryByTestId("lb")).toBeNull();
  });

  it("shows every page, the counter and the current caption on a dark full-screen modal", () => {
    render(<NativeLightbox open onOpenChange={() => undefined} items={items} index={1} onIndexChange={() => undefined} testID="lb" />);
    expect(screen.getByTestId("lb").getAttribute("data-presentation-style")).toBe("overFullScreen");
    // The backdrop is its own layer, so a pull down can fade it.
    const backdrop = screen.getByTestId("lb-content").firstElementChild as HTMLElement;
    expect(JSON.parse(backdrop.dataset.style!).backgroundColor).toBe("#000000");
    expect(screen.getByTestId("lb-counter").textContent).toBe("2 / 3");
    expect(screen.getByTestId("lb-caption").textContent).toBe("Lift");
    expect(screen.getByTestId("lb-page-a")).toBeTruthy();
    expect(screen.getByTestId("lb-page-c")).toBeTruthy();
  });

  it("closes from the top-left button", () => {
    const onOpenChange = vi.fn();
    render(<NativeLightbox open onOpenChange={onOpenChange} items={items} index={0} onIndexChange={() => undefined} testID="lb" />);
    const close = screen.getByTestId("lb-close");
    expect(close.getAttribute("aria-label")).toBe("Close");
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders custom caption and actions for the current item", () => {
    render(
      <NativeLightbox
        open
        onOpenChange={() => undefined}
        items={items}
        index={2}
        onIndexChange={() => undefined}
        renderCaption={(it, i) => <span data-testid="cap">{`${it.id}#${i}`}</span>}
        renderActions={(it) => <span data-testid="act">{it.id}</span>}
        testID="lb"
      />,
    );
    expect(screen.getByTestId("cap").textContent).toBe("c#2");
    expect(screen.getByTestId("lb-actions").contains(screen.getByTestId("act"))).toBe(true);
    expect(screen.getByTestId("lb-counter").textContent).toBe("3 / 3");
  });

  it("clamps an out-of-range index", () => {
    render(<NativeLightbox open onOpenChange={() => undefined} items={items} index={9} onIndexChange={() => undefined} testID="lb" />);
    expect(screen.getByTestId("lb-counter").textContent).toBe("3 / 3");
  });
});

describe("NativeLightbox additions", () => {
  it("renderMedia replaces each page's picture", () => {
    render(
      <NativeLightbox open onOpenChange={() => undefined} items={items} index={0} onIndexChange={() => undefined} renderMedia={(it, i) => <span data-testid={`m-${it.id}`}>{i}</span>} testID="lb" />,
    );
    expect(screen.getByTestId("lb-page-b").contains(screen.getByTestId("m-b"))).toBe(true);
    expect(screen.getByTestId("m-c").textContent).toBe("2");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows title and description in the top bar and labels the viewer with the title", () => {
    render(
      <NativeLightbox open onOpenChange={() => undefined} items={items} index={0} onIndexChange={() => undefined} title="Session photos" description="3 March" testID="lb" />,
    );
    expect(screen.getByTestId("lb-title").textContent).toBe("Session photos");
    expect(screen.getByTestId("lb-title").getAttribute("role")).toBe("header");
    expect(screen.getByTestId("lb-description").textContent).toBe("3 March");
    expect(screen.getByTestId("lb-content").getAttribute("aria-label")).toBe("Session photos");
    expect(screen.getByTestId("lb-counter").textContent).toBe("1 / 3");
  });

  it("gives screen readers an adjustable pager that reads the position and steps through the items", () => {
    const onIndexChange = vi.fn();
    render(<NativeLightbox open onOpenChange={() => undefined} items={items} index={1} onIndexChange={onIndexChange} testID="lb" />);
    const pager = screen.getByTestId("lb-pager-a11y");
    expect(pager.getAttribute("role")).toBe("adjustable");
    expect(pager.getAttribute("aria-label")).toBe("Second");
    expect(pager.getAttribute("aria-valuetext")).toBe("2 of 3");
    fireEvent(pager, new CustomEvent("accessibilityaction", { detail: "increment" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    fireEvent(pager, new CustomEvent("accessibilityaction", { detail: "decrement" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it("names a picture with no alt by its position, and leaves renderMedia pages to themselves", () => {
    render(
      <NativeLightbox open onOpenChange={() => undefined} items={items} index={2} onIndexChange={() => undefined} renderMedia={(it) => <span>video {it.id}</span>} testID="lb" />,
    );
    expect(screen.getByTestId("lb-pager-a11y").getAttribute("aria-label")).toBe("Photo 3 of 3");
    expect(screen.getByTestId("lb-page-c").textContent).toBe("video c");
    expect(screen.queryByTestId("lb-photo-c")).toBeNull();
  });

  it("with renderMedia, keeps the pages ungrouped so their own controls stay reachable, and the counter is the pager", () => {
    const onIndexChange = vi.fn();
    render(
      <NativeLightbox
        open
        onOpenChange={() => undefined}
        items={items}
        index={0}
        onIndexChange={onIndexChange}
        renderMedia={(it) => <button data-testid={`play-${it.id}`}>Play</button>}
        testID="lb"
      />,
    );
    const pages = screen.getByTestId("lb-pages");
    expect(pages.getAttribute("role")).toBeNull();
    expect(pages.contains(screen.getByTestId("play-a"))).toBe(true);
    const pager = screen.getByTestId("lb-pager-a11y");
    expect(pager.contains(screen.getByTestId("lb-counter"))).toBe(true);
    expect(pager.getAttribute("role")).toBe("adjustable");
    expect(pager.getAttribute("aria-valuetext")).toBe("1 of 3");
    fireEvent(pager, new CustomEvent("accessibilityaction", { detail: "increment" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it("zooms the built-in photo pages, and lets the words change", () => {
    render(<NativeLightbox open onOpenChange={() => undefined} items={items} index={0} onIndexChange={() => undefined} labels={{ close: "Fermer" }} testID="lb" />);
    expect(screen.getByTestId("lb-photo-a")).toBeTruthy();
    expect(screen.getByTestId("lb-close").getAttribute("aria-label")).toBe("Fermer");
  });
});
