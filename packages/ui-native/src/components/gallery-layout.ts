/**
 * The justified gallery layout: pure row packing, the same algorithm as the
 * web `GalleryGrid`, so both render the same rows for the same items.
 *
 * @stability Beta
 */
import type { GalleryItem } from "./gallery-types";

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
