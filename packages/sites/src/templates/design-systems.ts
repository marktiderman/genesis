/**
 * Industry design systems: template content, defined like the neutral ones
 * in genesis-design-system (`defineDesignSystem`). A host registers the ones
 * it offers (`registerDesignSystem(...industryDesignSystems)`), and a brand
 * names one by id (`{ designSystem: { id: "forge@1" } }`).
 *
 * Each is a set of tokens only: no section renders differently because of
 * it, so swapping one for another (or for a neutral one) re-themes a site
 * without touching its pages.
 */
import { DEFAULT_RAMP, defineDesignSystem, type DesignSystem } from "@marktiderman/genesis-design-system";

/**
 * Forge: bold and athletic. Poster-sized headings (up to 112px, capitals in
 * a condensed face), square corners and 2px edges, a cool ground, crisp
 * photos with a little grain, and lively motion. For a strength gym or a
 * training box.
 */
export const forgeDesignSystem: DesignSystem = defineDesignSystem({
  name: "forge",
  version: 1,
  label: "Forge",
  description: "Bold and athletic: poster headings, square corners, heavy edges, a cool ground and lively motion.",
  type: {
    ramp: { ...DEFAULT_RAMP, display: { min: 3, max: 7 }, h1: { min: 2.5, max: 5 }, h2: { min: 2, max: 3.5 } },
    classes: {
      condensed: { displayWeight: 400, headingWeight: 400, displayTracking: 0.01, headingTracking: 0.01, case: "upper", displayLeading: 0.88 },
      grotesk: { displayWeight: 700, headingWeight: 700, displayTracking: -0.01, headingTracking: -0.005, case: "upper", displayLeading: 0.92 },
      geometric: { displayWeight: 700, headingWeight: 700, displayTracking: -0.01, case: "upper", displayLeading: 0.95 },
    },
    eyebrow: { weight: 600, tracking: 0.14, case: "upper" },
  },
  space: { density: "normal" },
  shape: { corners: "square", borderWidth: 2, shadow: "flat" },
  surfaces: { ground: "chalk" },
  image: { filter: "crisp", grain: 3, scrim: "full" },
  motion: { level: "lively" },
});

/**
 * Studio: calm. A warm ground, generous space, rounded corners, soft
 * shadows, light headings that never shout (no display step bigger than an
 * h1), warm photos and calm motion. For a yoga or Pilates studio.
 */
export const studioDesignSystem: DesignSystem = defineDesignSystem({
  name: "studio",
  version: 1,
  label: "Studio",
  description: "Calm: a warm ground, generous space, rounded corners, soft shadows, light headings and calm motion.",
  type: {
    ramp: { ...DEFAULT_RAMP, display: { min: 2.5, max: 4.75 }, h1: { min: 2.25, max: 4 } },
    leading: { display: 1.05, h1: 1.05 },
    classes: {
      serif: { displayWeight: 400, headingWeight: 400, displayTracking: -0.015, headingTracking: -0.01, displayLeading: 1.05 },
      grotesk: { displayWeight: 400, headingWeight: 500, displayTracking: -0.025, headingTracking: -0.015, displayLeading: 1.05 },
      geometric: { displayWeight: 400, headingWeight: 500, displayTracking: -0.02, displayLeading: 1.05 },
      condensed: { displayWeight: 400, headingWeight: 400, case: "as-written", displayLeading: 1 },
    },
    eyebrow: { weight: 500, tracking: 0.18, case: "upper" },
  },
  space: { density: "generous" },
  shape: { corners: "round", borderWidth: 1, shadow: "soft" },
  surfaces: { ground: "paper" },
  image: { filter: "warm", grain: 0, scrim: "full" },
  motion: { level: "calm" },
});

/** Every industry design system in this library. */
export const industryDesignSystems: readonly DesignSystem[] = Object.freeze([forgeDesignSystem, studioDesignSystem]);
