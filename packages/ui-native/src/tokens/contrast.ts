/**
 * Contrast helpers for colors Genesis computes on the phone: white or black, whichever reads on a
 * hex color.
 *
 * @stability Beta
 */
const WHITE = "#FFFFFF";
const BLACK = "#000000";

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
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? WHITE : BLACK;
}

