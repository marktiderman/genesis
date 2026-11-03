/**
 * NativeLightbox — a full-screen photo viewer: swipe between the items, a
 * close button, a "3 / 12" counter, the caption at the bottom and a slot for
 * actions (share, save) at the top right. `title`/`description` sit in the
 * top bar; `renderMedia` swaps a page's picture for a video or a compare view.
 *
 * The built-in photo pages pinch or double-tap to zoom (`zoomable`, on by
 * default), and paging stops while one is zoomed; at full size a pull down
 * closes the viewer (`swipeToDismiss`, on by default), fading the backdrop as
 * it goes; a tap shows or hides the top bar and caption. Pages from
 * `renderMedia` are left to their own gestures. With VoiceOver or TalkBack the
 * pager is adjustable: swipe up or down for the next or previous item, and it
 * reads "3 of 12". The gestures are built from genesis-chat's photo viewer
 * (see `lightbox-zoom`), which moves onto this one next, so there is one viewer.
 *
 * Built on `NativeFullScreenModal`. The pictures are a horizontal paging
 * `FlatList`, one per screen width, a few pages mounted at a time; a swipe
 * reports `onIndexChange` when the page settles, and a new `index` from
 * outside scrolls to it. No looping: the first and last page stop. The same
 * props as the web `Lightbox`.
 *
 * @stability Beta
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
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
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { cn } from "../utils";
import { FULL_SCREEN_DARK, NativeFullScreenModal } from "./full-screen-modal";
import type { GalleryItem } from "./gallery-types";
import { NativeIcon } from "./icon";
import { NativeImage } from "./image";
import { NativeZoomablePhoto } from "./lightbox-zoom";

/** The viewer's words, for another language. */
export interface NativeLightboxLabels {
  close: string;
  /** The pager's value for screen readers: "3 of 12". */
  position: (n: number, count: number) => string;
  /** The pager's hint for screen readers, when there's more than one. */
  pagerHint: string;
  /** A picture with no `alt`. */
  photo: (n: number, count: number) => string;
}

export const defaultNativeLightboxLabels: NativeLightboxLabels = {
  close: "Close",
  position: (n, count) => `${n} of ${count}`,
  pagerHint: "Swipe up or down for the next or previous one",
  photo: (n, count) => `Photo ${n} of ${count}`,
};

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
  /** Pinch or double-tap the built-in photo pages to zoom. Default true. */
  zoomable?: boolean;
  /** A pull down at full size closes the viewer. Default true. */
  swipeToDismiss?: boolean;
  labels?: Partial<NativeLightboxLabels>;
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
  zoomable = true,
  swipeToDismiss = true,
  labels: labelOverrides,
  testID = "native-lightbox",
}: NativeLightboxProps) {
  const labels = { ...defaultNativeLightboxLabels, ...labelOverrides };
  return (
    <NativeFullScreenModal open={open} onOpenChange={onOpenChange} tone="none" testID={testID}>
      {open ? (
        <LightboxBody
          testID={testID}
          items={items}
          index={index}
          onIndexChange={onIndexChange}
          onClose={() => onOpenChange(false)}
          renderCaption={renderCaption}
          renderActions={renderActions}
          renderMedia={renderMedia}
          title={title}
          description={description}
          zoomable={zoomable}
          swipeToDismiss={swipeToDismiss}
          labels={labels}
        />
      ) : null}
    </NativeFullScreenModal>
  );
}

interface LightboxBodyProps {
  testID: string;
  items: GalleryItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  renderCaption?: (item: GalleryItem, index: number) => ReactNode;
  renderActions?: (item: GalleryItem, index: number) => ReactNode;
  renderMedia?: (item: GalleryItem, index: number) => ReactNode;
  title?: string;
  description?: ReactNode;
  zoomable: boolean;
  swipeToDismiss: boolean;
  labels: NativeLightboxLabels;
}

