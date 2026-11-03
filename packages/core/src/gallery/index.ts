/**
 * The gallery's data and layout, the same on every platform: one image's shape, the defaults, and
 * the justified-rows packing. genesis-ui's `GalleryGrid` and genesis-ui-native's
 * `NativeGalleryGrid` both lay out with `justifyRows` from here, as does ResourceView's
 * `mode="grid"` over a view's `gallery` block, so the same items pack into the same rows anywhere.
 *
 * Pure: no React, no DOM.
 *
 * @stability Beta
 */

/**
 * One image in a gallery. Shared by `GalleryGrid`, `Lightbox` and their native twins, so a
 * consumer passes the same array to the grid and to the viewer it opens.
 *
 * `width`/`height` are the image's intrinsic pixel size when known; the justified layout uses
 * their ratio to pack rows and falls back to 4:3 when they are absent.
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

/** Used when an item has no `width`/`height` (or a degenerate one). */
export const DEFAULT_GALLERY_RATIO = 4 / 3;

export interface JustifiedTile {
  item: GalleryItem;
  /** Index of `item` in the input array. */
  index: number;
  width: number;
  height: number;
}

export interface JustifiedRow {
  tiles: JustifiedTile[];
  /** The row's height after scaling to fill the container. */
  height: number;
}

/** Width ÷ height of an item, falling back to 4:3. */
export function galleryItemRatio(item: GalleryItem): number {
  const { width, height } = item;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }
  return DEFAULT_GALLERY_RATIO;
}

/**
 * Pack `items` into rows of a target `rowHeight`, then scale each row so its
 * tiles exactly fill `containerWidth` (minus `gap` between tiles). Pure: same
 * input, same rows.
 *
 * Greedy, as in the classic justified-gallery algorithm: tiles are added at
 * the target height until the row would overflow; the row is then closed at
 * whichever of "with" / "without" the overflowing tile is nearer the target
 * width, and scaled to fit. The last row is scaled too, but never above the
 * target height (a single landscape photo in the last row should not fill
 * the width as a banner); it is left-aligned at the target height instead.
 *
 * `containerWidth <= 0` (not measured yet) yields no rows, so callers render
 * nothing rather than divide by zero.
 */
export function justifyRows(
  items: readonly GalleryItem[],
  containerWidth: number,
  rowHeight: number,
  gap: number,
): JustifiedRow[] {
  if (!(containerWidth > 0) || !(rowHeight > 0) || items.length === 0) return [];
  const spacing = Math.max(0, gap);

  const rows: JustifiedRow[] = [];
  let pending: JustifiedTile[] = [];
  let pendingWidth = 0; // tile widths only, no gaps

  const rowWidthWithGaps = (tiles: JustifiedTile[], widthSum: number) =>
    widthSum + spacing * Math.max(0, tiles.length - 1);

  const close = (tiles: JustifiedTile[], widthSum: number, capAtTarget: boolean) => {
    if (tiles.length === 0) return;
    const available = containerWidth - spacing * (tiles.length - 1);
    let scale = available > 0 ? available / widthSum : 1;
    if (capAtTarget && scale > 1) scale = 1;
    rows.push({
      height: rowHeight * scale,
      tiles: tiles.map((t) => ({
        ...t,
        width: t.width * scale,
        height: t.height * scale,
      })),
    });
  };

  items.forEach((item, index) => {
    const tile: JustifiedTile = {
      item,
      index,
      width: galleryItemRatio(item) * rowHeight,
      height: rowHeight,
    };
    const withTile = [...pending, tile];
    const withTileWidth = rowWidthWithGaps(withTile, pendingWidth + tile.width);

    if (withTileWidth < containerWidth) {
      pending = withTile;
      pendingWidth += tile.width;
      return;
    }

    // Overflow. Close the row with or without this tile, whichever is closer
    // to the container width; a row must hold at least one tile.
    const withoutWidth = rowWidthWithGaps(pending, pendingWidth);
    const keep =
      pending.length === 0 ||
      Math.abs(withTileWidth - containerWidth) <= Math.abs(containerWidth - withoutWidth);

    if (keep) {
      close(withTile, pendingWidth + tile.width, false);
      pending = [];
      pendingWidth = 0;
    } else {
      close(pending, pendingWidth, false);
      pending = [tile];
      pendingWidth = tile.width;
    }
  });

  close(pending, pendingWidth, true);
  return rows;
}
