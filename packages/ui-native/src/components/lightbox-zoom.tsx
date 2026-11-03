/**
 * A photo page that zooms, for `NativeLightbox`: pinch or double-tap to zoom (up to 4×), pan
 * while zoomed, and at full size a pull down past the edge (or a quick flick) closes the viewer.
 *
 * No gesture library. On iOS each page is the system's zooming `ScrollView` (its own pinch, and
 * the pull down is its overscroll); on Android a `PanResponder` pinches, pans and drags down.
 * Built from genesis-chat's photo viewer, which moves onto NativeLightbox next so there is one
 * viewer (G4/G5); until then chat keeps its own copy. The pure helpers
 * are exported for tests and for anyone building a viewer of their own.
 *
 * @stability Beta
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform, Pressable, ScrollView, View, type GestureResponderEvent } from "react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { NativeImage } from "./image";

/** Points pulled down (or dragged, on Android) that close the viewer on release. */
export const LIGHTBOX_DISMISS_DISTANCE = 110;
/** Or a quick flick down, in points per millisecond. */
export const LIGHTBOX_DISMISS_VELOCITY = 1.1;
/** How far a photo zooms in. */
export const LIGHTBOX_MAX_ZOOM = 4;
/** Between two taps (each fires on release) for a double tap: a quick one measured 330ms apart on iOS. */
export const LIGHTBOX_DOUBLE_TAP_MS = 400;

/** Whether a drag down that ended here closes the viewer. */
export function lightboxShouldDismiss(dy: number, vy: number): boolean {
  return dy > LIGHTBOX_DISMISS_DISTANCE || (dy > 24 && vy > LIGHTBOX_DISMISS_VELOCITY);
}

/** The zoom a pinch has reached: from where it started, by how far the fingers spread. */
export function lightboxPinchScale(startScale: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return startScale;
  return Math.min(LIGHTBOX_MAX_ZOOM, Math.max(0.8, startScale * (distance / startDistance)));
}

/** Points between two touches. */
export function lightboxTouchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** How far a zoomed photo may pan before an edge shows, per axis. */
export function lightboxPanLimit(scale: number, size: number): number {
  return Math.max(0, ((scale - 1) * size) / 2);
}

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

export interface NativeZoomablePhotoProps {
  src: string;
  alt?: string;
  width: number;
  height: number;
  /** The page on screen: another page resets its zoom. */
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  /** Pinch and double-tap zoom (on by default). Off, the page still pulls down to close. */
  zoomable?: boolean;
  /** How far it's pulled down, for the backdrop's fade; null when swiping down doesn't close. */
  onPull: ((dy: number) => void) | null;
  onDismiss: () => void;
  /** A single tap (shows or hides the viewer's chrome). */
  onTap: () => void;
  testID: string;
}

/** The page: iOS's zooming scroll view, or Android's pinch and pan. */
export function NativeZoomablePhoto(props: NativeZoomablePhotoProps) {
  return Platform.OS === "ios" ? <ZoomableIos {...props} /> : <ZoomablePan {...props} />;
}

function Photo({ src, alt, width, height, testID }: { src: string; alt?: string; width: number; height: number; testID: string }) {
  return <NativeImage src={src} alt={alt} width={width} height={height} contentFit="contain" className="bg-transparent" testID={testID} />;
}

/** A tap that waits to see whether it's the first half of a double tap. */
function useTaps(onSingle: () => void, onDouble: (at: { locationX: number; locationY: number }) => void) {
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
    if (now - last.current < LIGHTBOX_DOUBLE_TAP_MS) {
      last.current = 0;
      if (timer.current) clearTimeout(timer.current);
      onDouble(at);
      return;
    }
    last.current = now;
    timer.current = setTimeout(onSingle, LIGHTBOX_DOUBLE_TAP_MS);
  };
}

type ZoomRect = { x: number; y: number; width: number; height: number };
type ZoomScrollView = { scrollResponderZoomTo?: (rect: ZoomRect & { animated?: boolean }, animated?: boolean) => void };

/**
 * Zooms to a rect. React Native 0.88 drops `rect.animated` and animates per the deprecated second
 * argument (ScrollView.js `scrollResponderZoomTo`), so both are given: the rect's keeps it from
 * warning, the second is the one it uses.
 */
function zoomTo(view: ZoomScrollView | null, rect: ZoomRect, animated: boolean) {
  view?.scrollResponderZoomTo?.({ ...rect, animated }, animated);
}

