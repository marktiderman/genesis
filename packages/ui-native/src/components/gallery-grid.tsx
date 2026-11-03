/**
 * NativeGalleryGrid — photos in rows: justified (each row scaled to fill the
 * width, as in a photo library) or a fixed-column grid (square tiles by
 * default, or each item's own shape with `aspectRatio="item"`).
 *
 * Rows come from the pure `justifyRows`, so the same items pack the same way
 * as the web `GalleryGrid`, with the same defaults (`GALLERY_DEFAULTS`) and
 * the same props, `onItemPress` in place of the web's `onItemClick` (as
 * `NativeResourcePage` pairs with `ResourcePage`). The container width comes
 * from `onLayout`; until it is measured nothing is drawn. The rows are a
 * virtualized `FlatList` (the grid scrolls itself; `header` and `footer` go
 * above and below), so a long gallery mounts only what's near the screen and
 * `loadMore` fires when scrolling nears the end, for "load more". Don't put
 * it inside a ScrollView: it fills its parent (`flex-1`), and nested it would
 * draw every row and fire `loadMore` at once. Put what goes above or below
 * it in `header` and `footer`. Tiles are
 * `NativeImage` over a `bg-muted` placeholder sized from the item's ratio (so
 * rows don't reflow while the picture loads), tappable when `onItemPress` is
 * given (or when selecting); `renderItem` replaces the tile's content and
 * `renderBadges` overlays its top-left.
 *
 * Selection (`selected` + `onSelectionChange`) toggles an id per press, in
 * place of `onItemPress` (as on web), and rings the chosen tiles. `groupBy`
 * lays each group out separately under a header.
 *
 * @stability Beta
 */
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { cn } from "../utils";
import { galleryItemRatio, justifyRows } from "./gallery-layout";
import { GALLERY_DEFAULTS, type GalleryItem, type GalleryTileAspect } from "./gallery-types";
import { NativeImage } from "./image";

export type NativeGalleryLayout = "justified" | "grid";

export interface NativeGalleryGridProps {
  items: GalleryItem[];
  /** Default "justified". */
  layout?: NativeGalleryLayout;
  /** Grid layout only: tiles per row. Default 3. */
  columns?: number;
  /** Grid layout only: each tile's shape, a ratio or `"item"` for the item's own. Default 1 (square), as on web. */
  aspectRatio?: GalleryTileAspect;
  /** Justified layout only: target row height in points. Default 180. */
  rowHeight?: number;
  /** Points between tiles. Default 4. */
  gap?: number;
  /** Called on a press. Not called when `onSelectionChange` is set: a press then only toggles the selection. */
  onItemPress?: (item: GalleryItem, index: number) => void;
  /** Replaces the tile's content (the image by default). */
  renderItem?: (item: GalleryItem, index: number) => ReactNode;
  /** Overlaid top-left of the default tile. */
  renderBadges?: (item: GalleryItem, index: number) => ReactNode;
  /** Ids of the selected items. With `onSelectionChange`, a press toggles the tile. */
  selected?: string[];
  onSelectionChange?: (ids: string[], detail: { item: GalleryItem; index: number }) => void;
  /** Called when scrolling nears the last rows (FlatList's `onEndReached`): the hook for "load more" (NativeResourceView's name). */
  loadMore?: () => void;
  /** @deprecated Use `loadMore`. */
  onNearEnd?: () => void;
  /** Above the first row, scrolling with it. */
  header?: ReactNode;
  /** Below the last row (a "Loading more" spinner). */
  footer?: ReactNode;
  /** Groups items (in order of first appearance), each under a header reading the key (a view's `groupBy`, for an array). */
  groupBy?: (item: GalleryItem) => string;
  /** @deprecated Use `groupBy`. */
  getGroup?: (item: GalleryItem) => string;
  className?: string;
  testID?: string;
}

interface Group {
  key: string | null;
  entries: { item: GalleryItem; index: number }[];
}

