/** `import * as Haptics from "expo-haptics"`: the parts the screens use (genesis-chat's shape). */
export interface HapticsLike {
  impactAsync(style?: never): Promise<void>;
  selectionAsync(): Promise<void>;
  notificationAsync(type?: never): Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown };
  NotificationFeedbackType: { Success: unknown; Warning: unknown; Error: unknown };
}

/** `vote`: a vote cast or taken back; `select`: a tab changed; `refused`: a vote the source turned down. */
export type ProductHapticEvent = "vote" | "select" | "refused";

/** Plays a haptic when the app gave expo-haptics; never throws, never rejects. */
export function haptic(haptics: HapticsLike | undefined, event: ProductHapticEvent): void {
  if (!haptics) return;
  try {
    const style = (s: unknown) => s as never;
    const p =
      event === "vote"
        ? haptics.impactAsync(style(haptics.ImpactFeedbackStyle.Light))
        : event === "select"
          ? haptics.selectionAsync()
          : haptics.notificationAsync(style(haptics.NotificationFeedbackType.Error));
    void p?.catch?.(() => undefined);
  } catch {
    // A haptic is never worth an error.
  }
}
