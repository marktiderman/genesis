/**
 * One image in a gallery. Shared by `GalleryGrid`, `Lightbox` and the native
 * twins, so a consumer passes the same array to the grid and to the viewer it
 * opens.
 *
 * `width`/`height` are the image's intrinsic pixel size when known; the
 * justified layout uses their ratio to pack rows and falls back to 4:3 when
 * they are absent.
 *
 * @stability Beta
 */
export interface GalleryItem {
  id: string;
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  caption?: string;
}

/**
 * The gallery's defaults, the same on web and native: a target row height and the space between
 * tiles (px on web, points on native), and the columns of `layout="grid"`.
 *
 * @stability Beta
 */
export const GALLERY_DEFAULTS = { rowHeight: 180, gap: 4, columns: 3 } as const;

/**
 * A `layout="grid"` tile's shape: a ratio (width / height; 1 is square, the default), or `"item"`
 * for each item's own (its `width`/`height`, 4:3 when unknown).
 *
 * @stability Beta
 */
export type GalleryTileAspect = number | "item";
