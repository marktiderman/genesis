/**
 * Contrast helpers for colors Genesis computes on the phone: white or black, whichever reads on a
 * color string React Native parses (`#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()`, `hsla()`).
 *
 * @stability Beta
 */
const WHITE = "#FFFFFF";
const BLACK = "#000000";

const NUM = "([+-]?(?:\\d+\\.?\\d*|\\.\\d+))";
const SEP = "\\s*[,\\s]\\s*";
const ALPHA = `(?:\\s*[,/]\\s*${NUM}%?)?`;
const RGB = new RegExp(`^rgba?\\(\\s*${NUM}(%?)${SEP}${NUM}(%?)${SEP}${NUM}(%?)${ALPHA}\\s*\\)$`, "i");
const HSL = new RegExp(`^hsla?\\(\\s*${NUM}(?:deg)?${SEP}${NUM}%${SEP}${NUM}%${ALPHA}\\s*\\)$`, "i");

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** `[r, g, b]` in 0–1 from hex, `rgb()`/`rgba()` or `hsl()`/`hsla()` (alpha is ignored), or undefined. */
function channels(color: string): [number, number, number] | undefined {
  const s = color.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? hex.split("").map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
  }
  const rgb = RGB.exec(s);
  if (rgb) {
    const part = (v: string, pct: string) => clamp01(Number(v) / (pct ? 100 : 255));
    return [part(rgb[1]!, rgb[2]!), part(rgb[3]!, rgb[4]!), part(rgb[5]!, rgb[6]!)];
  }
  const hsl = HSL.exec(s);
  if (hsl) {
    const h = (((Number(hsl[1]) % 360) + 360) % 360) / 360;
    const sat = clamp01(Number(hsl[2]) / 100);
    const l = clamp01(Number(hsl[3]) / 100);
    if (sat === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = (t: number) => {
      const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
  }
  return undefined;
}

/** Relative luminance of a color string, or undefined for anything else (a PlatformColor, a named color). */
function luminance(color: unknown): number | undefined {
  if (typeof color !== "string") return undefined;
  const c = channels(color);
  if (!c) return undefined;
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * White or black, whichever reads better on `background`, else undefined. It reads hex (`#rgb`,
 * `#rrggbb`, with or without alpha), `rgb()`/`rgba()` and `hsl()`/`hsla()` (alpha is ignored:
 * the color as if opaque); a PlatformColor or a named color gives undefined.
 */
export function readableOn(background: unknown): string | undefined {
  const l = luminance(background);
  if (l === undefined) return undefined;
  // Contrast with white is 1.05 / (l + 0.05); with black, (l + 0.05) / 0.05.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? WHITE : BLACK;
}
