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
