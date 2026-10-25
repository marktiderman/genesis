/**
 * useReducedMotion — subscribe to the OS reduce-motion preference.
 *
 * Returns `true` when the user has enabled reduce-motion at the OS level,
 * and follows the setting while the app runs (Reanimated's own hook reads it
 * once at launch). Components that animate (Sheet, Drawer, Toast, Skeleton)
 * honor it by skipping non-essential transitions and snapping into the
 * final state.
 *
 * @stability Beta
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v);
      })
      // Some runtimes (web, older Android) reject when the accessibility
      // manager isn't wired up: treat that as "no preference".
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v: boolean) => {
        if (mounted) setReduced(v);
      },
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
