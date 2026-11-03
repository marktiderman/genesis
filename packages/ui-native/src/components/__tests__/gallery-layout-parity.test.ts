/** The native justified layout must match the web reference (G5). */
import { describe, expect, it } from "vitest";
import * as native from "../gallery-layout";
import type { GalleryItem } from "../gallery-types";

// The web file sits outside this package's rootDir, so Vite loads it (import.meta.glob) rather than tsc resolving it.
const webModules = (import.meta as unknown as { glob: (p: string, o: { eager: true }) => Record<string, typeof native> }).glob(
  "../../../../ui/src/components/patterns/gallery-layout.ts",
  { eager: true },
);
const web = Object.values(webModules)[0];

const item = (id: string, width?: number, height?: number): GalleryItem => ({ id, src: `https://example.test/${id}.jpg`, width, height });

const fixtures: GalleryItem[][] = [
  [],
  [item("a")],
  [item("a", 200, 100), item("b", 100, 200), item("c", 300, 300)],
  [item("a", 0, 100), item("b", Number.NaN, 100), item("c", 400, 300), item("d", 100, 400), item("e", 900, 300), item("f", 120, 90), item("g")],
  Array.from({ length: 25 }, (_, i) => item(`p${i}`, 100 + ((i * 37) % 300), 100 + ((i * 53) % 200))),
];

describe("gallery-layout parity with web", () => {
  it("has the same default ratio", () => {
    expect(native.DEFAULT_GALLERY_RATIO).toBe(web.DEFAULT_GALLERY_RATIO);
  });

  it("galleryItemRatio agrees on every item", () => {
    for (const items of fixtures) for (const it of items) expect(native.galleryItemRatio(it)).toEqual(web.galleryItemRatio(it));
  });

  it("justifyRows agrees across widths, row heights and gaps", () => {
    for (const items of fixtures)
      for (const [width, rowHeight, gap] of [[0, 160, 4], [320, 160, 4], [600, 100, 0], [1024, 220, 8], [375, 80, 2]] as const)
        expect(native.justifyRows(items, width, rowHeight, gap)).toEqual(web.justifyRows(items, width, rowHeight, gap));
  });
});
