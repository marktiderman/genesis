/**
 * Skeleton — loading placeholder block.
 *
 * Pulses with Reanimated 4 when the app passes it (`modules.reanimated` on
 * `GenesisModulesProvider`), else with React Native's Animated. While Reduce
 * Motion is on it holds still at a legible opacity.
 *
 * @stability Stable
 */
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { cn } from "../utils";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useGenesisModules, type GenesisReanimatedModule } from "../native-modules";

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

const PULSE_MS = 1000;
const LOW = 0.3;
const HIGH = 1;
// Held still under Reduce Motion (visual-regression flow
// `screenshot-reduced-motion.yaml`; Apple HIG / WCAG 2.3.3).
const STILL = 0.6;

function sizeStyles({ width, height, size }: NativeSkeletonProps): Array<{ width?: number; height?: number }> {
  const w = width ?? size;
  const h = height ?? size;
  const styles: Array<{ width?: number; height?: number }> = [];
  if (w !== undefined) styles.push({ width: w });
  if (h !== undefined) styles.push({ height: h });
  return styles;
}

function skeletonClass({ className, circle }: NativeSkeletonProps) {
  return cn("rounded-md bg-muted", circle && "rounded-full", className);
}

function NativeSkeleton(props: NativeSkeletonProps) {
  const { reanimated } = useGenesisModules();
  return reanimated ? <ReanimatedSkeleton {...props} reanimated={reanimated} /> : <AnimatedSkeleton {...props} />;
}

function ReanimatedSkeleton({ reanimated: R, ...props }: NativeSkeletonProps & { reanimated: GenesisReanimatedModule }) {
  const reduceMotion = useReducedMotion();
  const opacity = R.useSharedValue(LOW);
  useEffect(() => {
    R.cancelAnimation(opacity);
    if (reduceMotion) {
      opacity.value = STILL;
      return undefined;
    }
    opacity.value = LOW;
    opacity.value = R.withRepeat(R.withTiming(HIGH, { duration: PULSE_MS, easing: R.Easing.inOut(R.Easing.ease) }), -1, true);
    return () => R.cancelAnimation(opacity);
    // `R` and `opacity` are stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);
  const animatedStyle = R.useAnimatedStyle(() => {
    "worklet";
    return { opacity: opacity.value };
  });
  const AnimatedView = R.default.View;
  return (
    <AnimatedView
      className={skeletonClass(props)}
      style={[animatedStyle, ...sizeStyles(props)]}
      testID={props.testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function AnimatedSkeleton(props: NativeSkeletonProps) {
  const opacity = useRef(new Animated.Value(LOW)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(STILL);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: HIGH,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: LOW,
          duration: PULSE_MS,
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
      className={skeletonClass(props)}
      style={[{ opacity }, ...sizeStyles(props)] as any[]}
      testID={props.testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export { NativeSkeleton };
