/**
 * The colors behind a row's swipe actions: iOS's system colors (what Mail and Messages use),
 * with the same hues for Android and tests, and the text and icon color on each.
 *
 * @stability Beta
 */
import type { RowActionTone } from "@marktiderman/genesis-core/conversation";

/**
 * Each tone's iOS system color name, and its fallback where there is no `PlatformColor`. iOS keeps
 * its system colors with white on them, as Mail and Messages draw them: that is iOS's own look, and
 * not every pair reaches WCAG AA (white on systemGreen or systemOrange is about 2.2:1). The
 * fallbacks are darker shades that carry white at 4.5:1 or more.
 */
export const ROW_ACTION_TONES: Record<Exclude<RowActionTone, "tint" | "red">, { ios: string; fallback: string }> = {
  blue: { ios: "systemBlue", fallback: "#0062CC" },
  green: { ios: "systemGreen", fallback: "#1E7B34" },
  orange: { ios: "systemOrange", fallback: "#B45400" },
  purple: { ios: "systemPurple", fallback: "#8A3FB8" },
  // Yellow carries black text (onRowActionColor): 13.9:1.
  yellow: { ios: "systemYellow", fallback: "#FFCC00" },
  gray: { ios: "systemGray", fallback: "#636366" },
};

/** Text and icons on a system-tone action: white, as iOS draws them, except on yellow, where only black reads. */
export const ON_ROW_ACTION = "#FFFFFF";
export const ON_ROW_ACTION_LIGHT_TONE = "#000000";

/** Relative luminance of a `#rrggbb` (or `#rgb`) color, or undefined for anything else (a PlatformColor). */
function luminance(color: unknown): number | undefined {
  if (typeof color !== "string" || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return undefined;
  const hex = color.length === 4 ? color.slice(1).split("").map((c) => c + c).join("") : color.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** White or black, whichever reads better on `background` (a hex color), else undefined. */
export function readableOn(background: unknown): string | undefined {
  const l = luminance(background);
  if (l === undefined) return undefined;
  // Contrast with white is 1.05 / (l + 0.05); with black, (l + 0.05) / 0.05.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? ON_ROW_ACTION : ON_ROW_ACTION_LIGHT_TONE;
}

/**
 * The text and icon color on an action of this tone.
 *
 * - **System tones** (blue, green, orange, purple, gray): white, as iOS draws them; black on yellow.
 * - **`tint` and `red`** sit on the app's own colors (`background`: the tint, which NativeSwipeRow
 *   takes from the brand's primary under a `GenesisThemeProvider` and otherwise from the theme's
 *   tint role, or the destructive role), so they take what reads on that color: white or black by
 *   contrast when it's a hex color, else `foreground` (the theme's `primaryForeground` or
 *   `destructiveForeground`, which the caller passes), else white (iOS's systemRed, as Mail draws
 *   Delete). NativeSwipeRow uses a brand's declared `accent.foreground` on `tint` before any of these.
 */
export function onRowActionColor(tone: RowActionTone | undefined, background?: unknown, foreground?: string): string {
  if (tone === "yellow") return ON_ROW_ACTION_LIGHT_TONE;
  if (tone !== undefined && tone !== "tint" && tone !== "red") return ON_ROW_ACTION;
  return readableOn(background) ?? foreground ?? ON_ROW_ACTION;
}

/** The pill a row becomes while its round actions are open (iOS 26 Messages): systemGray5. */
export const ROW_PILL = { ios: "systemGray5", fallback: "#E5E5EA" } as const;
