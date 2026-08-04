/**
 * Skeleton — loading placeholder block.
 *
 * @stability Stable
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { cn } from "../utils";

export interface NativeSkeletonProps {
  className?: string;
  /**
   * Width of the skeleton. Use className for NativeWind sizing instead
   * when possible (e.g. className="w-24 h-4").
   */
  width?: number;
  height?: number;
  /** Shorthand that sets both width and height (useful for circle skeletons). */
  size?: number;
  circle?: boolean;
  testID?: string;
}

function NativeSkeleton({
  className,
  width,
  height,
  size,
  circle,
  ...props
}: NativeSkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {
        // Defensive: some RN runtimes (web, older Android) reject when
        // the AccessibilityManager isn't wired up. Fall back to "no
        // reduce-motion" so the skeleton still animates rather than
        // crashing the host screen with an unhandled rejection.
        if (!cancelled) setReduceMotion(false);
      });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      // Hold the skeleton at a static, legible opacity instead of
      // pulsing — required by visual-regression flow `screenshot-
      // reduced-motion.yaml` and by users with vestibular-motion
      // sensitivity (Apple HIG / WCAG 2.3.3).
      opacity.setValue(0.6);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      className={cn(
        "rounded-md bg-muted",
        circle && "rounded-full",
        className
      )}
      style={[
        { opacity },
        (width ?? size) !== undefined ? { width: width ?? size } : undefined,
        (height ?? size) !== undefined ? { height: height ?? size } : undefined,
      ].filter(Boolean) as any[]}
      {...props}
    />
  );
}

export { NativeSkeleton };
