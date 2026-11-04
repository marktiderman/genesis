"use client";

import * as React from "react";
import { cn } from "../../utils";
import { GALLERY_DEFAULTS, type GalleryItem, type GalleryTileAspect } from "./gallery-types";
import { galleryItemRatio, justifyRows } from "./gallery-layout";

export interface GallerySelectionDetail {
  item: GalleryItem;
  index: number;
  event: React.MouseEvent;
}

export interface GalleryGridProps {
  items: GalleryItem[];
  /**
   * `justified` (default): rows of a target height, each scaled to fill the
   * width, Flickr-style. `grid`: a fixed number of equal columns.
   */
  layout?: "justified" | "grid";
  /** Column count for `layout="grid"`. Default 3. */
  columns?: number;
  /** `layout="grid"` only: each tile's shape, a ratio or `"item"` for the item's own. Default 1 (square), as on native. */
  aspectRatio?: GalleryTileAspect;
  /** Target row height in px for `layout="justified"`. Default 180. */
  rowHeight?: number;
  /** Space between tiles in px. Default 4. */
  gap?: number;
  /** Makes every tile a button and reports which was activated. */
  onItemClick?: (item: GalleryItem, index: number) => void;
  /** Replaces the default `<img>` tile. The wrapper still sizes and clicks. */
  renderItem?: (item: GalleryItem, index: number) => React.ReactNode;
  /** Overlaid top-left of the default tile (ignored when `renderItem` takes over). */
  renderBadges?: (item: GalleryItem, index: number) => React.ReactNode;
  /** Ids of the selected items. Selection is on when `onSelectionChange` is given. */
  selected?: string[];
  /**
   * Turns tile clicks into selection: a click toggles the item, shift-click
   * selects the range from the last toggled tile. Called with the whole new
   * selection and the tile that caused it. While set, `onItemClick` is not
   * called for clicks (open the item from an action instead).
   */
  onSelectionChange?: (ids: string[], detail: GallerySelectionDetail) => void;
  /**
   * Called once when the sentinel after the last row scrolls into view, and
   * armed again whenever `items.length` changes — the hook for "load more"
   * (the same name as ResourceView's).
   */
  loadMore?: () => void;
  /** @deprecated Use `loadMore`. */
  onNearEnd?: () => void;
  /**
   * Groups items by the returned key, in order of first appearance; each
   * group is laid out on its own under a sticky header showing the key (a
   * view's `groupBy`, for an array).
   */
  groupBy?: (item: GalleryItem) => string;
  /** @deprecated Use `groupBy`. */
  getGroup?: (item: GalleryItem) => string;
  className?: string;
}

/**
 * Width of an element, kept current with a ResizeObserver. Returns 0 until
 * measured, and stays 0 where ResizeObserver does not exist (jsdom,
 * happy-dom), in which case `fallback` is used so tests and SSR still lay
 * out something.
 */
function useContainerWidth(ref: React.RefObject<HTMLElement | null>, fallback: number) {
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width > 0 ? width : fallback;
}

/**
 * Fires `loadMore` once when `ref` enters the viewport; re-armed when
 * `resetKey` (the item count) changes. No-op without IntersectionObserver.
 */
