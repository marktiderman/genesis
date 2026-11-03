/**
 * NativeLiveIndicator — "Live" with a pulsing dot, for a stream or a session
 * that is on right now; the dot goes grey when it is idle and fainter when
 * the source is offline.
 *
 * The pulse is an `Animated` loop that Reduce Motion turns off. Announced as
 * text in a polite live region, so a change from live to ended is read
 * without interrupting. Same props as the web `LiveIndicator`.
 *
 * @stability Beta
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { cn } from "../utils";

export type NativeLiveIndicatorVariant = "pill" | "dot";
export type NativeLiveIndicatorState = "live" | "idle" | "offline";

export interface NativeLiveIndicatorProps {
  /** Default true. `live={false}` is `state="idle"`. */
  live?: boolean;
  /** Overrides `live`: "live", "idle" (grey) or "offline" (faint). */
  state?: NativeLiveIndicatorState;
  /** Default "Live". Read by screen readers in both variants. */
  label?: string;
  /** After the label ("12 watching", "since 9:00"). */
  detail?: string;
  /** "pill" (default): dot and label on a rounded surface. "dot": the dot alone. */
  variant?: NativeLiveIndicatorVariant;
  className?: string;
  testID?: string;
}

const DOT_CLASS: Record<NativeLiveIndicatorState, string> = {
  live: "bg-destructive",
  idle: "bg-muted-foreground",
  offline: "bg-muted-foreground/50",
};

export function NativeLiveIndicator({
  live = true,
  state,
  label = "Live",
  detail,
  variant = "pill",
  className,
  testID = "native-live-indicator",
}: NativeLiveIndicatorProps) {
  const resolved: NativeLiveIndicatorState = state ?? (live ? "live" : "idle");
  const isLive = resolved === "live";
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLive || reducedMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, reducedMotion, pulse]);

  const stateText = isLive ? label : resolved === "offline" ? `Offline, not ${label.toLowerCase()}` : `Not ${label.toLowerCase()}`;
  const a11yLabel = detail ? `${stateText}, ${detail}` : stateText;
  const dot = (
    <Animated.View
      testID={`${testID}-dot`}
      className={cn("h-2 w-2 rounded-full", DOT_CLASS[resolved])}
      style={{ opacity: pulse }}
    />
  );

  if (variant === "dot") {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="text"
        accessibilityLabel={a11yLabel}
        accessibilityLiveRegion="polite"
        className={cn("items-center justify-center", className)}
      >
        {dot}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
      accessibilityLiveRegion="polite"
      className={cn(
        "flex-row items-center gap-1.5 self-start rounded-full border px-2 py-0.5",
        isLive ? "border-transparent bg-destructive/15" : "border-border bg-muted",
        className,
      )}
    >
      {dot}
      <Text
        testID={`${testID}-label`}
        className={cn("text-xs font-semibold uppercase tracking-wide", isLive ? "text-foreground" : "text-muted-foreground")}
      >
        {label}
      </Text>
      {detail ? (
        <Text testID={`${testID}-detail`} className="text-xs text-muted-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
