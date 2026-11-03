/**
 * NativeGalleryGrid — photos in rows: justified (each row scaled to fill the
 * width, as in a photo library) or a fixed-column grid of squares.
 *
 * Rows come from the pure `justifyRows`, so the same items pack the same way
 * as the web `GalleryGrid`. The container width comes from `onLayout`; until
 * it is measured nothing is drawn. Tiles are `NativeImage` over a `bg-muted`
 * placeholder sized from the item's ratio (so rows don't reflow while the
 * picture loads), tappable when `onPressItem` is given (or when selecting); `renderItem`
 * replaces the tile's content and `renderBadges` overlays its top-left.
 *
 * Selection (`selected` + `onSelectionChange`) toggles an id per press, in
 * place of `onPressItem` (as on web), and rings the chosen tiles. `getGroup` lays each group out separately under a
 * header; `onNearEnd` fires once when the last row renders, for paging.
 *
 * @stability Beta
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { cn } from "../utils";
import { justifyRows } from "./gallery-layout";
import type { GalleryItem } from "./gallery-types";
import { NativeImage } from "./image";

export type NativeGalleryLayout = "justified" | "grid";

export interface NativeGalleryGridProps {
  items: GalleryItem[];
  /** Default "justified". */
  layout?: NativeGalleryLayout;
  /** Grid layout only: tiles per row. Default 3. */
  columns?: number;
  /** Justified layout only: target row height in points. Default 160. */
  rowHeight?: number;
  /** Points between tiles. Default 4. */
  gap?: number;
  /** Called on a press. Not called when `onSelectionChange` is set: a press then only toggles the selection. */
  onPressItem?: (item: GalleryItem, index: number) => void;
  /** Replaces the tile's content (the image by default). */
  renderItem?: (item: GalleryItem, index: number) => ReactNode;
  /** Overlaid top-left of the default tile. */
  renderBadges?: (item: GalleryItem, index: number) => ReactNode;
  /** Ids of the selected items. With `onSelectionChange`, a press toggles the tile. */
  selected?: string[];
  onSelectionChange?: (ids: string[], detail: { item: GalleryItem; index: number }) => void;
  /** Called once when the last row renders; armed again when the item count changes. */
  onNearEnd?: () => void;
  /** Groups items (in order of first appearance), each under a header reading the key. */
  getGroup?: (item: GalleryItem) => string;
  className?: string;
  testID?: string;
}

interface Group {
  key: string | null;
  entries: { item: GalleryItem; index: number }[];
}

function groupItems(items: GalleryItem[], getGroup?: (item: GalleryItem) => string): Group[] {
  if (!getGroup) return [{ key: null, entries: items.map((item, index) => ({ item, index })) }];
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  items.forEach((item, index) => {
    const key = getGroup(item);
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

export function NativeGalleryGrid({
  items,
  layout = "justified",
  columns = 3,
  rowHeight = 160,
  gap = 4,
  onPressItem,
  renderItem,
  renderBadges,
  selected,
  onSelectionChange,
  onNearEnd,
  getGroup,
  className,
  testID = "native-gallery-grid",
}: NativeGalleryGridProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const selecting = Boolean(onSelectionChange);
  const selectedIds = selected ?? [];
  const isSelected = (item: GalleryItem) => selectedIds.includes(item.id);

  // onNearEnd fires once per item count, after the rows (so the last one) have rendered.
  const measured = width > 0 && items.length > 0;
  const firedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!measured || !onNearEnd) return;
    if (firedFor.current === items.length) return;
    firedFor.current = items.length;
    onNearEnd();
  }, [measured, items.length, onNearEnd]);

  const press = (item: GalleryItem, index: number) => {
    if (onSelectionChange) {
      const next = isSelected(item) ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id];
      onSelectionChange(next, { item, index });
      return;
    }
    onPressItem?.(item, index);
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
    if (onPressItem || selecting) {
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

  const rowsFor = (entries: Group["entries"]): ReactNode => {
    if (layout === "grid") {
      const cols = Math.max(1, Math.floor(columns));
      const side = (width - gap * (cols - 1)) / cols;
      const rows: Group["entries"][] = [];
      entries.forEach((entry, i) => {
        if (i % cols === 0) rows.push([]);
        rows[rows.length - 1].push(entry);
      });
      return rows.map((row, r) => (
        <View key={r} className="flex-row" style={{ gap, marginTop: r === 0 ? 0 : gap }}>
          {row.map(({ item, index }) => tile(item, index, { width: side, height: side }))}
        </View>
      ));
    }
    const indexOf = new Map(entries.map((e) => [e.item.id, e.index]));
    return justifyRows(entries.map((e) => e.item), width, rowHeight, gap).map((row, r) => (
      <View key={r} className="flex-row" style={{ gap, marginTop: r === 0 ? 0 : gap }}>
        {row.tiles.map((t) => tile(t.item, indexOf.get(t.item.id) ?? t.index, { width: t.width, height: t.height }))}
      </View>
    ));
  };

  let body: ReactNode = null;
  if (width > 0) {
    body = groupItems(items, getGroup).map((group, g) => (
      <View key={group.key ?? g} testID={group.key === null ? undefined : `${testID}-group-${group.key}`} style={{ marginTop: g === 0 ? 0 : gap * 3 }}>
        {group.key !== null ? (
          <Text accessibilityRole="header" className="mb-2 text-sm font-medium text-muted-foreground">
            {group.key}
          </Text>
        ) : null}
        {rowsFor(group.entries)}
      </View>
    ));
  }

  return (
    <View testID={testID} onLayout={onLayout} className={cn("w-full", className)}>
      {body}
    </View>
  );
}
