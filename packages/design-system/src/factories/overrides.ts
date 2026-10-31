/**
 * `brand.platformOverrides.{web,native}` merged over a brand, shared by the
 * factories (from-brand) and the role variables (brand-roles). Merging a
 * brand that was already merged gives the same brand.
 */
import type { CanonicalBrand, ColorScale, PlatformOverridable, TypographyTokens } from "../schema/brand";

/**
 * Merge a `Partial<PlatformOverridable>` into a brand object before
 * factory emission. Returns a NEW brand — never mutates the input.
 */
export function applyOverrides(
  brand: CanonicalBrand,
  override: Partial<PlatformOverridable> | undefined
): CanonicalBrand {
  if (!override) return brand;
  return {
    ...brand,
    surface: { ...brand.surface, ...(override.surface ?? {}) } as ColorScale,
    text: { ...brand.text, ...(override.text ?? {}) } as ColorScale,
    accent: { ...brand.accent, ...(override.accent ?? {}) } as ColorScale,
    typography: mergeTypography(brand.typography, override.typography),
    spacing: { ...(brand.spacing ?? {}), ...(override.spacing ?? {}) },
    radius: { ...(brand.radius ?? {}), ...(override.radius ?? {}) },
    shadow: { ...(brand.shadow ?? {}), ...(override.shadow ?? {}) },
    gradient: { ...(brand.gradient ?? {}), ...(override.gradient ?? {}) },
  };
}

function mergeTypography(
  base: TypographyTokens | undefined,
  override: TypographyTokens | undefined
): TypographyTokens | undefined {
  if (!base && !override) return undefined;
  return {
    fontFamily: { ...(base?.fontFamily ?? {}), ...(override?.fontFamily ?? {}) },
    fontSize: { ...(base?.fontSize ?? {}), ...(override?.fontSize ?? {}) },
    lineHeight: { ...(base?.lineHeight ?? {}), ...(override?.lineHeight ?? {}) },
    fontWeight: { ...(base?.fontWeight ?? {}), ...(override?.fontWeight ?? {}) },
  };
}
