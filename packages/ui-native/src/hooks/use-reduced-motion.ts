/**
 * useReducedMotion — subscribe to the OS reduce-motion preference.
 *
 * Returns `true` when the user has enabled reduce-motion at the OS level.
 * Components that animate (Sheet, Drawer, Toast, etc.) honor this hook by
 * skipping non-essential transitions and snapping into final state.
 *
 * @stability Beta
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v: boolean) => setReduced(v),
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
