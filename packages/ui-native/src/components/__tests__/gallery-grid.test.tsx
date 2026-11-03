/** NativeGalleryGrid: justified rows from the measured width, tappable tiles. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../gallery-types";
import { NativeGalleryGrid } from "../gallery-grid";

const items: GalleryItem[] = Array.from({ length: 5 }, (_, i) => ({
  id: `p${i}`,
  src: `https://example.test/${i}.jpg`,
  alt: `Photo ${i}`,
  width: 400,
  height: 300,
}));

const style = (el: HTMLElement) => JSON.parse(el.dataset.style!) as { width: number; height: number };

/** Measure the grid: the shim turns a `layout` DOM event into onLayout. */
function measure(el: HTMLElement, width: number) {
  act(() => {
    el.dispatchEvent(new CustomEvent("layout", { detail: { width, height: 0 } }));
  });
}

describe("NativeGalleryGrid", () => {
  it("draws nothing until the container is measured, then a tile per item", () => {
    render(<NativeGalleryGrid items={items} testID="g" />);
    expect(screen.queryByTestId("g-item-p0")).toBeNull();
    measure(screen.getByTestId("g"), 600);
    expect(screen.getAllByTestId(/^g-item-/)).toHaveLength(5);
  });

  it("grid layout: square tiles, `columns` per row", () => {
    render(<NativeGalleryGrid items={items} layout="grid" columns={2} gap={10} testID="g" />);
    measure(screen.getByTestId("g"), 210);
    expect(style(screen.getByTestId("g-item-p0"))).toEqual({ width: 100, height: 100 });
    expect(screen.getAllByTestId(/^g-item-/)).toHaveLength(5);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("justified layout: rows fill the width and tiles are buttons with onPressItem", () => {
    const onPressItem = vi.fn();
    render(<NativeGalleryGrid items={items} rowHeight={100} gap={4} onPressItem={onPressItem} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(5);
    expect(tiles[0].getAttribute("aria-label")).toBe("Photo 0");
    const first = style(tiles[0]);
    expect(first.height).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("g-item-p2"));
    expect(onPressItem).toHaveBeenCalledWith(items[2], 2);
  });

  it("renderItem replaces the tile's content", () => {
    render(<NativeGalleryGrid items={items.slice(0, 1)} renderItem={(it) => <span data-testid={`custom-${it.id}`}>x</span>} testID="g" />);
    measure(screen.getByTestId("g"), 300);
    expect(screen.getByTestId("custom-p0")).toBeTruthy();
  });
});

describe("NativeGalleryGrid additions", () => {
  it("overlays renderBadges on the default tile", () => {
    render(<NativeGalleryGrid items={items.slice(0, 2)} renderBadges={(it) => <span data-testid={`b-${it.id}`}>new</span>} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    expect(screen.getByTestId("g-badges-p0").contains(screen.getByTestId("b-p0"))).toBe(true);
  });

  it("a press only selects when onSelectionChange is set, not also onPressItem", () => {
    const onPressItem = vi.fn();
    const onSelectionChange = vi.fn();
    render(<NativeGalleryGrid items={items} onPressItem={onPressItem} onSelectionChange={onSelectionChange} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    fireEvent.click(screen.getByTestId("g-item-p0"));
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onPressItem).not.toHaveBeenCalled();
  });

  it("toggles selection on press, ringing selected tiles", () => {
    const onSelectionChange = vi.fn();
    render(<NativeGalleryGrid items={items} selected={["p1"]} onSelectionChange={onSelectionChange} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    const chosen = screen.getByTestId("g-item-p1");
    expect(chosen.getAttribute("aria-selected")).toBe("true");
    expect(chosen.className).toContain("border-ring");
    expect(screen.getByTestId("g-item-p0").getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByTestId("g-item-p0"));
    expect(onSelectionChange).toHaveBeenCalledWith(["p1", "p0"], { item: items[0], index: 0 });
    fireEvent.click(chosen);
    expect(onSelectionChange).toHaveBeenLastCalledWith([], { item: items[1], index: 1 });
  });

  it("calls onNearEnd once per item count, after the rows render", () => {
    const onNearEnd = vi.fn();
    const { rerender } = render(<NativeGalleryGrid items={items} onNearEnd={onNearEnd} testID="g" />);
    expect(onNearEnd).not.toHaveBeenCalled();
    measure(screen.getByTestId("g"), 600);
    expect(onNearEnd).toHaveBeenCalledTimes(1);
    rerender(<NativeGalleryGrid items={items} onNearEnd={onNearEnd} testID="g" />);
    expect(onNearEnd).toHaveBeenCalledTimes(1);
    rerender(<NativeGalleryGrid items={[...items, { id: "p9", src: "https://example.test/9.jpg" }]} onNearEnd={onNearEnd} testID="g" />);
    expect(onNearEnd).toHaveBeenCalledTimes(2);
  });

  it("groups items in order of first appearance under headers", () => {
    const grouped = items.map((it, i) => ({ ...it, caption: i % 2 ? "Odd" : "Even" }));
    const onPressItem = vi.fn();
    render(<NativeGalleryGrid items={grouped} getGroup={(it) => it.caption!} onPressItem={onPressItem} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    const headers = screen.getAllByRole("header").map((h) => h.textContent);
    expect(headers).toEqual(["Even", "Odd"]);
    expect(screen.getByTestId("g-group-Odd").contains(screen.getByTestId("g-item-p1"))).toBe(true);
    fireEvent.click(screen.getByTestId("g-item-p3"));
    expect(onPressItem).toHaveBeenCalledWith(grouped[3], 3);
  });
});
