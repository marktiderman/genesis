/** justifyRows: pure row packing for the justified gallery. */
import { describe, expect, it } from "vitest";
import { DEFAULT_GALLERY_RATIO, galleryItemRatio, justifyRows } from "../gallery-layout";
import type { GalleryItem } from "../gallery-types";

const item = (id: string, width?: number, height?: number): GalleryItem => ({ id, src: `https://example.test/${id}.jpg`, width, height });

describe("galleryItemRatio", () => {
  it("is width over height, and 4:3 without a usable size", () => {
    expect(galleryItemRatio(item("a", 200, 100))).toBe(2);
    expect(galleryItemRatio(item("b"))).toBe(DEFAULT_GALLERY_RATIO);
    expect(galleryItemRatio(item("c", 0, 100))).toBe(DEFAULT_GALLERY_RATIO);
    expect(galleryItemRatio(item("d", Number.NaN, 100))).toBe(DEFAULT_GALLERY_RATIO);
  });
});

describe("justifyRows", () => {
  it("yields no rows before the container is measured, or with no items", () => {
    expect(justifyRows([item("a")], 0, 160, 4)).toEqual([]);
    expect(justifyRows([], 300, 160, 4)).toEqual([]);
  });

  it("fills each full row to the container width, gaps included", () => {
    const items = Array.from({ length: 7 }, (_, i) => item(String(i), 400, 300));
    const rows = justifyRows(items, 600, 160, 4);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows.slice(0, -1)) {
      const width = row.tiles.reduce((sum, t) => sum + t.width, 0) + 4 * (row.tiles.length - 1);
      expect(width).toBeCloseTo(600, 5);
      for (const t of row.tiles) expect(t.height).toBeCloseTo(row.height, 5);
    }
  });

  it("keeps every item once, in order", () => {
    const items = [item("a", 100, 100), item("b", 300, 100), item("c"), item("d", 100, 300), item("e", 500, 100)];
    const rows = justifyRows(items, 400, 120, 2);
    const seen = rows.flatMap((r) => r.tiles.map((t) => t.index));
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  it("never scales the last row above the target height", () => {
    const rows = justifyRows([item("a", 400, 300)], 1000, 160, 4);
    expect(rows).toHaveLength(1);
    expect(rows[0].height).toBe(160);
    expect(rows[0].tiles[0].width).toBeCloseTo((4 / 3) * 160, 5);
  });

  it("is pure", () => {
    const items = [item("a", 400, 300), item("b", 300, 400), item("c")];
    expect(justifyRows(items, 500, 150, 3)).toEqual(justifyRows(items, 500, 150, 3));
  });
});
