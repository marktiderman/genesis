/**
 * @feat:chat
 * The photo viewer: a message's photos full screen on black
 * (NativeFullScreenModal), swiped left and right, pinched or double-tapped
 * to zoom, swiped down (or Close) to leave. Share and Save show when the app
 * passed expo-sharing or expo-media-library (with `downloadFile` for photos
 * that are only a signed link).
 *
 * No gesture library: on iOS each photo is a zooming ScrollView (the
 * system's own pinch, and a pull down past the edge closes); on Android a
 * PanResponder pinches, pans and drags down. With VoiceOver or TalkBack the
 * pager is adjustable (swipe up or down for the next or previous photo).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FULL_SCREEN_DARK, NativeFullScreenModal, NativeIcon, NativeImage, NativeText, type NativeIconName } from "@marktiderman/genesis-ui-native/components";
import { useReducedMotion } from "@marktiderman/genesis-ui-native/hooks";
import type { ChatMessage } from "../core/types";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { fromServer, type BubbleAttachment } from "./media";
import { haptic } from "./modules";

export interface ChatPhoto {
  key: string;
  /** A signed link or a file on the phone. */
  uri: string;
  /** What a screen reader says for it. */
  alt: string;
}

export interface ChatPhotoViewerProps {
  /** The photos to page through; null closes the viewer. */
  photos: readonly ChatPhoto[] | null;
  /** The one to open at. Default the first. */
  initialIndex?: number;
  onClose: () => void;
  testID?: string;
}

/** Points pulled down (or dragged, on Android) that close the viewer on release. */
export const DISMISS_DISTANCE = 110;
/** Or a quick flick down, in points per millisecond. */
export const DISMISS_VELOCITY = 1.1;
export const MAX_ZOOM = 4;

/** Whether a drag down that ended here closes the viewer. */
export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > DISMISS_DISTANCE || (dy > 24 && vy > DISMISS_VELOCITY);
}

/** The zoom a pinch has reached: from where it started, by how far the fingers spread. */
export function pinchScale(startScale: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return startScale;
  return Math.min(MAX_ZOOM, Math.max(0.8, startScale * (distance / startDistance)));
}

/** Points between two touches. */
export function touchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** How far a zoomed photo may pan before an edge shows, per axis. */
export function panLimit(scale: number, size: number): number {
  return Math.max(0, ((scale - 1) * size) / 2);
}

/** A file already on the phone, which shares and saves without a download. */
export function isLocalUri(uri: string): boolean {
  return /^(file|ph|content|assets-library):/.test(uri);
}

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
// Between two `onPress`es (each fires on release): a quick double tap measured 330ms apart on iOS.
export const DOUBLE_TAP_MS = 400;

export function ChatPhotoViewer({ photos, initialIndex = 0, onClose, testID = "chat-photo-viewer" }: ChatPhotoViewerProps) {
  const open = photos !== null && photos.length > 0;
  return (
    <NativeFullScreenModal open={open} onOpenChange={(o) => (o ? undefined : onClose())} tone="none" testID={testID}>
      {open ? <ViewerBody photos={photos} initialIndex={Math.min(Math.max(0, initialIndex), photos.length - 1)} onClose={onClose} testID={testID} /> : null}
    </NativeFullScreenModal>
  );
}

