/**
 * The colors behind a row's swipe actions: iOS's system colors (what Mail and Messages use),
 * with the same hues for Android and tests, and white for the text and icons on them.
 *
 * @stability Beta
 */
import type { RowActionTone } from "@marktiderman/genesis-core/conversation";

/** Each tone's iOS system color name, and its fallback where there is no `PlatformColor`. */
export const ROW_ACTION_TONES: Record<Exclude<RowActionTone, "tint" | "red">, { ios: string; fallback: string }> = {
  blue: { ios: "systemBlue", fallback: "#007AFF" },
  green: { ios: "systemGreen", fallback: "#34C759" },
  orange: { ios: "systemOrange", fallback: "#FF9500" },
  purple: { ios: "systemPurple", fallback: "#AF52DE" },
  yellow: { ios: "systemYellow", fallback: "#FFCC00" },
  gray: { ios: "systemGray", fallback: "#8E8E93" },
};

/** Text and icons on a colored action: white, as iOS draws them, except on yellow, where only black reads (WCAG 4.5:1). */
export const ON_ROW_ACTION = "#FFFFFF";
export const ON_ROW_ACTION_LIGHT_TONE = "#000000";

/** The text and icon color on an action of this tone. */
export function onRowActionColor(tone: RowActionTone | undefined): string {
  return tone === "yellow" ? ON_ROW_ACTION_LIGHT_TONE : ON_ROW_ACTION;
}

/** The pill a row becomes while its round actions are open (iOS 26 Messages): systemGray5. */
export const ROW_PILL = { ios: "systemGray5", fallback: "#E5E5EA" } as const;
