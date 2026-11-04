/**
 * Haptics, one way in: the app passes expo-haptics once, as `GenesisModules.haptics`, and every
 * Genesis primitive (and the app's own pieces) plays the same kinds of feedback through
 * `useHaptics()`. Without the module nothing plays, and nothing throws.
 *
 *   import * as Haptics from "expo-haptics";
 *   <GenesisModulesProvider modules={{ haptics: Haptics }}>
 *
 *   const haptic = useHaptics();
 *   haptic("select");
 *
 * Kinds follow the platforms' own vocabulary: a light, medium or heavy impact (a press, a swipe
 * passing its threshold, a long press opening a menu), a selection tick (a picker or a tab
 * changing), and a success, warning or error notification. The OS's own haptics setting applies;
 * Reduce Motion doesn't turn haptics off (they're not motion).
 *
 * @stability Beta
 */
import { useCallback } from "react";
import { useGenesisModules } from "../native-modules";

/** What a haptic says. */
export type HapticKind = "light" | "medium" | "heavy" | "select" | "success" | "warning" | "error";

/**
 * `import * as Haptics from "expo-haptics"`: the parts Genesis calls, written structurally (the
 * same shape as genesis-chat's `HapticsLike`, so one module serves both).
 */
export interface GenesisHapticsModule {
  impactAsync(style?: never): Promise<void>;
  selectionAsync(): Promise<void>;
  notificationAsync(type?: never): Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown; Heavy?: unknown };
  NotificationFeedbackType: { Success: unknown; Warning: unknown; Error: unknown };
}

/** Plays a haptic on the module given; never throws and never rejects. No module, no haptic. */
export function playHaptic(haptics: GenesisHapticsModule | undefined, kind: HapticKind): void {
  if (!haptics) return;
  try {
    const as = (s: unknown) => s as never;
    const styles = haptics.ImpactFeedbackStyle;
    const notes = haptics.NotificationFeedbackType;
    const p =
      kind === "light"
        ? haptics.impactAsync(as(styles.Light))
        : kind === "medium"
          ? haptics.impactAsync(as(styles.Medium))
          : kind === "heavy"
            ? haptics.impactAsync(as(styles.Heavy ?? styles.Medium))
            : kind === "select"
              ? haptics.selectionAsync()
              : haptics.notificationAsync(as(kind === "success" ? notes.Success : kind === "warning" ? notes.Warning : notes.Error));
    void p?.catch?.(() => undefined);
  } catch {
    // A haptic is never worth an error.
  }
}

/** A function that plays a haptic through the app's `GenesisModules.haptics`. Stable across renders. */
export function useHaptics(): (kind: HapticKind) => void {
  const { haptics } = useGenesisModules();
  return useCallback((kind: HapticKind) => playHaptic(haptics, kind), [haptics]);
}