function ViewerBody({ photos, initialIndex, onClose, testID }: { photos: readonly ChatPhoto[]; initialIndex: number; onClose: () => void; testID: string }) {
  const { copy, modules } = useChatNative();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const backdrop = useRef(new Animated.Value(1)).current;
  const listRef = useRef<FlatList<ChatPhoto> | null>(null);
  const photo = photos[index] ?? photos[0]!;
  const many = photos.length > 1;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= photos.length) return;
      setIndex(i);
      setZoomed(false);
      listRef.current?.scrollToIndex?.({ index: i, animated: !reducedMotion });
    },
    [photos.length, reducedMotion],
  );

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
      if (i !== index && i >= 0 && i < photos.length) {
        setIndex(i);
        setZoomed(false);
      }
    },
    [width, index, photos.length],
  );

  // A copy on the phone for sharing and saving: a local file as is, a signed link through downloadFile.
  const local = async (uri: string) => (isLocalUri(uri) ? uri : modules.downloadFile ? modules.downloadFile(uri) : null);
  const reachable = Boolean(modules.downloadFile) || photos.every((p) => isLocalUri(p.uri));
  const canShare = Boolean(modules.sharing) && reachable;
  const canSave = Boolean(modules.mediaLibrary) && reachable;

  const run = async (what: "share" | "save") => {
    if (busy) return;
    setBusy(true);
    try {
      if (what === "save") {
        const lib = modules.mediaLibrary!;
        const permission = await lib.requestPermissionsAsync(true);
        if (!permission.granted) {
          setNotice(copy.photosDenied);
          return;
        }
        const file = await local(photo.uri);
        if (!file) throw new Error("no copy on the phone");
        await lib.saveToLibraryAsync(file);
        haptic(modules.haptics, "send");
        setNotice(copy.photoSaved);
      } else {
        const sharing = modules.sharing!;
        if (!(await sharing.isAvailableAsync())) throw new Error("sharing unavailable");
        const file = await local(photo.uri);
        if (!file) throw new Error("no copy on the phone");
        await sharing.shareAsync(file, { dialogTitle: copy.sharePhoto });
      }
    } catch {
      haptic(modules.haptics, "error");
      setNotice(copy.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const toggleChrome = useCallback(() => setChrome((c) => !c), []);
  const onPull = useCallback((dy: number) => backdrop.setValue(Math.max(0.35, 1 - Math.max(0, dy) / 400)), [backdrop]);
  const renderItem = useCallback(
    ({ item, index: i }: { item: ChatPhoto; index: number }) => (
      <ZoomablePhoto
        photo={item}
        width={width}
        height={height}
        active={i === index}
        onZoomChange={setZoomed}
        onPull={onPull}
        onDismiss={onClose}
        onTap={toggleChrome}
        testID={`${testID}-photo-${i}`}
      />
    ),
    [width, height, index, onPull, onClose, toggleChrome, testID],
  );

  const counter = many ? fill(copy.photoOf, { n: index + 1, count: photos.length }) : null;
  return (
    <View style={{ flex: 1 }}>
      <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: FULL_SCREEN_DARK, opacity: backdrop }} />
      <View
        style={{ flex: 1 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={photo.alt}
        accessibilityValue={counter ? { text: counter } : undefined}
        accessibilityHint={many ? copy.viewerHint : undefined}
        accessibilityActions={many ? [{ name: "increment" }, { name: "decrement" }] : []}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment") goTo(index + 1);
          if (e.nativeEvent.actionName === "decrement") goTo(index - 1);
        }}
        testID={`${testID}-pager`}
      >
        <FlatList
          ref={listRef}
          testID={`${testID}-list`}
          data={photos as ChatPhoto[]}
          horizontal
          pagingEnabled
          scrollEnabled={many && !zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(p) => p.key}
          renderItem={renderItem}
          onMomentumScrollEnd={onMomentumEnd}
          extraData={index}
          windowSize={3}
          initialNumToRender={1}
        />
      </View>
      {chrome ? (
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, minHeight: 52 }}>
          <ViewerButton icon="close" label={copy.closeViewer} onPress={onClose} testID={`${testID}-close`} />
          <View style={{ flex: 1, alignItems: "center" }}>
            {counter ? (
              <NativeText testID={`${testID}-counter`} accessibilityLiveRegion="polite" style={{ color: "#FFFFFF", fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                {counter}
              </NativeText>
            ) : null}
          </View>
          {canSave ? <ViewerButton icon="download" label={copy.savePhoto} onPress={() => void run("save")} disabled={busy} testID={`${testID}-save`} /> : null}
          {canShare ? <ViewerButton icon="share" label={copy.sharePhoto} onPress={() => void run("share")} disabled={busy} testID={`${testID}-share`} /> : null}
          {!canSave && !canShare ? <View style={{ width: 44 }} /> : null}
        </View>
      ) : null}
      {notice ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 24, alignItems: "center" }}>
          <View accessibilityLiveRegion="assertive" testID={`${testID}-notice`} style={{ backgroundColor: "rgba(40,40,40,0.92)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 }}>
            <NativeText style={{ color: "#FFFFFF", textAlign: "center" }}>{notice}</NativeText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ViewerButton({ icon, label, onPress, disabled = false, testID }: { icon: NativeIconName; label: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)", opacity: disabled ? 0.5 : 1 }}
    >
      <NativeIcon name={icon} size={22} color="#FFFFFF" />
    </Pressable>
  );
}

interface ZoomableProps {
  photo: ChatPhoto;
  width: number;
  height: number;
  /** The page on screen: another page resets its zoom. */
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  /** How far it's pulled down, for the backdrop's fade. */
  onPull: (dy: number) => void;
  onDismiss: () => void;
  onTap: () => void;
  testID: string;
}

function ZoomablePhoto(props: ZoomableProps) {
  return Platform.OS === "ios" ? <ZoomableIos {...props} /> : <ZoomablePan {...props} />;
}

/** The photo itself, contained, on a transparent background so the backdrop's fade shows. */
function Photo({ photo, width, height, testID }: { photo: ChatPhoto; width: number; height: number; testID: string }) {
  return <NativeImage src={photo.uri} alt={photo.alt} width={width} height={height} contentFit="contain" className="bg-transparent" testID={testID} />;
}

/** A tap that waits to see whether it's the first half of a double tap. */
function useTaps(onSingle: () => void, onDouble: (e: { locationX: number; locationY: number }) => void) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (e: GestureResponderEvent) => {
    const now = Date.now();
    const at = { locationX: e.nativeEvent?.locationX ?? 0, locationY: e.nativeEvent?.locationY ?? 0 };
    if (now - last.current < DOUBLE_TAP_MS) {
      last.current = 0;
      if (timer.current) clearTimeout(timer.current);
      onDouble(at);
      return;
    }
    last.current = now;
    timer.current = setTimeout(onSingle, DOUBLE_TAP_MS);
  };
}

type ZoomRect = { x: number; y: number; width: number; height: number };
type ZoomScrollView = ScrollView & { scrollResponderZoomTo?: (rect: ZoomRect & { animated?: boolean }, animated?: boolean) => void };

/**
 * Zooms to a rect. React Native 0.88 drops `rect.animated` and animates per the deprecated second
 * argument (ScrollView.js `scrollResponderZoomTo`), so both are given: the rect's keeps it from
 * warning, the second is the one it uses.
 */
function zoomTo(view: ZoomScrollView | null, rect: ZoomRect, animated: boolean) {
  view?.scrollResponderZoomTo?.({ ...rect, animated }, animated);
}

/** iOS: the system's zooming scroll view; at full size, a pull down past the top closes. */
function ZoomableIos({ photo, width, height, active, onZoomChange, onPull, onDismiss, onTap, testID }: ZoomableProps) {
  const ref = useRef<ZoomScrollView | null>(null);
  const scale = useRef(1);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!active && scale.current > 1.01) {
      zoomTo(ref.current, { x: 0, y: 0, width, height }, false);
      scale.current = 1;
    }
  }, [active, width, height]);
  const tap = useTaps(onTap, (at) => {
    if (scale.current > 1.01) return zoomTo(ref.current, { x: 0, y: 0, width, height }, !reducedMotion);
    const w = width / 2.5;
    const h = height / 2.5;
    zoomTo(ref.current, { x: at.locationX - w / 2, y: at.locationY - h / 2, width: w, height: h }, !reducedMotion);
  });
  return (
    <ScrollView
      ref={ref as never}
      testID={testID}
      style={{ width, height }}
      contentContainerStyle={{ width, height }}
      maximumZoomScale={MAX_ZOOM}
      minimumZoomScale={1}
      bouncesZoom
      centerContent
      alwaysBounceVertical
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e) => {
        const z = e.nativeEvent.zoomScale ?? 1;
        if (z > 1.01 !== scale.current > 1.01) onZoomChange(z > 1.01);
        scale.current = z;
        if (z <= 1.01) onPull(-e.nativeEvent.contentOffset.y);
      }}
      onScrollEndDrag={(e) => {
        if (scale.current > 1.01) return;
        // iOS reports the release velocity in points per millisecond, negative while pulling down.
        if (shouldDismiss(-e.nativeEvent.contentOffset.y, -(e.nativeEvent.velocity?.y ?? 0))) onDismiss();
        else onPull(0);
      }}
    >
      <Pressable accessible={false} onPress={tap} style={{ width, height }}>
        <Photo photo={photo} width={width} height={height} testID={`${testID}-image`} />
      </Pressable>
    </ScrollView>
  );
}