function groupItems(items: GalleryItem[], groupBy?: (item: GalleryItem) => string): Group[] {
  if (!groupBy) return [{ key: null, entries: items.map((item, index) => ({ item, index })) }];
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
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

/** One line of the list: a group's header, or a row of tiles with their sizes. */
type Line =
  | { kind: "header"; key: string; group: string }
  | { kind: "row"; key: string; group: string | null; first: boolean; tiles: { item: GalleryItem; index: number; width: number; height: number }[] };

export function NativeGalleryGrid({
  items,
  layout = "justified",
  columns = GALLERY_DEFAULTS.columns,
  aspectRatio = 1,
  rowHeight = GALLERY_DEFAULTS.rowHeight,
  gap = GALLERY_DEFAULTS.gap,
  onItemPress,
  renderItem,
  renderBadges,
  selected,
  onSelectionChange,
  loadMore: loadMoreProp,
  onNearEnd,
  header,
  footer,
  groupBy: groupByProp,
  getGroup,
  className,
  testID = "native-gallery-grid",
}: NativeGalleryGridProps) {
  const loadMore = loadMoreProp ?? onNearEnd;
  const groupBy = groupByProp ?? getGroup;
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const selecting = Boolean(onSelectionChange);
  const selectedIds = selected ?? [];
  const isSelected = (item: GalleryItem) => selectedIds.includes(item.id);

  const lines = useMemo<Line[]>(() => {
    if (width <= 0) return [];
    const out: Line[] = [];
    groupItems(items, groupBy).forEach((group) => {
      if (group.key !== null) out.push({ kind: "header", key: `h:${group.key}`, group: group.key });
      const rows: Line[] = [];
      if (layout === "grid") {
        const cols = Math.max(1, Math.floor(columns));
        const side = (width - gap * (cols - 1)) / cols;
        for (let i = 0; i < group.entries.length; i += cols) {
          const slice = group.entries.slice(i, i + cols);
          // A row is as tall as its tallest tile ("item" shapes differ); squares by default.
          const heights = slice.map(({ item }) => side / (aspectRatio === "item" ? galleryItemRatio(item) : aspectRatio));
          rows.push({
            kind: "row",
            key: `r:${group.key ?? ""}:${i}`,
            group: group.key,
            first: i === 0,
            tiles: slice.map(({ item, index }, n) => ({ item, index, width: side, height: heights[n]! })),
          });
        }
      } else {
        justifyRows(group.entries.map((e) => e.item), width, rowHeight, gap).forEach((row, r) => {
          rows.push({
            kind: "row",
            key: `r:${group.key ?? ""}:${r}`,
            group: group.key,
            first: r === 0,
            tiles: row.tiles.map((t) => ({ item: t.item, index: group.entries[t.index]!.index, width: t.width, height: t.height })),
          });
        });
      }
      out.push(...rows);
    });
    return out;
  }, [width, items, groupBy, layout, columns, aspectRatio, rowHeight, gap]);

  const press = (item: GalleryItem, index: number) => {
    if (onSelectionChange) {
      const next = isSelected(item) ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id];
      onSelectionChange(next, { item, index });
      return;
    }
    onItemPress?.(item, index);
  };

  const tile = (item: GalleryItem, index: number, size: { width: number; height: number }) => {
    const chosen = isSelected(item);
    const content = renderItem ? (
      renderItem(item, index)
    ) : (
      <>
        <View className="absolute inset-0 bg-muted" />
        <NativeImage src={item.src} alt={item.alt} className="h-full w-full" />
        {renderBadges ? (
          <View testID={`${testID}-badges-${item.id}`} pointerEvents="box-none" className="absolute left-1 top-1 flex-row items-center gap-1">
            {renderBadges(item, index)}
          </View>
        ) : null}
      </>
    );
    const tileID = `${testID}-item-${item.id}`;
    const tileClass = cn("overflow-hidden rounded-md bg-muted", chosen && "border-2 border-ring");
    if (onItemPress || selecting) {
      return (
        <Pressable
          key={item.id}
          testID={tileID}
          accessibilityRole="button"
          accessibilityLabel={item.alt ?? item.caption ?? `Photo ${index + 1} of ${items.length}`}
          accessibilityState={selecting ? { selected: chosen } : undefined}
          onPress={() => press(item, index)}
          className={tileClass}
          style={size}
        >
          {content}
        </Pressable>
      );
    }
    return (
      <View key={item.id} testID={tileID} className={tileClass} style={size}>
        {content}
      </View>
    );
  };

  const renderLine = ({ item: line, index: n }: { item: Line; index: number }) => {
    if (line.kind === "header") {
      return (
        <Text accessibilityRole="header" testID={`${testID}-group-${line.group}`} className="mb-2 text-sm font-medium text-muted-foreground" style={{ marginTop: n === 0 ? 0 : gap * 3 }}>
          {line.group}
        </Text>
      );
    }
    return (
      <View
        className="flex-row"
        testID={line.group === null ? undefined : `${testID}-row-${line.group}`}
        style={{ gap, marginTop: line.first ? 0 : gap }}
      >
        {line.tiles.map((t) => tile(t.item, t.index, { width: t.width, height: t.height }))}
      </View>
    );
  };

  return (
    <View testID={testID} onLayout={onLayout} className={cn("w-full flex-1", className)}>
      {width > 0 ? (
        <FlatList
          testID={`${testID}-list`}
          data={lines}
          keyExtractor={(line) => line.key}
          renderItem={renderLine}
          ListHeaderComponent={header ? <>{header}</> : undefined}
          ListFooterComponent={footer ? <>{footer}</> : undefined}
          onEndReached={loadMore ? () => loadMore() : undefined}
          onEndReachedThreshold={0.5}
          initialNumToRender={8}
          windowSize={7}
        />
      ) : null}
    </View>
  );
}
