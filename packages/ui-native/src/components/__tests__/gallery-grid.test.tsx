/** NativeGalleryGrid: justified rows from the measured width, tappable tiles. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GALLERY_DEFAULTS, type GalleryItem } from "../gallery-types";
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

  it("justified layout: rows fill the width and tiles are buttons with onItemPress", () => {
    const onItemPress = vi.fn();
    render(<NativeGalleryGrid items={items} rowHeight={100} gap={4} onItemPress={onItemPress} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(5);
    expect(tiles[0].getAttribute("aria-label")).toBe("Photo 0");
    const first = style(tiles[0]);
    expect(first.height).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("g-item-p2"));
    expect(onItemPress).toHaveBeenCalledWith(items[2], 2);
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

  it("a press only selects when onSelectionChange is set, not also onItemPress", () => {
    const onItemPress = vi.fn();
    const onSelectionChange = vi.fn();
    render(<NativeGalleryGrid items={items} onItemPress={onItemPress} onSelectionChange={onSelectionChange} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    fireEvent.click(screen.getByTestId("g-item-p0"));
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onItemPress).not.toHaveBeenCalled();
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

  it("calls loadMore only when scrolling nears the end, not on measure or on new items", () => {
    const loadMore = vi.fn();
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, src: `https://example.test/m${i}.jpg`, width: 400, height: 300 }));
    const { rerender } = render(<NativeGalleryGrid items={many} loadMore={loadMore} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    rerender(<NativeGalleryGrid items={[...many, { id: "x", src: "https://example.test/x.jpg" }]} loadMore={loadMore} testID="g" />);
    expect(loadMore).not.toHaveBeenCalled();
    act(() => {
      screen.getByTestId("g-list").dispatchEvent(new Event("endreached"));
    });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("renders the rows through a list with a header and footer, and sizes grid tiles by aspectRatio", () => {
    render(
      <NativeGalleryGrid items={items} layout="grid" columns={2} gap={10} aspectRatio={2} header={<span>Top</span>} footer={<span>More</span>} testID="g" />,
    );
    measure(screen.getByTestId("g"), 210);
    expect(screen.getByTestId("g-list").textContent).toMatch(/^Top.*More$/);
    expect(style(screen.getByTestId("g-item-p0"))).toEqual({ width: 100, height: 50 });
  });

  it("still takes the deprecated onNearEnd and getGroup", () => {
    const onNearEnd = vi.fn();
    render(<NativeGalleryGrid items={items} onNearEnd={onNearEnd} getGroup={() => "All"} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    act(() => {
      screen.getByTestId("g-list").dispatchEvent(new Event("endreached"));
    });
    expect(onNearEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("g-group-All")).toBeTruthy();
  });

  it("draws an item with no image as a neutral tile with its words, still named and pressable", () => {
    const onItemPress = vi.fn();
    render(<NativeGalleryGrid items={[{ id: "n", src: "", alt: "Untitled", caption: "No photo yet" }]} onItemPress={onItemPress} testID="g" />);
    measure(screen.getByTestId("g"), 300);
    const tile = screen.getByTestId("g-item-n");
    expect(tile.getAttribute("aria-label")).toBe("Untitled");
    expect(tile.querySelector("img")).toBeNull();
    expect(screen.getByTestId("g-placeholder-n").textContent).toBe("UntitledNo photo yet");
    fireEvent.click(tile);
    expect(onItemPress).toHaveBeenCalledWith(expect.objectContaining({ id: "n" }), 0);
  });

  it("names a plain (not pressable) placeholder tile as an image", () => {
    render(<NativeGalleryGrid items={[{ id: "n", src: "", alt: "Untitled" }]} testID="g" />);
    measure(screen.getByTestId("g"), 300);
    const placeholder = screen.getByTestId("g-placeholder-n");
    expect(placeholder.getAttribute("role")).toBe("image");
    expect(placeholder.getAttribute("aria-label")).toBe("Untitled");
  });

  it("shares the web's defaults", () => {
    expect(GALLERY_DEFAULTS).toEqual({ rowHeight: 180, gap: 4, columns: 3 });
  });

  it("groups items in order of first appearance under headers", () => {
    const grouped = items.map((it, i) => ({ ...it, caption: i % 2 ? "Odd" : "Even" }));
    const onItemPress = vi.fn();
    render(<NativeGalleryGrid items={grouped} groupBy={(it) => it.caption!} onItemPress={onItemPress} testID="g" />);
    measure(screen.getByTestId("g"), 600);
    const headers = screen.getAllByRole("header").map((h) => h.textContent);
    expect(headers).toEqual(["Even", "Odd"]);
    expect(screen.getByTestId("g-group-Odd").textContent).toBe("Odd");
    expect(screen.getAllByTestId("g-row-Odd").some((row) => row.contains(screen.getByTestId("g-item-p1")))).toBe(true);
    fireEvent.click(screen.getByTestId("g-item-p3"));
    expect(onItemPress).toHaveBeenCalledWith(grouped[3], 3);
  });
});
