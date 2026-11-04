/**
 * usePressFeedback: how a pressable answers a touch, the same for buttons, rows and cards. It
 * shrinks a little while held (on the motion tokens' `press` duration) and springs back on release
 * (`snappy`), and can play a haptic when the press lands. Under Reduce Motion (or brand motion
 * `none`) it dims instead of moving.
 *
 *   const press = usePressFeedback({ haptic: "light" });
 *   <Pressable onPress={save} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
 *     <Animated.View style={press.style}>…</Animated.View>
 *   </Pressable>
 *
 * The haptic plays on `onPressIn` for `select` (a tick under the finger, as iOS does). Any other
 * kind plays when you call `press.confirm()` from `onPress`, so a press cancelled by scrolling
 * stays quiet.
 *
 * Built on React Native's `Animated`, so it works without Reanimated.
 *
 * @stability Beta
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated } from "react-native";
import { useMotion, type UseMotionOptions } from "./use-motion";
import { useHaptics, type HapticKind } from "./use-haptics";

type AnimatedValue = InstanceType<typeof Animated.Value>;

export interface PressFeedbackOptions {
  /** A haptic when the press counts (`confirm()`), or `select` as a tick on press-in. Default none. */
  haptic?: HapticKind | false;
  /** How far it shrinks while held. Default 0.97. */
  scale?: number;
  /** Under Reduce Motion: how far it dims while held. Default 0.6. */
  dimTo?: number;
  /** No feedback (a disabled button). */
  disabled?: boolean;
  /** The brand's motion level, as `useMotion` takes it. */
  level?: UseMotionOptions["level"];
}

export interface PressFeedback {
  onPressIn: () => void;
  onPressOut: () => void;
  /** Call from `onPress`: plays the haptic for a press that counted. */
  confirm: () => void;
  /** For an `Animated.View` around the pressable's content. */
  style: { transform?: { scale: AnimatedValue }[]; opacity?: AnimatedValue };
}

export function usePressFeedback({ haptic = false, scale = 0.97, dimTo = 0.6, disabled = false, level }: PressFeedbackOptions = {}): PressFeedback {
  const motion = useMotion(level ? { level } : {});
  const play = useHaptics();
  const value = useRef(new Animated.Value(1)).current;
  const reduced = motion.reduced;

  const to = useCallback(
    (target: number, held: boolean) => {
      if (held || reduced) {
        Animated.timing(value, { toValue: target, duration: motion.duration.press, useNativeDriver: true }).start();
      } else {
        const s = motion.spring.snappy;
        Animated.spring(value, { toValue: target, damping: s.damping, stiffness: s.stiffness, mass: s.mass, useNativeDriver: true }).start();
      }
    },
    [value, motion, reduced],
  );

  const onPressIn = useCallback(() => {
    if (disabled) return;
    to(reduced ? dimTo : scale, true);
    if (haptic === "select") play("select");
  }, [disabled, reduced, dimTo, scale, to, haptic, play]);

  // Always let go, even if the pressable was disabled mid-press (a send that started), and start
  // from rest whenever it's disabled, so it never comes back still shrunk.
  const onPressOut = useCallback(() => to(1, false), [to]);
  useEffect(() => {
    if (disabled) value.setValue(1);
  }, [disabled, value]);

  const confirm = useCallback(() => {
    if (!disabled && haptic && haptic !== "select") play(haptic);
  }, [disabled, haptic, play]);

  const style = useMemo(() => (disabled ? {} : reduced ? { opacity: value } : { transform: [{ scale: value }] }), [disabled, reduced, value]);

  return { onPressIn, onPressOut, confirm, style };
}
