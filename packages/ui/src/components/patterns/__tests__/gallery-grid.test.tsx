/**
 * GalleryGrid + justifyRows contract.
 *
 * `justifyRows` is pure, so its packing is checked numerically: rows fill the
 * container to the pixel, the target height is honoured, the 4:3 fallback
 * applies, and the last row never balloons. The component tests pin what a
 * reader meets: tiles become named buttons only when clickable, and
 * `renderItem` replaces the image without losing the click.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GalleryGrid } from "../gallery-grid";
import { justifyRows, galleryItemRatio, DEFAULT_GALLERY_RATIO } from "../gallery-layout";
import { GALLERY_DEFAULTS, type GalleryItem } from "../gallery-types";

const landscape = (id: string): GalleryItem => ({ id, src: `/${id}.jpg`, width: 1600, height: 900 });
const portrait = (id: string): GalleryItem => ({ id, src: `/${id}.jpg`, width: 900, height: 1600 });
const square = (id: string): GalleryItem => ({ id, src: `/${id}.jpg`, width: 1000, height: 1000 });

const rowWidth = (row: { tiles: { width: number }[] }, gap: number) =>
  row.tiles.reduce((sum, t) => sum + t.width, 0) + gap * (row.tiles.length - 1);

describe("justifyRows", () => {
  it("returns no rows for an unmeasured container or no items", () => {
    expect(justifyRows([square("a")], 0, 200, 8)).toEqual([]);
    expect(justifyRows([], 1000, 200, 8)).toEqual([]);
  });

  it("fills every full row to the container width, gaps included", () => {
    const items = [
      landscape("a"), portrait("b"), square("c"), landscape("d"),
      square("e"), portrait("f"), landscape("g"), landscape("h"),
    ];
    const rows = justifyRows(items, 1000, 200, 8);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows.slice(0, -1)) {
      expect(rowWidth(row, 8)).toBeCloseTo(1000, 5);
      // Every tile in a row shares the row's height.
      for (const t of row.tiles) expect(t.height).toBeCloseTo(row.height, 5);
    }
  });

  it("keeps each item's aspect ratio after scaling", () => {
    const rows = justifyRows([landscape("a"), portrait("b"), square("c")], 1000, 200, 8);
    for (const row of rows) {
      for (const t of row.tiles) {
        expect(t.width / t.height).toBeCloseTo(galleryItemRatio(t.item), 5);
      }
    }
  });

  it("preserves item order and indexes", () => {
    const items = [square("a"), square("b"), square("c"), square("d"), square("e")];
    const rows = justifyRows(items, 700, 200, 10);
    const ids = rows.flatMap((r) => r.tiles.map((t) => t.item.id));
    const indexes = rows.flatMap((r) => r.tiles.map((t) => t.index));
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
    expect(indexes).toEqual([0, 1, 2, 3, 4]);
  });

  it("falls back to 4:3 when an item has no dimensions", () => {
    expect(galleryItemRatio({ id: "x", src: "/x.jpg" })).toBe(DEFAULT_GALLERY_RATIO);
    expect(galleryItemRatio({ id: "x", src: "/x.jpg", width: 0, height: 10 })).toBe(DEFAULT_GALLERY_RATIO);
    const [row] = justifyRows([{ id: "x", src: "/x.jpg" }], 2000, 300, 0);
    expect(row!.tiles[0]!.width / row!.tiles[0]!.height).toBeCloseTo(4 / 3, 5);
  });

  it("does not scale a short last row above the target height", () => {
    const [row] = justifyRows([square("only")], 2000, 200, 8);
    expect(row!.height).toBe(200);
    expect(row!.tiles[0]!.width).toBe(200);
  });

  it("gives a wider container a shorter row for the same items (scaling down to fit)", () => {
    const items = [landscape("a"), landscape("b"), landscape("c")];
    const narrow = justifyRows(items, 900, 200, 0);
    // 3 x 355.6px at 200 tall = 1066px > 900, so the row closes with all
    // three and shrinks below 200 to fit.
    expect(narrow[0]!.tiles).toHaveLength(3);
    expect(narrow[0]!.height).toBeLessThan(200);
    expect(rowWidth(narrow[0]!, 0)).toBeCloseTo(900, 5);
  });
});

describe("GalleryGrid", () => {
  const items = [landscape("a"), portrait("b"), square("c")];

  it("renders plain tiles (no buttons) without onItemClick", () => {
    render(<GalleryGrid items={items} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll('[data-slot="gallery-tile"]')).toHaveLength(3);
    expect(document.querySelectorAll("img")).toHaveLength(3);
  });

  it("makes each tile a named button when onItemClick is set", () => {
    const onItemClick = vi.fn();
    render(
      <GalleryGrid
        items={[{ ...items[0]!, alt: "Sunrise" }, items[1]!, { ...items[2]!, caption: "Lunch" }]}
        onItemClick={onItemClick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sunrise" }));
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), 0);
    // No alt: falls back to the caption, then to a positional name.
    expect(screen.getByRole("button", { name: "Image 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lunch" })).toBeTruthy();
  });

  it("lets renderItem replace the img but keeps the tile click", () => {
    const onItemClick = vi.fn();
    render(
      <GalleryGrid
        items={items}
        onItemClick={onItemClick}
        renderItem={(item) => <span data-testid={`custom-${item.id}`}>{item.id}</span>}
      />,
    );
    expect(document.querySelectorAll("img")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("custom-b"));
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }), 1);
  });

  it("renders an equal-column CSS grid for layout='grid'", () => {
    render(<GalleryGrid items={items} layout="grid" columns={2} gap={12} />);
    const grid = document.querySelector('[data-slot="gallery-grid"]') as HTMLElement;
    expect(grid.getAttribute("data-layout")).toBe("grid");
    const body = document.querySelector('[data-slot="gallery-group-body"]') as HTMLElement;
    expect(body.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(body.style.gap).toBe("12px");
  });

  it("lays out justified rows even where ResizeObserver cannot measure", () => {
    render(<GalleryGrid items={items} rowHeight={180} />);
    const grid = document.querySelector('[data-slot="gallery-grid"]') as HTMLElement;
    expect(grid.getAttribute("data-layout")).toBe("justified");
    expect(document.querySelectorAll('[data-slot="gallery-tile"]')).toHaveLength(3);
  });
});

describe("GalleryGrid — badges, selection, groups, placeholders", () => {
  const items = [landscape("a"), portrait("b"), square("c"), landscape("d")];

  it("overlays renderBadges top-left of the default tile", () => {
    render(<GalleryGrid items={items} renderBadges={(item) => <span>{item.id.toUpperCase()}</span>} />);
    const badges = document.querySelectorAll('[data-slot="gallery-tile-badges"]');
    expect(badges).toHaveLength(4);
    expect(badges[0]!.textContent).toBe("A");
    expect(badges[0]!.className).toContain("left-2");
    expect(badges[0]!.className).toContain("top-2");
    expect(document.querySelectorAll("img")).toHaveLength(4);
  });

  it("does not render badges when renderItem takes over the tile", () => {
    render(<GalleryGrid items={items} renderItem={() => <i />} renderBadges={() => <span>x</span>} />);
    expect(document.querySelector('[data-slot="gallery-tile-badges"]')).toBeNull();
  });

  it("toggles an id on click and reports the whole selection", () => {
    const onSelectionChange = vi.fn();
    render(<GalleryGrid items={items} selected={["a"]} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Image 2" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      ["a", "b"],
      expect.objectContaining({ index: 1, item: expect.objectContaining({ id: "b" }) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Image 1" }));
    expect(onSelectionChange.mock.calls[1]![0]).toEqual([]);
  });

  it("selects the range from the last toggled tile on shift-click", () => {
    const onSelectionChange = vi.fn();
    render(<GalleryGrid items={items} selected={[]} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Image 4" }), { shiftKey: true });
    expect(onSelectionChange.mock.calls[1]![0]).toEqual(["a", "b", "c", "d"]);
  });

  it("marks selected tiles with aria-pressed and a ring", () => {
    render(<GalleryGrid items={items} selected={["c"]} onSelectionChange={() => {}} />);
    const c = screen.getByRole("button", { name: "Image 3", pressed: true });
    expect(c.className).toContain("ring-2");
    expect(c.className).toContain("ring-ring");
    const a = screen.getByRole("button", { name: "Image 1" });
    expect(a.getAttribute("aria-pressed")).toBe("false");
    expect(a.className).not.toContain("ring-2 ring-ring");
  });

  it("gives selection the click; onItemClick is not called while selecting", () => {
    const onItemClick = vi.fn();
    const onSelectionChange = vi.fn();
    render(<GalleryGrid items={items} onItemClick={onItemClick} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Image 1" }));
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it("groups items by groupBy in order of first appearance, under sticky headers", () => {
    const dated = [
      { ...landscape("a"), caption: "June" },
      { ...square("b"), caption: "May" },
      { ...portrait("c"), caption: "June" },
    ];
    render(<GalleryGrid items={dated} groupBy={(item) => item.caption!} onItemClick={() => {}} />);
    const headers = Array.from(document.querySelectorAll('[data-slot="gallery-group-header"]'));
    expect(headers.map((h) => h.textContent)).toEqual(["June", "May"]);
    expect(headers[0]!.className).toContain("sticky");
    expect(headers[0]!.className).toContain("text-muted-foreground");
    const groups = document.querySelectorAll('[data-slot="gallery-group"]');
    expect(groups[0]!.querySelectorAll('[data-slot="gallery-tile"]')).toHaveLength(2);
    expect(groups[1]!.querySelectorAll('[data-slot="gallery-tile"]')).toHaveLength(1);
  });

  it("keeps the consumer's item index inside groups", () => {
    const onItemClick = vi.fn();
    const dated = [
      { ...landscape("a"), caption: "June" },
      { ...square("b"), caption: "May" },
      { ...portrait("c"), caption: "June" },
    ];
    render(<GalleryGrid items={dated} groupBy={(item) => item.caption!} onItemClick={onItemClick} />);
    // "c" is the second tile of the first group ("June") but index 2 overall.
    fireEvent.click(screen.getAllByRole("button", { name: "June" })[1]!);
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }), 2);
  });

  it("lazy-loads default tiles into a bg-muted box sized from the item's ratio", () => {
    render(<GalleryGrid items={[landscape("a"), { id: "x", src: "/x.jpg" }]} layout="grid" />);
    const media = document.querySelectorAll('[data-slot="gallery-tile-media"]') as NodeListOf<HTMLElement>;
    expect(media[0]!.className).toContain("bg-muted");
    expect(parseFloat(media[0]!.style.aspectRatio)).toBeCloseTo(16 / 9, 5);
    expect(parseFloat(media[1]!.style.aspectRatio)).toBeCloseTo(4 / 3, 5);
    for (const img of Array.from(document.querySelectorAll("img"))) {
      expect(img.getAttribute("loading")).toBe("lazy");
    }
  });
});

describe("GalleryGrid — parity with native", () => {
  it("draws square grid tiles by default, each item's own shape with aspectRatio=\"item\", or a given ratio", () => {
    const tiles = () => Array.from(document.querySelectorAll('[data-slot="gallery-tile"]')) as HTMLElement[];
    // "16 / 9" or "1.77…": the DOM normalizes it either way.
    const ratio = (el: HTMLElement) => { const [w, h = "1"] = el.style.aspectRatio.split("/"); return parseFloat(w!) / parseFloat(h); };
    const { rerender } = render(<GalleryGrid items={[landscape("a")]} layout="grid" />);
    expect(ratio(tiles()[0]!)).toBe(1);
    rerender(<GalleryGrid items={[landscape("a")]} layout="grid" aspectRatio="item" />);
    expect(ratio(tiles()[0]!)).toBeCloseTo(16 / 9, 5);
    rerender(<GalleryGrid items={[landscape("a")]} layout="grid" aspectRatio={2} />);
    expect(ratio(tiles()[0]!)).toBe(2);
  });

  it("uses the shared defaults, and lets off-screen justified rows skip layout", () => {
    expect(GALLERY_DEFAULTS).toEqual({ rowHeight: 180, gap: 4, columns: 3 });
    render(<GalleryGrid items={[landscape("a"), landscape("b")]} />);
    const body = document.querySelector('[data-slot="gallery-group-body"]') as HTMLElement;
    expect(body.style.gap).toBe("4px");
    const row = body.firstElementChild as HTMLElement;
    expect(row.style.getPropertyValue("content-visibility")).toBe("auto");
  });
});

describe("GalleryGrid — an item with no image", () => {
  it("draws a neutral 4:3 tile with its alt and caption, still named and clickable", () => {
    const onItemClick = vi.fn();
    render(<GalleryGrid items={[{ id: "n", src: "", alt: "Untitled", caption: "No photo yet" }]} onItemClick={onItemClick} />);
    const tile = screen.getByRole("button", { name: "Untitled" });
    expect(tile.querySelector("img")).toBeNull();
    const placeholder = tile.querySelector('[data-slot="gallery-tile-placeholder"]')!;
    expect(placeholder.getAttribute("aria-hidden")).toBe("true");
    expect(placeholder.textContent).toBe("UntitledNo photo yet");
    expect((tile.querySelector('[data-slot="gallery-tile-media"]') as HTMLElement).style.aspectRatio).toMatch(/^1\.333/);
    fireEvent.click(tile);
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ id: "n" }), 0);
  });
});

describe("GalleryGrid — loadMore", () => {
  type Callback = (entries: { isIntersecting: boolean }[]) => void;
  let callbacks: Callback[] = [];
  const original = globalThis.IntersectionObserver;

  const install = () => {
    callbacks = [];
    class FakeIO {
      constructor(private cb: Callback) {
        callbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  };

  afterEach(() => {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = original;
  });

  const fire = () => act(() => callbacks.forEach((cb) => cb([{ isIntersecting: true }])));

  it("calls loadMore once when the sentinel appears, and re-arms when items grow", () => {
    install();
    const loadMore = vi.fn();
    const first = [square("a"), square("b")];
    const { rerender } = render(<GalleryGrid items={first} loadMore={loadMore} />);
    expect(document.querySelector('[data-slot="gallery-sentinel"]')).not.toBeNull();

    fire();
    fire();
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender(<GalleryGrid items={[...first, square("c")]} loadMore={loadMore} />);
    fire();
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it("still takes the deprecated onNearEnd and getGroup", () => {
    const onNearEnd = vi.fn();
    const items = [square("a"), square("b")];
    install();
    render(<GalleryGrid items={items} onNearEnd={onNearEnd} getGroup={() => "All"} />);
    fire();
    expect(onNearEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByText("All")).toBeTruthy();
  });

  it("creates the observer when loadMore is set after first commit", () => {
    install();
    const loadMore = vi.fn();
    const items = [square("a")];
    const { rerender } = render(<GalleryGrid items={items} />);
    expect(callbacks.length).toBe(0);
    rerender(<GalleryGrid items={items} loadMore={loadMore} />);
    fire();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("renders without IntersectionObserver (jsdom guard)", () => {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined;
    const loadMore = vi.fn();
    render(<GalleryGrid items={[square("a")]} loadMore={loadMore} />);
    expect(loadMore).not.toHaveBeenCalled();
  });
});
