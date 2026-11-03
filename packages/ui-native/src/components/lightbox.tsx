/**
 * NativeLightbox — a full-screen photo viewer: swipe between the items, a
 * close button, a "3 / 12" counter, the caption at the bottom and a slot for
 * actions (share, delete) at the top right. `title`/`description` sit in the
 * top bar; `renderMedia` swaps a page's picture for a video or a compare view.
 *
 * Built on `NativeFullScreenModal` (dark tone). The pictures are a horizontal
 * paging `FlatList`, one per screen width; a swipe reports `onIndexChange`
 * when the page settles, and a new `index` from outside scrolls to it. No
 * looping: the first and last page stop. Same props as the web `Lightbox`.
 *
 * @stability Beta
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../utils";
import { FULL_SCREEN_DARK, NativeFullScreenModal } from "./full-screen-modal";
import type { GalleryItem } from "./gallery-types";
import { NativeIcon } from "./icon";
import { NativeImage } from "./image";

export interface NativeLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: GalleryItem[];
  /** The item shown, 0-based. */
  index: number;
  onIndexChange: (index: number) => void;
  /** Replaces the default caption (the item's `caption`). */
  renderCaption?: (item: GalleryItem, index: number) => ReactNode;
  /** Top-right slot: icon buttons for the current item. */
  renderActions?: (item: GalleryItem, index: number) => ReactNode;
  /** Replaces the page's picture (a video player, a before/after view); fills the page. */
  renderMedia?: (item: GalleryItem, index: number) => ReactNode;
  /** In the top bar, and the viewer's accessibility label. */
  title?: string;
  /** Under the title in the top bar. */
  description?: ReactNode;
  testID?: string;
}

/** The chrome is white in both schemes: the viewer is black in both (`FULL_SCREEN_DARK`), so no theme role fits. */
const CHROME_TINT = "white";

export function NativeLightbox({
  open,
  onOpenChange,
  items,
  index,
  onIndexChange,
  renderCaption,
  renderActions,
  renderMedia,
  title,
  description,
  testID = "native-lightbox",
}: NativeLightboxProps) {
  const [width, setWidth] = useState(Dimensions.get("window").width);
  const listRef = useRef<FlatList<GalleryItem>>(null);
  const current = Math.min(Math.max(0, index), Math.max(0, items.length - 1));
  const item = items[current];

  // Re-snap on a width change (rotation, resize) so the page stays aligned; that jump is not animated.
  const snappedWidth = useRef(width);
  useEffect(() => {
    if (!open || items.length === 0) return;
    const widthChanged = snappedWidth.current !== width;
    snappedWidth.current = width;
    listRef.current?.scrollToIndex({ index: current, animated: !widthChanged });
  }, [open, current, items.length, width]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next > 0 && next !== width) setWidth(next);
  };
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    const clamped = Math.min(Math.max(0, page), items.length - 1);
    if (clamped !== current) onIndexChange(clamped);
  };

  return (
    <NativeFullScreenModal open={open} onOpenChange={onOpenChange} tone="dark" testID={testID}>
      <LightboxBody
        testID={testID}
        width={width}
        onLayout={onLayout}
        listRef={listRef}
        items={items}
        current={current}
        item={item}
        onMomentumEnd={onMomentumEnd}
        onClose={() => onOpenChange(false)}
        renderCaption={renderCaption}
        renderActions={renderActions}
        renderMedia={renderMedia}
        title={title}
        description={description}
      />
    </NativeFullScreenModal>
  );
}

interface LightboxBodyProps {
  testID: string;
  width: number;
  onLayout: (e: LayoutChangeEvent) => void;
  listRef: React.RefObject<FlatList<GalleryItem> | null>;
  items: GalleryItem[];
  current: number;
  item: GalleryItem | undefined;
  onMomentumEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onClose: () => void;
  renderCaption?: (item: GalleryItem, index: number) => ReactNode;
  renderActions?: (item: GalleryItem, index: number) => ReactNode;
  renderMedia?: (item: GalleryItem, index: number) => ReactNode;
  title?: string;
  description?: ReactNode;
}

/** Inside the modal, so `useSafeAreaInsets` reads the modal's own safe area. */
function LightboxBody({ testID, width, onLayout, listRef, items, current, item, onMomentumEnd, onClose, renderCaption, renderActions, renderMedia, title, description }: LightboxBodyProps) {
  const insets = useSafeAreaInsets();
  const caption = item ? (renderCaption ? renderCaption(item, current) : item.caption) : null;
  return (
    <View testID={`${testID}-content`} accessibilityLabel={title} onLayout={onLayout} style={{ flex: 1, backgroundColor: FULL_SCREEN_DARK }}>
      <FlatList
        ref={listRef}
        testID={`${testID}-pager`}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(it) => it.id}
        initialScrollIndex={current}
        getItemLayout={(_data, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item: it, index: i }) => (
          <View testID={`${testID}-page-${it.id}`} style={{ width, flex: 1 }} className="items-center justify-center">
            {renderMedia ? (
              renderMedia(it, i)
            ) : (
              <NativeImage src={it.src} alt={it.alt ?? `Photo ${i + 1} of ${items.length}`} className="h-full w-full" contentFit="contain" />
            )}
          </View>
        )}
        style={{ flex: 1 }}
      />
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          testID={`${testID}-close`}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full bg-background/20"
        >
          <NativeIcon name="close" size={20} color={CHROME_TINT} />
        </Pressable>
        <View className="flex-1 items-center px-2">
          {title ? (
            <Text testID={`${testID}-title`} accessibilityRole="header" numberOfLines={1} className="text-sm font-semibold text-white">
              {title}
            </Text>
          ) : null}
          {description ? (
            typeof description === "string" ? (
              <Text testID={`${testID}-description`} numberOfLines={1} className="text-xs text-white/70">
                {description}
              </Text>
            ) : (
              <View testID={`${testID}-description`}>{description}</View>
            )
          ) : null}
          <Text testID={`${testID}-counter`} accessibilityLiveRegion="polite" className="text-xs font-medium text-white/70">
            {items.length > 0 ? `${current + 1} / ${items.length}` : ""}
          </Text>
        </View>
        <View testID={`${testID}-actions`} className="min-w-10 flex-row items-center justify-end gap-1">
          {item && renderActions ? renderActions(item, current) : null}
        </View>
      </View>
      {caption ? (
        <View
          pointerEvents="box-none"
          testID={`${testID}-caption`}
          className={cn("absolute bottom-0 left-0 right-0 px-4 pt-3")}
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {typeof caption === "string" ? (
            <Text className="text-center text-sm text-white">
              {caption}
            </Text>
          ) : (
            caption
          )}
        </View>
      ) : null}
    </View>
  );
}
