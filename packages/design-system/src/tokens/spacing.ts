/**
 * Shared spacing and layout tokens for all Genesis projects.
 */

/**
 * The radius scale as multiples of the brand's `--radius` (`lg` is the radius
 * itself). Every step scales from it, so a brand at `--radius: 0` is square
 * everywhere, and no step goes negative on a small radius. At the Genesis
 * radius (0.625rem, 10px) the steps are the sizes they have always been:
 * sm 6px, md 8px, xl 14px, and `xs`, `DEFAULT` (`rounded`), `2xl` and `3xl`
 * land on Tailwind's own defaults (2px, 4px, 16px, 24px).
 *
 * Read by the Tailwind v4 bridge (`genesis-tailwind4.css`), the v3 preset
 * and the NativeWind preset, so web and native round the same corners.
 */
export const RADIUS_SCALE = {
  xs: 0.2,
  DEFAULT: 0.4,
  sm: 0.6,
  md: 0.8,
  lg: 1,
  xl: 1.4,
  "2xl": 1.6,
  "3xl": 2.4,
} as const;

/** `calc(var(--radius) * 0.6)`; `var(--radius)` for the radius itself. */
export function radiusStep(factor: number): string {
  return factor === 1 ? "var(--radius)" : `calc(var(--radius) * ${factor})`;
}

/** Tailwind `borderRadius` for the v3 and NativeWind presets: {@link RADIUS_SCALE} as `calc()`s. */
export const borderRadius = {
  xs: "calc(var(--radius) * 0.2)",
  DEFAULT: "calc(var(--radius) * 0.4)",
  sm: "calc(var(--radius) * 0.6)",
  md: "calc(var(--radius) * 0.8)",
  lg: "var(--radius)",
  xl: "calc(var(--radius) * 1.4)",
  "2xl": "calc(var(--radius) * 1.6)",
  "3xl": "calc(var(--radius) * 2.4)",
  full: "9999px",
} as const;

export const spacing = {
  page: { x: "1rem", sm: "1.5rem", lg: "2rem" },
  card: { padding: "1.25rem" },
  section: { gap: "2rem" },
} as const;
