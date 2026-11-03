/**
 * Lightbox navigation contract.
 *
 * The viewer must stop at the ends (no wrap), disable the dead control, step
 * on the arrow keys, and report its position as "n / N". All of that compiles
 * either way, so it is pinned to the rendered DOM here.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Lightbox } from "../lightbox";
import type { GalleryItem } from "../gallery-types";

const items: GalleryItem[] = [
  { id: "a", src: "/a.jpg", alt: "First", caption: "The first one" },
  { id: "b", src: "/b.jpg", alt: "Second" },
  { id: "c", src: "/c.jpg", alt: "Third", caption: "Last" },
];

describe("Lightbox", () => {
  it("leaves arrow keys to a field inside the lightbox", () => {
    const onIndexChange = vi.fn();
    render(
      <Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={onIndexChange} renderCaption={() => <input aria-label="note" />} />,
    );
    fireEvent.keyDown(screen.getByLabelText("note"), { key: "ArrowRight" });
    expect(onIndexChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("ignores a swipe that starts on a field", () => {
    const onIndexChange = vi.fn();
    render(
      <Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={onIndexChange} renderCaption={() => <input aria-label="note" />} />,
    );
    const field = screen.getByLabelText("note");
    fireEvent.touchStart(field, { changedTouches: [{ clientX: 300, clientY: 0 }] });
    fireEvent.touchEnd(screen.getByRole("dialog"), { changedTouches: [{ clientX: 100, clientY: 0 }] });
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(<Lightbox open={false} onOpenChange={() => {}} items={items} index={0} onIndexChange={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the current image, its caption and an 'n / N' counter", () => {
    render(<Lightbox open onOpenChange={() => {}} items={items} index={2} onIndexChange={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Third" })).toBeTruthy();
    expect(document.querySelector('[data-slot="lightbox-counter"]')!.textContent).toBe("3 / 3");
    expect(document.querySelector('[data-slot="lightbox-caption"]')!.textContent).toBe("Last");
  });

  it("shows no counter for a single picture", () => {
    render(<Lightbox open onOpenChange={() => {}} items={items.slice(0, 1)} index={0} onIndexChange={() => {}} />);
    expect(document.querySelector('[data-slot="lightbox-counter"]')).toBeNull();
  });

  it("steps with the buttons and reports through onIndexChange", () => {
    const onIndexChange = vi.fn();
    render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={onIndexChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it("disables Previous at the start and Next at the end, and never wraps", () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <Lightbox open onOpenChange={() => {}} items={items} index={0} onIndexChange={onIndexChange} />,
    );
    const prev = screen.getByRole("button", { name: "Previous image" }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(onIndexChange).not.toHaveBeenCalled();

    rerender(<Lightbox open onOpenChange={() => {}} items={items} index={2} onIndexChange={onIndexChange} />);
    const next = screen.getByRole("button", { name: "Next image" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("steps with ArrowLeft / ArrowRight", () => {
    const onIndexChange = vi.fn();
    render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={onIndexChange} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it("closes on Escape through onOpenChange", () => {
    const onOpenChange = vi.fn();
    render(<Lightbox open onOpenChange={onOpenChange} items={items} index={0} onIndexChange={() => {}} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders the actions and caption slots for the current item", () => {
    render(
      <Lightbox
        open
        onOpenChange={() => {}}
        items={items}
        index={1}
        onIndexChange={() => {}}
        renderActions={(item) => <button type="button">Share {item.id}</button>}
        renderCaption={(item, i) => <em>{`${item.alt} (#${i})`}</em>}
      />,
    );
    expect(screen.getByRole("button", { name: "Share b" })).toBeTruthy();
    expect(document.querySelector('[data-slot="lightbox-caption"]')!.textContent).toBe("Second (#1)");
  });

  it("renders renderMedia for the item in the stage instead of the img, with prev/next over it", () => {
    const renderMedia = vi.fn((item: GalleryItem) => <video data-testid="player" data-item={item.id} />);
    render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={() => {}} renderMedia={renderMedia} />);
    expect(renderMedia).toHaveBeenLastCalledWith(items[1], 1);
    expect(screen.getByTestId("player").getAttribute("data-item")).toBe("b");
    const stage = document.querySelector('[data-slot="lightbox-stage"]')!;
    expect(stage.className).toContain("flex-1");
    expect(stage.className).toContain("min-h-0");
    expect(stage.querySelector("img")).toBeNull();
    expect(stage.contains(screen.getByTestId("player"))).toBe(true);
    expect(stage.contains(screen.getByRole("button", { name: "Previous image" }))).toBe(true);
    expect(stage.contains(screen.getByRole("button", { name: "Next image" }))).toBe(true);
  });

  it("shows title and description in the top bar; title names the dialog", () => {
    render(
      <Lightbox
        open
        onOpenChange={() => {}}
        items={items}
        index={0}
        onIndexChange={() => {}}
        title="Summer camp"
        description={<span>42 photos</span>}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Summer camp" })).toBeTruthy();
    const header = document.querySelector('[data-slot="lightbox-header"]')!;
    expect(header.textContent).toContain("Summer camp");
    expect(header.textContent).toContain("42 photos");
  });

  it("keeps the dialog named from the item when there is no title (sr-only)", () => {
    render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Second" });
    expect(dialog.querySelector("h2")!.className).toContain("sr-only");
  });

  it("forwards unhandled keys to onKey, but never arrows or Escape", () => {
    const onKey = vi.fn();
    render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={() => {}} onKey={onKey} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "f" });
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(onKey.mock.calls[0]![0].key).toBe("f");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it("does not call onKey with a modifier held or from inside a field or widget", () => {
    const onKey = vi.fn();
    render(
      <Lightbox
        open
        onOpenChange={() => {}}
        items={items}
        index={1}
        onIndexChange={() => {}}
        onKey={onKey}
        renderActions={() => (
          <>
            <input aria-label="Caption" />
            <div role="slider" aria-label="Zoom" tabIndex={0} />
          </>
        )}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "f", ctrlKey: true });
    fireEvent.keyDown(dialog, { key: "f", metaKey: true });
    fireEvent.keyDown(dialog, { key: "f", altKey: true });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Caption" }), { key: "f" });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Zoom" }), { key: "f" });
    expect(onKey).not.toHaveBeenCalled();
  });

  it("turns a horizontal swipe into prev/next, ignoring short or vertical ones", () => {
    const onIndexChange = vi.fn();
    render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={onIndexChange} />);
    const dialog = screen.getByRole("dialog");
    const swipe = (x0: number, y0: number, x1: number, y1: number) => {
      fireEvent.touchStart(dialog, { changedTouches: [{ clientX: x0, clientY: y0 }] });
      fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: x1, clientY: y1 }] });
    };
    swipe(200, 100, 100, 110); // left 100px -> next
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    swipe(100, 100, 200, 90); // right 100px -> prev
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
    onIndexChange.mockClear();
    swipe(100, 100, 140, 100); // 40px: too short
    swipe(100, 100, 200, 190); // mostly vertical
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("names a picture with no alt by its position, never leaving it decorative", () => {
    render(<Lightbox open onOpenChange={() => {}} items={[{ id: "x", src: "/x.jpg" }, ...items]} index={0} onIndexChange={() => {}} />);
    expect(document.querySelector('[data-slot="lightbox-stage"] img')!.getAttribute("alt")).toBe("Image 1 of 4");
  });

  it("moves focus to the other arrow when the one pressed reaches an end", () => {
    const { rerender } = render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={() => {}} />);
    const next = screen.getByRole("button", { name: "Next image" });
    next.focus();
    rerender(<Lightbox open onOpenChange={() => {}} items={items} index={2} onIndexChange={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Previous image" }));
    rerender(<Lightbox open onOpenChange={() => {}} items={items} index={0} onIndexChange={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next image" }));
  });

  it("lets the words change", () => {
    render(<Lightbox open onOpenChange={() => {}} items={items} index={1} onIndexChange={() => {}} labels={{ previous: "Précédente", next: "Suivante" }} />);
    expect(screen.getByRole("button", { name: "Précédente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suivante" })).toBeTruthy();
  });
});