/** Android (no zooming ScrollView): two fingers pinch, one pans a zoomed photo or drags it down to close. */
function ZoomablePan({ photo, width, height, active, onZoomChange, onPull, onDismiss, onTap, testID }: ZoomableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const s = useRef({ scale: 1, x: 0, y: 0, startScale: 1, startDistance: 0, startX: 0, startY: 0, pinching: false, dragging: false });

  const settle = useCallback(
    (to: { scale: number; x: number; y: number }) => {
      s.current.scale = to.scale;
      s.current.x = to.x;
      s.current.y = to.y;
      onZoomChange(to.scale > 1.01);
      if (reducedMotion) {
        scale.setValue(to.scale);
        tx.setValue(to.x);
        ty.setValue(to.y);
        return;
      }
      Animated.parallel([
        Animated.spring(scale, { toValue: to.scale, useNativeDriver: true }),
        Animated.spring(tx, { toValue: to.x, useNativeDriver: true }),
        Animated.spring(ty, { toValue: to.y, useNativeDriver: true }),
      ]).start();
    },
    [reducedMotion, onZoomChange, scale, tx, ty],
  );
  useEffect(() => {
    if (!active && s.current.scale > 1.01) settle({ scale: 1, x: 0, y: 0 });
  }, [active, settle]);

  const tap = useTaps(onTap, (at) => {
    if (s.current.scale > 1.01) return settle({ scale: 1, x: 0, y: 0 });
    const z = 2.5;
    settle({ scale: z, x: clamp((width / 2 - at.locationX) * (z - 1), panLimit(z, width)), y: clamp((height / 2 - at.locationY) * (z - 1), panLimit(z, height)) });
  });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.touches.length >= 2 || s.current.scale > 1.01 || (g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const st = s.current;
          st.pinching = e.nativeEvent.touches.length >= 2;
          st.dragging = !st.pinching && st.scale <= 1.01;
          st.startScale = st.scale;
          st.startDistance = touchDistance(e.nativeEvent.touches);
          st.startX = st.x;
          st.startY = st.y;
        },
        onPanResponderMove: (e, g) => {
          const st = s.current;
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            if (!st.pinching) {
              st.pinching = true;
              st.dragging = false;
              st.startScale = st.scale;
              st.startDistance = touchDistance(touches);
            }
            st.scale = pinchScale(st.startScale, st.startDistance, touchDistance(touches));
            scale.setValue(st.scale);
            return;
          }
          if (st.dragging) {
            st.y = Math.max(0, g.dy);
            ty.setValue(st.y);
            onPull(st.y);
            return;
          }
          if (st.scale > 1.01) {
            st.x = clamp(st.startX + g.dx, panLimit(st.scale, width));
            st.y = clamp(st.startY + g.dy, panLimit(st.scale, height));
            tx.setValue(st.x);
            ty.setValue(st.y);
          }
        },
        onPanResponderRelease: (_e, g) => {
          const st = s.current;
          if (st.dragging) {
            st.dragging = false;
            if (shouldDismiss(g.dy, g.vy)) return onDismiss();
            onPull(0);
            return settle({ scale: 1, x: 0, y: 0 });
          }
          st.pinching = false;
          const z = Math.max(1, st.scale);
          settle({ scale: z, x: clamp(st.x, panLimit(z, width)), y: clamp(st.y, panLimit(z, height)) });
        },
        onPanResponderTerminate: () => {
          onPull(0);
          settle({ scale: Math.max(1, s.current.scale), x: 0, y: 0 });
        },
      }),
    [width, height, onPull, onDismiss, settle, scale, tx, ty],
  );

  return (
    <View testID={testID} style={{ width, height, overflow: "hidden" }} {...responder.panHandlers}>
      <Animated.View style={{ width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
        <Pressable accessible={false} onPress={tap} style={{ width, height }}>
          <Photo photo={photo} width={width} height={height} testID={`${testID}-image`} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * The photos of the message a tapped photo belongs to, and where it is among them, for
 * `ChatPhotoViewer`: swiping goes through that message's photos. A photo in no message
 * (one still sending, shown from the phone) opens alone.
 */
export function galleryFor(
  messages: readonly ChatMessage[],
  urls: Record<string, string>,
  uri: string,
  alt: string,
  label: (a: BubbleAttachment) => string,
): { photos: ChatPhoto[]; index: number } {
  for (const m of messages) {
    const images = m.attachments.filter((a) => a.kind === "image").map((a) => fromServer(a, urls));
    if (!images.some((a) => a.uri === uri)) continue;
    const photos = images.filter((a): a is BubbleAttachment & { uri: string } => Boolean(a.uri)).map((a) => ({ key: a.key, uri: a.uri, alt: label(a) }));
    return { photos, index: Math.max(0, photos.findIndex((p) => p.uri === uri)) };
  }
  return { photos: [{ key: uri, uri, alt }], index: 0 };
}

export interface ChatMediaViewerProps {
  /** The picture to show; null closes the viewer. */
  image: { uri: string; alt: string } | null;
  onClose: () => void;
  testID?: string;
}

/** One picture in the full-screen viewer (`ChatPhotoViewer` pages through several). */
export function ChatMediaViewer({ image, onClose, testID = "chat-media-viewer" }: ChatMediaViewerProps) {
  const photos = useMemo(() => (image ? [{ key: image.uri, uri: image.uri, alt: image.alt }] : null), [image]);
  return <ChatPhotoViewer photos={photos} onClose={onClose} testID={testID} />;
}
