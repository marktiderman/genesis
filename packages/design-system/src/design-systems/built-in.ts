/**
 * The neutral design systems Genesis ships. Industry ones live in template
 * libraries (genesis-sites' `/templates`), defined the same way.
 */
import { DEFAULT_RAMP, defineDesignSystem, type DesignSystem } from "./define";

/**
 * Today's look, unchanged: it emits no tokens, so every component keeps the
 * stylesheet's own sizes, spacing and colours. The default for a brand that
 * names no design system.
 */
export const classicDesignSystem: DesignSystem = defineDesignSystem({
  name: "classic",
  version: 1,
  label: "Classic",
  description: "The stylesheet's own look: its sizes, spacing and colours, with no design system tokens.",
});

/** Cool and exact: a cool ground, hairlines, crisp corners, no shadows, calm motion. */
export const crispDesignSystem: DesignSystem = defineDesignSystem({
  name: "crisp",
  version: 1,
  label: "Crisp",
  description: "Cool and exact: a cool ground, hairline borders, small corners, no shadows and calm motion.",
  type: {
    ramp: { ...DEFAULT_RAMP, display: { min: 3, max: 5.5 }, h1: { min: 2.5, max: 4.25 } },
    eyebrow: { weight: 600, tracking: 0.1, case: "upper" },
  },
  space: { density: "normal" },
  shape: { corners: "crisp", borderWidth: 1, shadow: "flat" },
  surfaces: { ground: "chalk" },
  image: { filter: "crisp", grain: 0, scrim: "full" },
  motion: { level: "calm" },
});

/** Warm and open: a warm ground, generous space, soft corners and shadows. */
export const softDesignSystem: DesignSystem = defineDesignSystem({
  name: "soft",
  version: 1,
  label: "Soft",
  description: "Warm and open: a warm ground, generous space, rounded corners, soft shadows and calm motion.",
  type: {
    ramp: { ...DEFAULT_RAMP, display: { min: 2.75, max: 5.5 }, h1: { min: 2.5, max: 4.5 } },
    classes: { grotesk: { displayWeight: 500, headingWeight: 500, displayTracking: -0.03 } },
    eyebrow: { weight: 500, tracking: 0.16, case: "upper" },
  },
  space: { density: "generous" },
  shape: { corners: "soft", borderWidth: 1, shadow: "soft" },
  surfaces: { ground: "paper" },
  image: { filter: "warm", grain: 0, scrim: "full" },
  motion: { level: "calm" },
});

/** Every neutral design system, by id. */
export const NEUTRAL_DESIGN_SYSTEMS: readonly DesignSystem[] = Object.freeze([classicDesignSystem, crispDesignSystem, softDesignSystem]);

/** The design system a brand that names none gets. */
export const DEFAULT_DESIGN_SYSTEM_ID = classicDesignSystem.id;