/** iOS: the system's zooming scroll view; at full size, a pull down past the top closes. */
function ZoomableIos({ src, alt, width, height, active, onZoomChange, zoomable = true, onPull, onDismiss, onTap, testID }: NativeZoomablePhotoProps) {
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
    if (!zoomable) return;
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
      maximumZoomScale={zoomable ? LIGHTBOX_MAX_ZOOM : 1}
      minimumZoomScale={1}
      bouncesZoom
      centerContent
      alwaysBounceVertical={Boolean(onPull)}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e) => {
        const z = e.nativeEvent.zoomScale ?? 1;
        if (z > 1.01 !== scale.current > 1.01) onZoomChange(z > 1.01);
        scale.current = z;
        if (z <= 1.01) onPull?.(-e.nativeEvent.contentOffset.y);
      }}
      onScrollEndDrag={(e) => {
        if (scale.current > 1.01 || !onPull) return;
        // iOS reports the release velocity in points per millisecond, negative while pulling down.
        if (lightboxShouldDismiss(-e.nativeEvent.contentOffset.y, -(e.nativeEvent.velocity?.y ?? 0))) onDismiss();
        else onPull(0);
      }}
    >
      <Pressable accessible={false} onPress={tap} style={{ width, height }}>
        <Photo src={src} alt={alt} width={width} height={height} testID={`${testID}-image`} />
      </Pressable>
    </ScrollView>
  );
}

/** Android (no zooming ScrollView): two fingers pinch, one pans a zoomed photo or drags it down to close. */
function ZoomablePan({ src, alt, width, height, active, onZoomChange, zoomable = true, onPull, onDismiss, onTap, testID }: NativeZoomablePhotoProps) {
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
    if (!zoomable) return;
    if (s.current.scale > 1.01) return settle({ scale: 1, x: 0, y: 0 });
    const z = 2.5;
    settle({
      scale: z,
      x: clamp((width / 2 - at.locationX) * (z - 1), lightboxPanLimit(z, width)),
      y: clamp((height / 2 - at.locationY) * (z - 1), lightboxPanLimit(z, height)),
    });
  });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (e, g) =>
          (zoomable && e.nativeEvent.touches.length >= 2) || s.current.scale > 1.01 || (Boolean(onPull) && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const st = s.current;
          st.pinching = zoomable && e.nativeEvent.touches.length >= 2;
          st.dragging = !st.pinching && st.scale <= 1.01 && Boolean(onPull);
          st.startScale = st.scale;
          st.startDistance = lightboxTouchDistance(e.nativeEvent.touches);
          st.startX = st.x;
          st.startY = st.y;
        },
        onPanResponderMove: (e, g) => {
          const st = s.current;
          const touches = e.nativeEvent.touches;
          if (zoomable && touches.length >= 2) {
            if (!st.pinching) {
              st.pinching = true;
              st.dragging = false;
              st.startScale = st.scale;
              st.startDistance = lightboxTouchDistance(touches);
            }
            st.scale = lightboxPinchScale(st.startScale, st.startDistance, lightboxTouchDistance(touches));
            scale.setValue(st.scale);
            return;
          }
          if (st.dragging) {
            st.y = Math.max(0, g.dy);
            ty.setValue(st.y);
            onPull?.(st.y);
            return;
          }
          if (st.scale > 1.01) {
            st.x = clamp(st.startX + g.dx, lightboxPanLimit(st.scale, width));
            st.y = clamp(st.startY + g.dy, lightboxPanLimit(st.scale, height));
            tx.setValue(st.x);
            ty.setValue(st.y);
          }
        },
        onPanResponderRelease: (_e, g) => {
          const st = s.current;
          if (st.dragging) {
            st.dragging = false;
            if (lightboxShouldDismiss(g.dy, g.vy)) return onDismiss();
            onPull?.(0);
            return settle({ scale: 1, x: 0, y: 0 });
          }
          st.pinching = false;
          const z = Math.max(1, st.scale);
          settle({ scale: z, x: clamp(st.x, lightboxPanLimit(z, width)), y: clamp(st.y, lightboxPanLimit(z, height)) });
        },
        onPanResponderTerminate: () => {
          onPull?.(0);
          settle({ scale: Math.max(1, s.current.scale), x: 0, y: 0 });
        },
      }),
    [width, height, zoomable, onPull, onDismiss, settle, scale, tx, ty],
  );

  return (
    <View testID={testID} style={{ width, height, overflow: "hidden" }} {...responder.panHandlers}>
      <Animated.View style={{ width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
        <Pressable accessible={false} onPress={tap} style={{ width, height }}>
          <Photo src={src} alt={alt} width={width} height={height} testID={`${testID}-image`} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