function useNearEnd(
  ref: React.RefObject<HTMLElement | null>,
  loadMore: (() => void) | undefined,
  resetKey: number,
) {
  const fired = React.useRef(false);
  const callback = React.useRef(loadMore);
  React.useEffect(() => {
    callback.current = loadMore;
  });
  const hasCallback = Boolean(loadMore);

  React.useEffect(() => {
    fired.current = false;
    const node = ref.current;
    if (!node || !hasCallback || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (fired.current) return;
      if (entries.some((entry) => entry.isIntersecting)) {
        fired.current = true;
        callback.current?.();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, resetKey, hasCallback]);
}

interface Group {
  key: string | null;
  entries: { item: GalleryItem; index: number }[];
}

function groupItems(items: GalleryItem[], groupBy?: (item: GalleryItem) => string): Group[] {
  if (!groupBy) return [{ key: null, entries: items.map((item, index) => ({ item, index })) }];
  const byKey = new Map<string, Group>();
  const groups: Group[] = [];
  items.forEach((item, index) => {
    const key = groupBy(item);
    let group = byKey.get(key);
    if (!group) {
      group = { key, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push({ item, index });
  });
  return groups;
}

/**
 * GalleryGrid — a wall of images, justified (rows that fill the width, as
 * `justifyRows` packs them) or a plain equal-column grid, optionally grouped
 * under sticky headers.
 *
 * Tiles are plain `<div>`s until `onItemClick` or `onSelectionChange` is
 * given; then each becomes a `<button>` named by the item's `alt` (or
 * caption, or "Image N"), so the gallery is keyboard- and screen-reader-
 * navigable without a wrapper per tile. A selected tile shows a ring and
 * `aria-pressed`. `renderItem` swaps the `<img>` for anything while keeping
 * the layout and the click; `renderBadges` overlays the default tile.
 *
 * Default tiles lazy-load into a `bg-muted` box already sized from the
 * item's `width`/`height` (4:3 when unknown), so rows do not reflow as
 * images arrive.
 *
 * @stability Beta
 */
export function GalleryGrid({
  items,
  layout = "justified",
  columns = GALLERY_DEFAULTS.columns,
  aspectRatio = 1,
  rowHeight = GALLERY_DEFAULTS.rowHeight,
  gap = GALLERY_DEFAULTS.gap,
  onItemClick,
  renderItem,
  renderBadges,
  selected,
  onSelectionChange,
  loadMore: loadMoreProp,
  onNearEnd,
  groupBy: groupByProp,
  getGroup,
  className,
}: GalleryGridProps) {
  const loadMore = loadMoreProp ?? onNearEnd;
  const groupBy = groupByProp ?? getGroup;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const lastToggled = React.useRef<number | null>(null);
  // Unmeasured (first paint, SSR, test DOM): pretend to be a modest desktop
  // width so the justified rows still have a shape.
  const width = useContainerWidth(containerRef, 960);
  useNearEnd(sentinelRef, loadMore, items.length);

  const selecting = Boolean(onSelectionChange);
  const selectedSet = React.useMemo(() => new Set(selected ?? []), [selected]);
  const interactive = selecting || Boolean(onItemClick);

  const handleClick = (item: GalleryItem, index: number, event: React.MouseEvent) => {
    if (onSelectionChange) {
      const next = new Set(selectedSet);
      const anchor = lastToggled.current;
      if (event.shiftKey && anchor !== null && anchor !== index) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (let i = from; i <= to; i += 1) {
          const inRange = items[i];
          if (inRange) next.add(inRange.id);
        }
      } else if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      lastToggled.current = index;
      onSelectionChange(Array.from(next), { item, index, event });
      return;
    }
    onItemClick?.(item, index);
  };

  const tile = (item: GalleryItem, index: number, style: React.CSSProperties) => {
    const isSelected = selecting && selectedSet.has(item.id);
    const content = renderItem ? (
      renderItem(item, index)
    ) : (
      <div
        data-slot="gallery-tile-media"
        className="relative size-full bg-muted"
        style={{ aspectRatio: String(galleryItemRatio(item)) }}
      >
        {item.src ? (
          <img
            src={item.src}
            alt={item.alt ?? ""}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          // No image: a neutral tile with its words, so the count matches what's drawn. A
          // clickable tile's button carries the name (alt, then caption), so the words are hidden
          // from readers; a plain tile has no button, so the placeholder is the named image.
          <span
            data-slot="gallery-tile-placeholder"
            {...(interactive
              ? { "aria-hidden": true }
              : { role: "img", "aria-label": item.alt ?? item.caption ?? `Image ${index + 1}` })}
            className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-3 text-center text-sm text-muted-foreground"
          >
            {item.alt ? <span className="line-clamp-2 font-medium text-foreground">{item.alt}</span> : null}
            {item.caption ? <span className="line-clamp-2 text-xs">{item.caption}</span> : null}
          </span>
        )}
        {renderBadges ? (
          <div
            data-slot="gallery-tile-badges"
            className="absolute left-2 top-2 flex flex-wrap items-center gap-1.5"
          >
            {renderBadges(item, index)}
          </div>
        ) : null}
      </div>
    );
    const tileClass = cn(
      "relative block overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      isSelected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
    );

    if (interactive) {
      return (
        <button
          key={item.id}
          type="button"
          data-slot="gallery-tile"
          data-selected={isSelected || undefined}
          aria-label={item.alt ?? item.caption ?? `Image ${index + 1}`}
          aria-pressed={selecting ? isSelected : undefined}
          style={style}
          className={cn(tileClass, "cursor-pointer p-0 text-left")}
          onClick={(event) => handleClick(item, index, event)}
        >
          {content}
        </button>
      );
    }
    return (
      <div key={item.id} data-slot="gallery-tile" style={style} className={tileClass}>
        {content}
      </div>
    );
  };

  const renderGroupBody = (entries: Group["entries"]) => {
    if (layout === "grid") {
      const cols = Math.max(1, Math.floor(columns));
      return (
        <div
          data-slot="gallery-group-body"
          data-layout="grid"
          className="grid"
          style={{ gap, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {entries.map(({ item, index }) =>
            tile(item, index, { aspectRatio: String(aspectRatio === "item" ? galleryItemRatio(item) : aspectRatio) }),
          )}
        </div>
      );
    }
    // justifyRows indexes within the array it is given; map back to the
    // position in `items` so clicks and ranges speak the consumer's indexes.
    const rows = justifyRows(
      entries.map((e) => e.item),
      width,
      rowHeight,
      gap,
    );
    return (
      <div
        data-slot="gallery-group-body"
        data-layout="justified"
        className="flex w-full flex-col"
        style={{ gap }}
      >
        {rows.map((row, r) => (
          // Off-screen rows skip layout and paint (content-visibility), so a long gallery stays
          // cheap without a virtualizer; the intrinsic size keeps the scrollbar honest.
          <div key={r} className="flex" style={{ gap, height: row.height, contentVisibility: "auto", containIntrinsicSize: `auto ${row.height}px` }}>
            {row.tiles.map((t) =>
              tile(t.item, entries[t.index]!.index, {
                width: t.width,
                height: t.height,
                flex: "0 0 auto",
              }),
            )}
          </div>
        ))}
      </div>
    );
  };

  const groups = groupItems(items, groupBy);

  return (
    <div
      ref={containerRef}
      data-slot="gallery-grid"
      data-layout={layout}
      className={cn("flex w-full flex-col", className)}
      style={{ gap: groupBy ? gap * 2 : gap }}
    >
      {groups.map((group) => (
        <section key={group.key ?? "__all"} data-slot="gallery-group" className="flex flex-col" style={{ gap }}>
          {group.key !== null ? (
            <h3
              data-slot="gallery-group-header"
              className="sticky top-0 z-10 bg-background py-1 text-sm font-medium text-muted-foreground"
            >
              {group.key}
            </h3>
          ) : null}
          {renderGroupBody(group.entries)}
        </section>
      ))}
      <div ref={sentinelRef} data-slot="gallery-sentinel" aria-hidden="true" className="h-px w-full" />
    </div>
  );
}
