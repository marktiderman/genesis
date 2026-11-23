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

/** Text and icons on a colored action: white, as iOS draws them on every system color. */
export const ON_ROW_ACTION = "#FFFFFF";
