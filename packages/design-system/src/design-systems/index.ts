/**
 * Design systems and the colour engine.
 *
 * - `defineDesignSystem`: a versioned set of look rules (`crisp@1`).
 * - `palette`: the OKLCH colour engine, from a brand colour to solved roles.
 * - `designSystemTheme`: a design system plus a brand as CSS variables
 *   (also reached through `themeFromBrand(brand, { designSystem })`).
 * - `registerDesignSystem` / `getDesignSystem`: design systems by id.
 *
 * @packageDocumentation
 */
export {
  CORNERS,
  DEFAULT_EYEBROW,
  DEFAULT_FONT_CLASS_RULES,
  DEFAULT_LEADING,
  DEFAULT_RAMP,
  DENSITIES,
  IMAGE_FILTERS,
  MOTION_LEVELS,
  SCRIMS,
  SHADOW_LEVELS,
  TYPE_STEPS,
  defineDesignSystem,
  resolveChoices,
  validateDesignSystem,
  validateDesignSystemChoice,
  type Corners,
  type Density,
  type DesignSystem,
  type DesignSystemChoice,
  type DesignSystemInput,
  type EyebrowRule,
  type FluidSize,
  type FontClassRule,
  type ImageFilter,
  type MotionLevel,
  type Scrim,
  type ShadowLevel,
  type TypeStep,
} from "./define";
export {
  GROUNDS,
  RAMP_STEPS,
  composite,
  contrast,
  hexToHslTriplet,
  hexToOklch,
  maxChroma,
  oklchToHex,
  palette,
  ramp,
  relativeLuminance,
  rolePairs,
  type ColorRoles,
  type ContrastPair,
  type Ground,
  type Oklch,
  type Palette,
  type PaletteInput,
  type RampStep,
} from "./color";
export { CORNER_RADII, designSystemTheme, fluid, type DesignSystemPair, type DesignSystemTheme, type DesignSystemTokenInput } from "./tokens";
export { DEFAULT_DESIGN_SYSTEM_ID, NEUTRAL_DESIGN_SYSTEMS, classicDesignSystem, crispDesignSystem, softDesignSystem } from "./built-in";
export { getDesignSystem, listDesignSystems, registerDesignSystem, unregisterDesignSystem } from "./registry";
