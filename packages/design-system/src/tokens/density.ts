/**
 * Density: one vocabulary for how much room things take, everywhere in
 * Genesis (ADR 0022). The app shell (`AppShell`'s `density`), lists and tables
 * (`useViewSettings`, `DataTable`) and sites' design systems use the same
 * three words: `compact`, `comfortable` and `spacious`.
 *
 * Sites' design systems said `normal` and `generous` first; those still work,
 * as aliases of `comfortable` and `spacious` ({@link resolveDensity}).
 */

/**
 * The three densities, tightest first.
 *
 * @stability Beta
 */
export const DENSITY_LEVELS = ["compact", "comfortable", "spacious"] as const;

/**
 * One density: `compact`, `comfortable` or `spacious`.
 *
 * @stability Beta
 */
export type DensityLevel = (typeof DENSITY_LEVELS)[number];

/** The older words sites' design systems used, and the density each means. */
const ALIASES: Readonly<Record<string, DensityLevel>> = Object.freeze({ normal: "comfortable", generous: "spacious" });

/**
 * A density in the one vocabulary: `compact`, `comfortable` and `spacious` as
 * they are, sites' older `normal` and `generous` as `comfortable` and
 * `spacious`, and anything else as `undefined`.
 *
 * @stability Beta
 */
export function resolveDensity(value: unknown): DensityLevel | undefined {
  if (typeof value !== "string") return undefined;
  if ((DENSITY_LEVELS as readonly string[]).includes(value)) return value as DensityLevel;
  return ALIASES[value];
}
