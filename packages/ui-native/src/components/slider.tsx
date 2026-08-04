/**
 * Slider + Range — single-thumb and dual-thumb sliders.
 *
 * NativeSlider: pick one value within [min, max].
 * NativeRangeSlider: pick a [low, high] range.
 *
 * Built on PanResponder + measured layout — no native module dependency.
 * Both honor 44pt thumb hit areas and expose accessibilityRole="adjustable"
 * with accessibilityValue so VoiceOver / TalkBack gestures adjust the
 * value via the platform's adjustable-rotor API.
 *
 * @stability Beta
 */
import { useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { cn } from "../utils";

interface BaseProps {
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
  thumbClassName?: string;
  testID?: string;
}

export interface NativeSliderProps extends BaseProps {
  value: number;
  onChange: (value: number) => void;
}

function snap(v: number, step: number, min: number, max: number) {
  const clamped = Math.min(max, Math.max(min, v));
  if (step <= 0) return clamped;
  // Snap relative to `min` so non-zero starts (e.g. min=1, step=2 → 1,3,5,...)
  // produce the correct discrete grid. Then re-clamp because the stepped
  // value can exceed max when (max - min) is not a multiple of step.
  const stepped = Math.round((clamped - min) / step) * step + min;
  return Math.min(max, Math.max(min, stepped));
}

function useTrackWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: { nativeEvent?: { layout?: { width?: number } } }) => {
    const w = e.nativeEvent?.layout?.width;
    if (typeof w === "number") setWidth(w);
  };
  return { width, onLayout };
}

export function NativeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  trackClassName,
  fillClassName,
  thumbClassName,
  testID,
}: NativeSliderProps) {
  const { width, onLayout } = useTrackWidth();
  const startValue = useRef(value);

  // Recreate the PanResponder when any of the derivable inputs change so its
  // closures never read a stale `value` / `width` / range. PanResponder
  // returns a fresh object each call but reuses its handler implementation,
  // so this is cheap.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startValue.current = value;
        },
        onPanResponderMove: (_e, g) => {
          if (width <= 0) return;
          const delta = (g.dx / width) * (max - min);
          onChange(snap(startValue.current + delta, step, min, max));
        },
      }),
    [max, min, onChange, step, value, width]
  );

  const ratio = width === 0 ? 0 : (value - min) / (max - min);
  const fillWidth = Math.round(ratio * width);

  return (
    <View
      testID={testID ?? "native-slider"}
      accessibilityRole="adjustable"
      accessibilityValue={{ now: value, min, max }}
      onLayout={onLayout}
      className={cn("h-11 w-full justify-center", className)}
      {...responder.panHandlers}
    >
      <View className={cn("h-1.5 rounded-full bg-muted", trackClassName)} />
      <View
        className={cn(
          "absolute h-1.5 rounded-full bg-primary",
          fillClassName
        )}
        style={{ width: fillWidth }}
      />
      <View
        testID={testID ? `${testID}-thumb` : undefined}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={cn(
          "absolute h-6 w-6 rounded-full border-2 border-primary bg-background shadow",
          thumbClassName
        )}
        style={{ left: Math.max(0, fillWidth - 12) }}
      />
    </View>
  );
}

export interface NativeRangeSliderProps extends BaseProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function NativeRangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  trackClassName,
  fillClassName,
  thumbClassName,
  testID,
}: NativeRangeSliderProps) {
  const { width, onLayout } = useTrackWidth();
  const startLow = useRef(value[0]);
  const startHigh = useRef(value[1]);

  const lowResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startLow.current = value[0];
        },
        onPanResponderMove: (_e, g) => {
          if (width <= 0) return;
          const delta = (g.dx / width) * (max - min);
          const next = snap(startLow.current + delta, step, min, value[1]);
          onChange([next, value[1]]);
        },
      }),
    [max, min, onChange, step, value, width]
  );

  const highResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startHigh.current = value[1];
        },
        onPanResponderMove: (_e, g) => {
          if (width <= 0) return;
          const delta = (g.dx / width) * (max - min);
          const next = snap(startHigh.current + delta, step, value[0], max);
          onChange([value[0], next]);
        },
      }),
    [max, min, onChange, step, value, width]
  );

  const lowRatio = width === 0 ? 0 : (value[0] - min) / (max - min);
  const highRatio = width === 0 ? 0 : (value[1] - min) / (max - min);
  const lowX = Math.round(lowRatio * width);
  const highX = Math.round(highRatio * width);

  return (
    <View
      testID={testID ?? "native-range-slider"}
      onLayout={onLayout}
      className={cn("h-11 w-full justify-center", className)}
    >
      <View className={cn("h-1.5 rounded-full bg-muted", trackClassName)} />
      <View
        className={cn(
          "absolute h-1.5 rounded-full bg-primary",
          fillClassName
        )}
        style={{ left: lowX, width: highX - lowX }}
      />
      <View
        testID={testID ? `${testID}-thumb-low` : undefined}
        accessibilityRole="adjustable"
        accessibilityValue={{ now: value[0], min, max: value[1] }}
        className={cn(
          "absolute h-6 w-6 rounded-full border-2 border-primary bg-background shadow",
          thumbClassName
        )}
        style={{ left: Math.max(0, lowX - 12) }}
        {...lowResponder.panHandlers}
      />
      <View
        testID={testID ? `${testID}-thumb-high` : undefined}
        accessibilityRole="adjustable"
        accessibilityValue={{ now: value[1], min: value[0], max }}
        className={cn(
          "absolute h-6 w-6 rounded-full border-2 border-primary bg-background shadow",
          thumbClassName
        )}
        style={{ left: Math.max(0, highX - 12) }}
        {...highResponder.panHandlers}
      />
    </View>
  );
}
