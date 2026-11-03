/**
 * NativeLiveIndicator — "Live" with a pulsing dot, for a stream or a session
 * that is on right now; the dot goes grey when it is idle and fainter when
 * the source is offline.
 *
 * The pulse is an `Animated` loop that Reduce Motion turns off. Announced as
 * text in a polite live region on Android and through
 * `AccessibilityInfo.announceForAccessibility` on iOS, so a change from live
 * to ended is read without interrupting. Same props as the web `LiveIndicator`.
 *
 * @stability Beta
 */
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { cn } from "../utils";

export type NativeLiveIndicatorVariant = "pill" | "dot";
export type NativeLiveIndicatorState = "live" | "idle" | "offline";

export interface NativeLiveIndicatorProps {
  /** Default true. `live={false}` is `state="idle"`. */
  live?: boolean;
  /** Overrides `live`: "live", "idle" (grey) or "offline" (faint). */
  state?: NativeLiveIndicatorState;
  /** Visible text and screen-reader label. Default follows the state: "Live", "Idle" or "Offline". */
  label?: string;
  /** After the label ("12 watching", "since 9:00"). */
  detail?: string;
  /** "pill" (default): dot and label on a rounded surface. "dot": the dot alone. */
  variant?: NativeLiveIndicatorVariant;
  className?: string;
  testID?: string;
}

const DEFAULT_LABEL: Record<NativeLiveIndicatorState, string> = { live: "Live", idle: "Idle", offline: "Offline" };

const DOT_CLASS: Record<NativeLiveIndicatorState, string> = {
  live: "bg-destructive",
  idle: "bg-muted-foreground",
  offline: "bg-muted-foreground/50",
};

export function NativeLiveIndicator({
  live = true,
  state,
  label,
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

  const shown = label ?? DEFAULT_LABEL[resolved];
  const stateText = isLive ? shown : label === undefined ? shown : resolved === "offline" ? `Offline, not ${shown.toLowerCase()}` : `Not ${shown.toLowerCase()}`;
  const a11yLabel = detail ? `${stateText}, ${detail}` : stateText;
  // accessibilityLiveRegion is Android-only: on iOS, announce a state change after mount.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    const previous = announced.current;
    announced.current = a11yLabel;
    if (previous === null || previous === a11yLabel) return;
    const info = AccessibilityInfo as {
      announceForAccessibilityWithOptions?: (text: string, options: { queue?: boolean }) => void;
      announceForAccessibility?: (text: string) => void;
    };
    if (info.announceForAccessibilityWithOptions) info.announceForAccessibilityWithOptions(a11yLabel, { queue: true });
    else info.announceForAccessibility?.(a11yLabel);
  }, [a11yLabel]);
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
        {shown}
      </Text>
      {detail ? (
        <Text testID={`${testID}-detail`} className="text-xs text-muted-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
