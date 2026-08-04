/**
 * Theme types — PRD-07 A2b unified theme model.
 *
 * Same TypeScript shape on web + native. Consumers calling `useTheme()`
 * get identical inference and identical key sets on both platforms; the
 * only thing that differs is whether the color values are CSS variable
 * references (web) or resolved hex strings (native).
 *
 * See `docs/prds/PRD-07-genesis-consumption-architecture/research/a2b-unified-theme-api.md`
 * for the full design lock.
 */

import { isColorScale } from "../schema/brand";
import type { CanonicalBrand, ColorScale } from "../schema/brand";

/**
 * The mode prop accepted by {@link GenesisThemeProvider}, and the value
 * surfaced as {@link UseThemeReturn.mode} (the consumer's intent).
 *
 * - `"light"` / `"dark"` — explicit.
 * - `"system"` — follow the OS preference. The OS-resolved value is
 *   surfaced separately as {@link UseThemeReturn.resolvedMode}; the
 *   caller's `"system"` choice round-trips via {@link UseThemeReturn.mode}
 *   so 3-state UIs (light / dark / system radio buttons) can read their
 *   own intent back.
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * The OS-resolved mode surfaced as {@link UseThemeReturn.resolvedMode} —
 * always concrete (`"system"` is resolved before this is read). Use this
 * for tokens-keyed-by-mode lookups and for `data-theme` attribute writes.
 */
export type ResolvedThemeMode = "light" | "dark";

/**
 * A color scale resolved for the active platform + mode. Same shape as
 * the {@link ColorScale} authored in the brand object — but the string
 * values are platform-correct (CSS var refs on web, hex strings on
 * native).
 */
export type ResolvedColorScale = ColorScale;

/**
 * The flat token bag returned to consumers by {@link UseThemeReturn.tokens}.
 *
 * Identical TypeScript shape on web + native. Optional fields are present
 * iff the brand declares them.
 */
export interface ResolvedTokens {
  /** Neutral grayscale ramp (50–900). Always present. */
  neutral: Record<string, string>;
  /** Background / card / popover surfaces. Always present. */
  surface: ResolvedColorScale;
  /** Foreground / muted-foreground text. Always present. */
  text: ResolvedColorScale;
  /** Brand primary + accents. Always present. */
  accent: ResolvedColorScale;
  /** Cross-brand status semantics. Always present. */
  status: {
    success: ResolvedColorScale;
    warning: ResolvedColorScale;
    error: ResolvedColorScale;
    info: ResolvedColorScale;
  };
  /** Optional spacing scale. Same string values on web + native. */
  spacing?: Record<string, string>;
  /** Optional border-radius scale. */
  radius?: Record<string, string>;
  /**
   * Brand extensions — same shape as `brand.extensions`. Type-safe access
   * requires consumer-side declaration merging on `BrandExtensions`.
   */
  extensions?: Record<string, ResolvedColorScale>;
}

/**
 * The shape returned by {@link useTheme}. Same on web and native.
 */
export interface UseThemeReturn {
  /**
   * Active brand. Whatever was passed to `<GenesisThemeProvider brand={...}>`.
   */
  brand: CanonicalBrand;
  /**
   * Caller-selected mode. Reflects the consumer's intent (e.g., `"system"`,
   * `"light"`, `"dark"`). Use this for 3-state mode selectors that persist
   * intent (e.g., a settings UI with light/dark/system radio buttons that
   * needs to read back which radio is currently selected).
   */
  mode: ThemeMode;
  /**
   * OS-resolved mode. Always one of `"light"` | `"dark"` — the actual
   * rendering mode after resolving `"system"` via the platform's
   * color-scheme API. Use this for tokens-keyed-by-mode lookups and
   * `data-theme` attribute writes.
   */
  resolvedMode: ResolvedThemeMode;
  /**
   * Resolved tokens for the active brand + {@link resolvedMode}. Flat
   * record with the same TS shape on web + native.
   */
  tokens: ResolvedTokens;
  /**
   * Set the mode. Accepts `"system"` to follow the OS preference. No-op
   * (with dev-warning) when `mode` is controlled via a prop on the
   * provider.
   */
  setMode: (mode: ThemeMode) => void;
}

/**
 * Resolves the brand's tokens for a given mode. Pure function; same
 * implementation on web + native (consumed by both providers).
 *
 * Mode-specific selection: if a `ColorScale` has a `light` / `dark` key
 * matching the active mode, that value wins over `DEFAULT`. The returned
 * object preserves the full ColorScale shape (DEFAULT included) so
 * consumers can still read sibling stops.
 */
export function resolveTokens(
  brand: CanonicalBrand,
  mode: ResolvedThemeMode
): ResolvedTokens {
  const pickScale = (scale: ColorScale): ResolvedColorScale => {
    const modeValue = scale[mode];
    if (typeof modeValue === "string" && modeValue.length > 0) {
      return { ...scale, DEFAULT: modeValue };
    }
    return { ...scale };
  };

  const tokens: ResolvedTokens = {
    neutral: { ...brand.neutral },
    surface: pickScale(brand.surface),
    text: pickScale(brand.text),
    accent: pickScale(brand.accent),
    status: {
      success: pickScale(brand.status.success),
      warning: pickScale(brand.status.warning),
      error: pickScale(brand.status.error),
      info: pickScale(brand.status.info),
    },
  };

  if (brand.spacing) tokens.spacing = { ...brand.spacing };
  if (brand.radius) tokens.radius = { ...brand.radius };
  if (brand.extensions) {
    // Per PRD-07 D8 (revised), `extensions` is `Record<string, unknown>`
    // to support both flat ColorScale entries and nested records (e.g.
    // Acme's `flowTemplate.breath: ColorScale`). Runtime theme tokens
    // surface only flat ColorScale leaves at the top level — consumers
    // with nested extensions read them directly via `brand.extensions`.
    const ext: Record<string, ResolvedColorScale> = {};
    for (const [k, v] of Object.entries(brand.extensions)) {
      if (isColorScale(v)) {
        ext[k] = pickScale(v);
      }
      // Non-ColorScale entries (nested records) are intentionally
      // skipped here — they remain accessible via `brand.extensions[k]`.
    }
    tokens.extensions = ext;
  }

  return tokens;
}
