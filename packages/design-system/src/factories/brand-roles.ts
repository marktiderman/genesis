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
 * `GenesisNativeApp` can apply them at runtime (`brandVariables`).
 *
 * A brand's colors are its `DEFAULT`s, as `tailwindFromBrand` emits them for
 * web (`--color-surface` is `surface.DEFAULT`). A scale's `light` / `dark`
 * keys are emphasis tints (`--color-surface-light`), never light and dark
 * mode, so they are never read here.
 *
 * Light mode: every variable starts at the Genesis value, and the brand's
 * colors replace the ones it says something about:
 *
 *   - surface → background, card, popover
 *   - text → foreground and its card and popover pairs
 *   - accent → primary (and the sidebar's), with whichever of white and the
 *     darkest neutral reads better on it as its foreground; the ring is the
 *     primary when it reaches 3:1 on the background, the text color otherwise
 *   - neutral 100 → secondary, muted, accent; 500 → muted foreground (or the
 *     first darker stop that reads at 4.5:1 on the background, else the text
 *     color); 200 → border, input
 *   - status → destructive (error), success, warning, info
 *   - radius.lg (else radius.DEFAULT) → radius, in both modes: every
 *     `rounded-*` step is a multiple of it, so `"0"` is square everywhere
 *
 * Dark mode, without `brand.dark`: the Genesis dark theme, except the
 * primary, which is the brand's accent when it reaches 4.5:1 on the dark
 * background. With `brand.dark` (opt-in), each role it sets replaces the
 * Genesis dark value, as the light block does for light mode:
 *
 *   - dark.surface → background, card, popover; dark.text → foreground pairs
 *   - dark.accent → primary as given, with `dark.primaryForeground` (else the
 *     readable one of white and the darkest neutral) as its foreground
 *   - dark.neutral 800 → secondary, muted, accent; 400 → muted foreground;
 *     700 → border, input
 *   - dark.status → destructive, success, warning, info
 *
 * Colors that aren't `#rgb`/`#rrggbb` are left at the Genesis value.
 *
 * @stability Beta
 */

import { clampBounds, isLength, type CanonicalBrand } from "../schema/brand";
import { GENESIS_THEME_BRAND, themeVariables } from "../tokens/theme-css";
import { applyOverrides } from "./overrides";

type Mode = "light" | "dark";

/** @stability Beta */
export interface BrandRoleVariables {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** @stability Beta */
export interface BrandRoleVariablesOptions {
  /** Whose `brand.platformOverrides` apply. Default `"native"` (the app shell and the NativeWind preset). */
  platform?: "native" | "web";
}

const HEX =/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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

function hex(value: string | undefined): [number, number, number] | null {
  return typeof value === "string" ? parseHex(value) : null;
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

function overlay(brand: CanonicalBrand, mode: Mode, out: Record<string, string>): void {
  const set = (names: readonly string[], rgb: [number, number, number] | null) => {
    if (!rgb) return;
    for (const name of names) out[`--${name}`] = hslTriplet(rgb);
  };
  const neutral = (stop: string) => hex(brand.neutral?.[stop]);
  const read = (name: string) => {
    const [h, sat, l] = (out[`--${name}`] ?? "").split(" ").map((p) => parseFloat(p));
    return hslToRgb(h ?? 0, sat ?? 0, l ?? 0);
  };
  const accent = hex(brand.accent?.DEFAULT);
  const primaryWith = (primary: [number, number, number], page: [number, number, number], text: [number, number, number]) => {
    set(["primary", "sidebar-primary"], primary);
    const darkest = neutral("900") ?? BLACK;
    let on = contrast(primary, WHITE) >= contrast(primary, darkest) ? WHITE : darkest;
    if (contrast(primary, on) < 4.5) on = contrast(primary, WHITE) >= contrast(primary, BLACK) ? WHITE : BLACK;
    set(["primary-foreground", "sidebar-primary-foreground"], on);
    set(["ring", "sidebar-ring"], contrast(primary, page) >= 3 ? primary : text);
  };

  if (mode === "dark") {
    const dark = brand.dark;
    if (dark) {
      // The brand's own dark roles, over the Genesis dark theme.
      const dn = (stop: string) => hex(dark.neutral?.[stop]);
      set(["background", "card", "popover"], hex(dark.surface?.DEFAULT));
      set(["foreground", "card-foreground", "popover-foreground"], hex(dark.text?.DEFAULT));
      set(["secondary", "muted", "accent"], dn("800"));
      set(["muted-foreground"], dn("400"));
      set(["border", "input"], dn("700"));
      set(["destructive"], hex(dark.status?.error?.DEFAULT));
      set(["success"], hex(dark.status?.success?.DEFAULT));
      set(["warning"], hex(dark.status?.warning?.DEFAULT));
      set(["info"], hex(dark.status?.info?.DEFAULT));
      const own = hex(dark.accent?.DEFAULT);
      const page = read("background");
      if (own) primaryWith(own, page, read("foreground"));
      else if (accent && contrast(accent, page) >= 4.5) primaryWith(accent, page, read("foreground"));
      set(["primary-foreground", "sidebar-primary-foreground"], hex(dark.primaryForeground));
      return;
    }
    // No dark-mode colors in a brand: the Genesis dark theme, with the brand's accent where it reads.
    const page = read("background");
    if (accent && contrast(accent, page) >= 4.5) primaryWith(accent, page, read("foreground"));
    return;
  }

  const background = hex(brand.surface?.DEFAULT);
  const foreground = hex(brand.text?.DEFAULT);
  set(["background", "card", "popover"], background);
  set(["foreground", "card-foreground", "popover-foreground"], foreground);
  if (accent) primaryWith(accent, background ?? read("background"), foreground ?? read("foreground"));

  set(["secondary", "muted", "accent"], neutral("100"));
  // Muted text: the first neutral from 500 down that reads at 4.5:1 on the page, else the text color.
  const page = read("background");
  const readable = (rgb: [number, number, number] | null) => rgb !== null && contrast(rgb, page) >= 4.5;
  const mutedText = ["500", "600", "700", "800", "900"].map(neutral).find(readable);
  set(["muted-foreground"], mutedText ?? (brand.neutral?.["500"] ? read("foreground") : null));
  set(["border", "input"], neutral("200"));

  set(["destructive"], hex(brand.status?.error?.DEFAULT));
  set(["success"], hex(brand.status?.success?.DEFAULT));
  set(["warning"], hex(brand.status?.warning?.DEFAULT));
  set(["info"], hex(brand.status?.info?.DEFAULT));
}

/** `243 75% 59%` components → [r, g, b] (0–255). */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * The theme role variables for `brand`, per mode, as
 * `{ "--primary": "243 75% 59%", … }` maps: the same names and format as
 * `themes/genesis.css`.
 *
 * @stability Beta
 */
export function brandRoleVariables(brand: CanonicalBrand, options: BrandRoleVariablesOptions = {}): BrandRoleVariables {
  const platform = options.platform ?? "native";
  // The platform's overrides first, as themeFromBrand / tailwindFromBrand apply them.
  const merged = applyOverrides(brand, brand.platformOverrides?.[platform]);
  const base = themeVariables(GENESIS_THEME_BRAND);
  const light = { ...base.light };
  const dark = { ...base.dark };
  overlay(merged, "light", light);
  overlay(merged, "dark", dark);
  const radius = brandRadius(merged, platform);
  if (radius !== undefined) light["--radius"] = dark["--radius"] = radius;
  return { light, dark };
}

/**
 * The brand's base radius, what `--radius` holds and every `rounded-*` step
 * scales from: `radius.lg`, else `radius.DEFAULT`. `rounded-lg` is the radius
 * itself, so a brand's `lg` wins over a bare `DEFAULT` (`rounded`). On native a fluid `clamp()` is its minimum, as for other lengths.
 * A bare `0` becomes `0px`: the steps multiply it (`calc(var(--radius) * 1.4)`),
 * and a unitless product isn't a length.
 */
function brandRadius(brand: CanonicalBrand, platform: "native" | "web"): string | undefined {
  const value = brand.radius?.lg ?? brand.radius?.DEFAULT;
  if (typeof value !== "string" || !isLength(value)) return undefined;
  const bounds = platform === "native" ? clampBounds(value) : undefined;
  if (bounds) return `${bounds.min}rem`;
  return value === "0" ? "0px" : value;
}

/**
 * The opt-in brand variables, per mode, for what has no Genesis role: each is
 * set only when the brand sets its field, so a brand without them gets an
 * empty map.
 *
 *   - `accents.<name>` → `--brand-accent-<name>` (the colour as given)
 *   - `gradients.primary` → `--brand-gradient-primary` (`linear-gradient(…)`),
 *     what `Button variant="gradient"` paints
 *   - `signal` / `dark.signal` → `--brand-signal`
 *   - `typography.display` → `--font-display` (the stack), `--font-weight-display`,
 *     `--font-numeric-display` (`tabular-nums` / `proportional-nums`)
 *
 * `themeFromBrand` adds them to `variables`, `tailwindFromBrand` to its CSS and
 * the NativeWind preset to `:root`.
 *
 * @stability Beta
 */
export function brandExtraVariables(brand: CanonicalBrand, options: BrandRoleVariablesOptions = {}): BrandRoleVariables {
  const platform = options.platform ?? "native";
  const merged = applyOverrides(brand, brand.platformOverrides?.[platform]);
  const both: Record<string, string> = {};
  for (const [name, colour] of Object.entries(merged.accents ?? {})) {
    if (typeof colour === "string" && colour) both[`--brand-accent-${name}`] = colour;
  }
  const gradient = brandGradientCss(merged);
  if (gradient) both["--brand-gradient-primary"] = gradient;
  const display = merged.typography?.display;
  if (display?.family?.length) both["--font-display"] = fontStack(display.family);
  if (display?.weight) both["--font-weight-display"] = display.weight;
  if (display?.numeric) both["--font-numeric-display"] = display.numeric === "tabular" ? "tabular-nums" : "proportional-nums";
  const light = { ...both };
  const dark = { ...both };
  if (merged.signal) light["--brand-signal"] = dark["--brand-signal"] = merged.signal;
  if (merged.dark?.signal) dark["--brand-signal"] = merged.dark.signal;
  return { light, dark };
}

/** `gradients.primary` as CSS (`linear-gradient(135deg, #a, #b)`), or undefined. */
export function brandGradientCss(brand: CanonicalBrand): string | undefined {
  const g = brand.gradients?.primary;
  if (!g?.from || !g.to) return undefined;
  return `linear-gradient(${g.angle ?? 135}deg, ${g.from}, ${g.to})`;
}

function fontStack(stack: readonly string[]): string {
  return stack.map((entry) => (entry.includes(" ") ? `"${entry}"` : entry)).join(", ");
}
