/**
 * A brand's theme role variables: the `--primary`, `--background`,
 * `--border`… variables every Genesis role class reads (`bg-primary` is
 * `hsl(var(--primary))`), worked out from a {@link CanonicalBrand}.
 *
 * `themes/genesis.css` and the NativeWind preset declare these for the
 * Genesis brand. An app with its own brand needs the same set with its own
 * colors, or the role classes stay Genesis purple whatever brand it passes.
 * {@link themeFromBrand} includes them in `variables`, the NativeWind preset
 * declares them (`createGenesisNativewindPreset({ brand })`), and
 * `GenesisNativeApp` applies them at runtime.
 *
 * Every variable starts at the Genesis value, and the brand's colors replace
 * the ones it says something about:
 *
 *   - surface → background, card, popover
 *   - text → foreground and its card and popover pairs
 *   - accent → primary (and the sidebar's), with whichever of white and the
 *     darkest neutral reads better on it as its foreground; the ring is the
 *     primary when it reaches 3:1 on the background, the text color otherwise
 *   - neutral 100/800 → secondary, muted, accent; 500/400 → muted
 *     foreground; 200/800 → border, input (light/dark)
 *   - status → destructive (error), success, warning, info, in the modes the
 *     brand gives them for (a status DEFAULT counts for light only)
 *
 * Colors that aren't `#rgb`/`#rrggbb` are left at the Genesis value.
 *
 * @stability Beta
 */

import type { CanonicalBrand, ColorScale } from "../schema/brand";
import { GENESIS_THEME_BRAND, themeVariables } from "../tokens/theme-css";

type Mode = "light" | "dark";

/** @stability Beta */
export interface BrandRoleVariables {
  light: Record<string, string>;
  dark: Record<string, string>;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `#4f46e5` → `243 75% 59%`, the HSL triplet the role variables hold. */
function hslTriplet([r255, g255, b255]: [number, number, number]): string {
  const [r, g, b] = [r255 / 255, g255 / 255, b255 / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return `${round(h)} ${round(s * 100)}% ${round(l * 100)}%`;
}

function pick(scale: ColorScale | undefined, mode: Mode, defaultCountsInDark = true): [number, number, number] | null {
  if (!scale) return null;
  const value = mode === "light" ? (scale.light ?? scale.DEFAULT) : (scale.dark ?? (defaultCountsInDark ? scale.DEFAULT : undefined));
  return typeof value === "string" ? parseHex(value) : null;
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

function overlay(brand: CanonicalBrand, mode: Mode, out: Record<string, string>): void {
  const set = (names: readonly string[], rgb: [number, number, number] | null) => {
    if (!rgb) return;
    for (const name of names) out[`--${name}`] = hslTriplet(rgb);
  };
  const neutral = (stop: string) => (typeof brand.neutral?.[stop] === "string" ? parseHex(brand.neutral[stop]!) : null);
  const dark = mode === "dark";

  const background = pick(brand.surface, mode);
  const foreground = pick(brand.text, mode);
  set(["background", "card", "popover"], background);
  set(["foreground", "card-foreground", "popover-foreground"], foreground);

  const primary = pick(brand.accent, mode);
  if (primary) {
    set(["primary", "sidebar-primary"], primary);
    const darkest = neutral("900") ?? BLACK;
    let on = contrast(primary, WHITE) >= contrast(primary, darkest) ? WHITE : darkest;
    if (contrast(primary, on) < 4.5) on = contrast(primary, WHITE) >= contrast(primary, BLACK) ? WHITE : BLACK;
    set(["primary-foreground", "sidebar-primary-foreground"], on);
    const page = background ?? (dark ? BLACK : WHITE);
    const ring = contrast(primary, page) >= 3 ? primary : foreground;
    set(["ring", "sidebar-ring"], ring);
  }

  set(["secondary", "muted", "accent"], neutral(dark ? "800" : "100"));
  set(["muted-foreground"], neutral(dark ? "400" : "500"));
  set(["border", "input"], neutral(dark ? "800" : "200"));

  // A status DEFAULT is one color for both modes; the Genesis dark values are tuned for dark
  // backgrounds, so a brand changes them only with an explicit `dark`.
  set(["destructive"], pick(brand.status?.error, mode, false));
  set(["success"], pick(brand.status?.success, mode, false));
  set(["warning"], pick(brand.status?.warning, mode, false));
  set(["info"], pick(brand.status?.info, mode, false));
}

/**
 * The theme role variables for `brand`, per mode, as
 * `{ "--primary": "243 75% 59%", … }` maps: the same names and format as
 * `themes/genesis.css`.
 *
 * @stability Beta
 */
export function brandRoleVariables(brand: CanonicalBrand): BrandRoleVariables {
  const base = themeVariables(GENESIS_THEME_BRAND);
  const light = { ...base.light };
  const dark = { ...base.dark };
  overlay(brand, "light", light);
  overlay(brand, "dark", dark);
  return { light, dark };
}
