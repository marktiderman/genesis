/**
 * Appearance preferences, as data (ADR 0024): the values and the order that decides which one
 * applies. No React, so a server, a phone or `workspaces.ts` can use it; the provider is
 * `appearance.tsx`.
 *
 *     app lock  >  person  >  organization default  >  theme default  >  Genesis default
 */

/** Light, dark, or follow the device: the person's appearance. */
export type Appearance = "light" | "dark" | "system";

/** How tightly rows and controls sit. */
export type Density = "compact" | "comfortable" | "spacious";

/** The appearances, in a picker's order. */
export const APPEARANCES: readonly Appearance[] = Object.freeze(["system", "light", "dark"]);
/** The densities, tightest first. */
export const DENSITIES: readonly Density[] = Object.freeze(["compact", "comfortable", "spacious"]);

/** An appearance and a density, either of which may be unset. */
export interface AppearancePreferenceValues {
  appearance?: Appearance | undefined;
  density?: Density | undefined;
}

/** Genesis's own defaults, the last step of the order. */
export const GENESIS_APPEARANCE_DEFAULTS: Readonly<Required<AppearancePreferenceValues>> = Object.freeze({
  appearance: "system",
  density: "comfortable",
});

/** Where a resolved value came from. */
export type AppearancePreferenceSource = "app" | "person" | "organization" | "theme" | "genesis";

/** Each layer of the order; any may be missing. */
export interface AppearancePreferenceLayers {
  /** The app's lock: a value set here can't be changed by anyone below it. */
  lock?: AppearancePreferenceValues | undefined;
  /** The person's own choice. */
  person?: AppearancePreferenceValues | undefined;
  /** The organization's default for its people (`WorkspaceTheme.defaults`). */
  organization?: AppearancePreferenceValues | undefined;
  /** The app theme's default (its layout's density, say). */
  theme?: AppearancePreferenceValues | undefined;
}

/** The values that apply, and where each came from. */
export interface ResolvedAppearancePreferences {
  appearance: Appearance;
  density: Density;
  source: { appearance: AppearancePreferenceSource; density: AppearancePreferenceSource };
}

/** Whether a value is an appearance. */
export const isAppearance = (v: unknown): v is Appearance => v === "light" || v === "dark" || v === "system";
/** Whether a value is a density. */
export const isDensity = (v: unknown): v is Density => v === "compact" || v === "comfortable" || v === "spacious";

/** Only the known values: a stored or typed-in value that isn't one is left out. */
export function toAppearancePreferenceValues(input: unknown): AppearancePreferenceValues {
  if (!input || typeof input !== "object") return {};
  const { appearance, density } = input as Record<string, unknown>;
  return { ...(isAppearance(appearance) ? { appearance } : {}), ...(isDensity(density) ? { density } : {}) };
}

/**
 * The appearance and density that apply: app lock, then the person, then the organization's
 * default, then the theme's, then Genesis's. Values that aren't known appearances or densities
 * are skipped, so a bad stored value falls through to the next layer.
 *
 * @stability Beta
 */
export function resolveAppearancePreferences(layers: AppearancePreferenceLayers): ResolvedAppearancePreferences {
  const order: [AppearancePreferenceSource, AppearancePreferenceValues | undefined][] = [
    ["app", layers.lock],
    ["person", layers.person],
    ["organization", layers.organization],
    ["theme", layers.theme],
    ["genesis", GENESIS_APPEARANCE_DEFAULTS],
  ];
  const pick = <K extends keyof AppearancePreferenceValues>(key: K, valid: (v: unknown) => boolean) => {
    for (const [source, values] of order) {
      const value = values?.[key];
      if (valid(value)) return { value: value as NonNullable<AppearancePreferenceValues[K]>, source };
    }
    return { value: GENESIS_APPEARANCE_DEFAULTS[key] as NonNullable<AppearancePreferenceValues[K]>, source: "genesis" as const };
  };
  const appearance = pick("appearance", isAppearance);
  const density = pick("density", isDensity);
  return {
    appearance: appearance.value as Appearance,
    density: density.value as Density,
    source: { appearance: appearance.source, density: density.source },
  };
}

