/**
 * The font files this package serves itself. No imports: the asset build
 * (`scripts/build-assets.mjs`) reads this table too.
 *
 * Each family is the latin subset, one woff2 per weight, copied at build
 * time from its `@fontsource/<package>` package. Every family is under the
 * SIL Open Font License 1.1; the build keeps each licence beside the files
 * (`dist/assets/fonts/LICENSES.txt`).
 */

export interface SelfHostedFont {
  /** The CSS family name the files declare. */
  family: string;
  /** The `@fontsource/*` package the files come from. */
  package: string;
  /** The weights served. A family with one weight is drawn at that weight for every heading (no faux bold). */
  weights: readonly number[];
}

/** The latin subset's `unicode-range`, so a page in another script falls back to the next font in the stack. */
export const LATIN_UNICODE_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

/** Every self-hosted family, by its font choice id. */
export const SELF_HOSTED_FONTS = Object.freeze({
  inter: { family: "Inter", package: "inter", weights: [400, 500, 600, 700] },
  "dm-sans": { family: "DM Sans", package: "dm-sans", weights: [400, 500, 700] },
  "work-sans": { family: "Work Sans", package: "work-sans", weights: [400, 500, 700] },
  montserrat: { family: "Montserrat", package: "montserrat", weights: [400, 600, 700] },
  poppins: { family: "Poppins", package: "poppins", weights: [400, 600, 700] },
  "space-grotesk": { family: "Space Grotesk", package: "space-grotesk", weights: [400, 500, 700] },
  "source-serif": { family: "Source Serif 4", package: "source-serif-4", weights: [400, 600, 700] },
  merriweather: { family: "Merriweather", package: "merriweather", weights: [400, 700] },
  "playfair-display": { family: "Playfair Display", package: "playfair-display", weights: [400, 600, 700] },
  lora: { family: "Lora", package: "lora", weights: [400, 600, 700] },
  barlow: { family: "Barlow", package: "barlow", weights: [400, 500, 700] },
  "barlow-condensed": { family: "Barlow Condensed", package: "barlow-condensed", weights: [400, 600, 700] },
  oswald: { family: "Oswald", package: "oswald", weights: [400, 500, 700] },
  "roboto-condensed": { family: "Roboto Condensed", package: "roboto-condensed", weights: [400, 500, 700] },
  "bebas-neue": { family: "Bebas Neue", package: "bebas-neue", weights: [400] },
} satisfies Record<string, SelfHostedFont>);

/** The key of one font file (`inter-700`): what the asset table and the renderer name it by. */
export const fontFileKey = (id: string, weight: number): string => `${id}-${weight}`;