/** Inside the modal, so `useSafeAreaInsets` reads the modal's own safe area. */
function LightboxBody({
  testID,
  items,
  index,
  onIndexChange,
  onClose,
  renderCaption,
  renderActions,
  renderMedia,
  title,
  description,
  zoomable,
  swipeToDismiss,
  labels,
}: LightboxBodyProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState(() => Dimensions.get("window"));
  const [zoomed, setZoomed] = useState(false);
  const [chrome, setChrome] = useState(true);
  const backdrop = useRef(new Animated.Value(1)).current;
  const listRef = useRef<FlatList<GalleryItem>>(null);
  const width = size.width;
  const current = Math.min(Math.max(0, index), Math.max(0, items.length - 1));
  const item = items[current];
  const many = items.length > 1;

  // Re-snap on a width change (rotation, resize) so the page stays aligned; that jump is not animated.
  const snappedWidth = useRef(width);
  useEffect(() => {
    if (items.length === 0) return;
    const widthChanged = snappedWidth.current !== width;
    snappedWidth.current = width;
    listRef.current?.scrollToIndex({ index: current, animated: !widthChanged && !reducedMotion });
  }, [current, items.length, width, reducedMotion]);

  // Another page starts unzoomed.
  useEffect(() => setZoomed(false), [current]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && (w !== size.width || h !== size.height)) setSize({ width: w, height: h, scale: 1, fontScale: 1 } as typeof size);
  };
  // The index is the parent's: a swipe asks for a page, and if the parent keeps the old one, the
  // pager scrolls back to it, so what's shown never drifts from `index`.
  const currentRef = useRef(current);
  currentRef.current = current;
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    const clamped = Math.min(Math.max(0, page), items.length - 1);
    if (clamped === current) return;
    onIndexChange(clamped);
    setTimeout(() => {
      if (currentRef.current !== clamped) listRef.current?.scrollToIndex({ index: currentRef.current, animated: !reducedMotion });
    }, 0);
  };
  const goTo = (i: number) => {
    if (i >= 0 && i < items.length && i !== current) onIndexChange(i);
  };

  const onPull = useCallback((dy: number) => backdrop.setValue(Math.max(0.35, 1 - Math.max(0, dy) / 400)), [backdrop]);
  const toggleChrome = useCallback(() => setChrome((c) => !c), []);
  const caption = item ? (renderCaption ? renderCaption(item, current) : item.caption) : null;
  const position = items.length > 0 ? labels.position(current + 1, items.length) : "";
  const pagerA11y = {
    testID: `${testID}-pager-a11y`,
    accessible: true,
    accessibilityRole: "adjustable" as const,
    accessibilityLabel: item ? (item.alt ?? labels.photo(current + 1, items.length)) : title,
    accessibilityValue: many ? { text: position } : undefined,
    accessibilityHint: many ? labels.pagerHint : undefined,
    accessibilityActions: many ? [{ name: "increment" }, { name: "decrement" }] : [],
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
      if (e.nativeEvent.actionName === "increment") goTo(current + 1);
      if (e.nativeEvent.actionName === "decrement") goTo(current - 1);
    },
  };

  return (
    <View testID={`${testID}-content`} accessibilityLabel={title} onLayout={onLayout} style={{ flex: 1 }}>
      <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: FULL_SCREEN_DARK, opacity: backdrop }} />
      {/* Built-in photo pages: the page itself is the adjustable pager. A renderMedia page keeps its
          own controls reachable (an accessible wrapper would group them away from VoiceOver), so the
          pager is the counter in the top bar instead. */}
      <View style={{ flex: 1 }} testID={`${testID}-pages`} {...(renderMedia ? {} : pagerA11y)}>
        <FlatList
          ref={listRef}
          testID={`${testID}-pager`}
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={many && !zoomed}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(it) => it.id}
          initialScrollIndex={current}
          getItemLayout={(_data, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onMomentumEnd}
          // A page or two each side: a video from renderMedia mounts only near the screen.
          windowSize={3}
          initialNumToRender={1}
          extraData={current}
          renderItem={({ item: it, index: i }) => (
            <View testID={`${testID}-page-${it.id}`} style={{ width, flex: 1 }} className="items-center justify-center">
              {renderMedia ? (
                renderMedia(it, i)
              ) : zoomable || swipeToDismiss ? (
                <NativeZoomablePhoto
                  src={it.src}
                  alt={it.alt ?? labels.photo(i + 1, items.length)}
                  width={width}
                  height={size.height}
                  active={i === current}
                  zoomable={zoomable}
                  onZoomChange={setZoomed}
                  onPull={swipeToDismiss ? onPull : null}
                  onDismiss={onClose}
                  onTap={toggleChrome}
                  testID={`${testID}-photo-${it.id}`}
                />
              ) : (
                <Pressable accessible={false} onPress={toggleChrome} style={{ width, flex: 1 }}>
                  <NativeImage src={it.src} alt={it.alt ?? labels.photo(i + 1, items.length)} className="h-full w-full" contentFit="contain" />
                </Pressable>
              )}
            </View>
          )}
          style={{ flex: 1 }}
        />
      </View>
      {chrome ? (
        <View
          pointerEvents="box-none"
          testID={`${testID}-chrome`}
          className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-3"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel={labels.close}
            onPress={onClose}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-black/45"
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
            {/* With photo pages the page reads the position and the counter is for the eye; with
                renderMedia pages the counter is the pager. */}
            {renderMedia ? (
              <View {...pagerA11y}>
                <Text testID={`${testID}-counter`} className="text-xs font-medium text-white/70">
                  {items.length > 0 ? `${current + 1} / ${items.length}` : ""}
                </Text>
              </View>
            ) : (
              <Text testID={`${testID}-counter`} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden className="text-xs font-medium text-white/70">
                {items.length > 0 ? `${current + 1} / ${items.length}` : ""}
              </Text>
            )}
          </View>
          <View testID={`${testID}-actions`} className="min-w-11 flex-row items-center justify-end gap-1">
            {item && renderActions ? renderActions(item, current) : null}
          </View>
        </View>
      ) : null}
      {chrome && caption ? (
        <View
          pointerEvents="box-none"
          testID={`${testID}-caption`}
          className={cn("absolute bottom-0 left-0 right-0 px-4 pt-3")}
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {typeof caption === "string" ? <Text className="text-center text-sm text-white">{caption}</Text> : caption}
        </View>
      ) : null}
    </View>
  );
}
