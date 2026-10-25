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

// The last answer anyone got: a component mounting later (a toast, an open
// drawer) starts from it instead of animating for a frame before it hears.
let lastKnown = false;

/** Tests only: forget the last answer. Not exported from the package. */
export function __resetReducedMotion() {
  lastKnown = false;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(lastKnown);

  useEffect(() => {
    let mounted = true;
    const set = (v: boolean) => {
      lastKnown = v;
      if (mounted) setReduced(v);
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(set)
      // Some runtimes (web, older Android) reject when the accessibility
      // manager isn't wired up: treat that as "no preference".
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", set);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
