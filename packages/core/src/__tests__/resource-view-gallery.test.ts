// @feat:media-gallery @feat:resource-view-gallery
/**
 * defineView's `gallery` block: a photo per row, laid out by justifyRows. Checked once, frozen,
 * plain field names; `view.galleryItem(row)` turns a row into the GalleryItem the grids take.
 */
import { describe, expect, it } from "vitest";

import { defineView, galleryProblems } from "../resource-view";
import type { ResourceContract } from "../schema/types";

type PhotoRow = { id: string; title: string; url: string | null; w: number | null; h: number | null; note: string | null; tags: string[] };

const photos = {
  name: "public.photos",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "url", type: "string", nullable: true },
    { name: "w", type: "number", nullable: true },
    { name: "h", type: "number", nullable: true },
    { name: "note", type: "string", nullable: true },
    { name: "tags", type: "string", array: true },
  ],
} as const satisfies ResourceContract;

const row = (over: Partial<PhotoRow> = {}): PhotoRow => ({ id: "p1", title: "Harbour", url: "https://example.test/p1.jpg", w: 1600, h: 900, note: "At dawn", tags: [], ...over });

describe("defineView gallery", () => {
  it("keeps the block, frozen", () => {
    const view = defineView(photos, { gallery: { image: "url", width: "w", height: "h", caption: "note", rowHeight: 220 } });
    expect(view.definition.gallery).toEqual({ image: "url", width: "w", height: "h", caption: "note", rowHeight: 220 });
    expect(Object.isFrozen(view.definition.gallery)).toBe(true);
  });

  it("names every mistake at once", () => {
    expect(() =>
      // @ts-expect-error -- not fields, an unknown key, and no image
      defineView(photos, { gallery: { width: "w", cover: "url", caption: "nope", rowHeight: 0 } }),
    ).toThrowError(/gallery\.cover isn't a gallery setting[\s\S]*gallery\.image is required[\s\S]*gallery\.caption names "nope"[\s\S]*width and gallery\.height go together[\s\S]*rowHeight is a height above 0/);
  });

  it("checks field types: the image is text, the size is numbers", () => {
    expect(galleryProblems(photos.fields, { image: "w" })).toEqual(['gallery.image "w" is a number, not a text field']);
    expect(galleryProblems(photos.fields, { image: "tags" })).toEqual(['gallery.image "tags" is a list, not a text field']);
    expect(galleryProblems(photos.fields, { image: "url", width: "title", height: "h" })).toEqual(['gallery.width "title" is a string, not a number field']);
  });
});

describe("view.galleryItem", () => {
  const view = defineView(photos, { gallery: { image: "url", width: "w", height: "h", caption: "note" } });

  it("makes a GalleryItem: the key as id, the label as alt, the size and the caption", () => {
    expect(view.galleryItem(row())).toEqual({ id: "p1", src: "https://example.test/p1.jpg", alt: "Harbour", width: 1600, height: 900, caption: "At dawn" });
  });

  it("keeps a row without an image, with an empty src (a placeholder tile); undefined without a block", () => {
    expect(view.galleryItem(row({ url: null }))).toMatchObject({ id: "p1", src: "", alt: "Harbour", caption: "At dawn" });
    expect(view.galleryItem(row({ url: "" }))).toMatchObject({ src: "" });
    expect(defineView(photos).galleryItem(row())).toBeUndefined();
  });

  it("leaves out a size it can't use, so the layout falls back to 4:3", () => {
    expect(view.galleryItem(row({ w: null }))).not.toHaveProperty("width");
    expect(view.galleryItem(row({ h: 0 }))).not.toHaveProperty("height");
  });

  it("takes a screen's override over the view's block", () => {
    expect(view.galleryItem(row(), { caption: "title", alt: "note" })).toMatchObject({ caption: "Harbour", alt: "At dawn" });
    expect(defineView(photos).galleryItem(row(), { image: "url" })).toEqual({ id: "p1", src: "https://example.test/p1.jpg", alt: "Harbour" });
  });
});
