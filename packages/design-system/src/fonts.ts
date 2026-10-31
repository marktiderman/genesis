/**
 * The fonts a brand may choose, and the files behind them.
 *
 * Every family but `system` is served by the app itself (genesis-sites serves
 * the latin woff2 files under `/_gs/`); none loads from a third party. Each
 * family is under the SIL Open Font License 1.1.
 *
 * This list moved here from genesis-sites so design systems can read a font's
 * class (its weight, tracking and case rules). The files are still built and
 * served by genesis-sites (`scripts/build-assets.mjs` copies them from the
 * `@fontsource/*` packages named below), so a new family needs both: an entry
 * here and the `@fontsource` package in genesis-sites' devDependencies.
 *
 * No imports: the sites asset build bundles this file on its own.
 */

/** How a family is drawn at display sizes: design systems set weight, tracking and case per class. */
export const FONT_CLASSES = ["grotesk", "geometric", "condensed", "serif", "mono"] as const;
export type FontClass = (typeof FONT_CLASSES)[number];

export interface SelfHostedFont {
  /** The CSS family name the files declare. */
  family: string;
  /** The `@fontsource/*` package the files come from. */
  package: string;
  /** The weights served. A family with one weight is drawn at that weight for every heading (no faux bold). */
  weights: readonly number[];
  /** Its class, for a design system's type rules. */
  class: FontClass;
}

/** The latin subset's `unicode-range`, so a page in another script falls back to the next font in the stack. */
export const LATIN_UNICODE_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

/** Every self-hosted family, by its font choice id. */
export const SELF_HOSTED_FONTS = Object.freeze({
  inter: { family: "Inter", package: "inter", weights: [400, 500, 600, 700], class: "grotesk" },
  "dm-sans": { family: "DM Sans", package: "dm-sans", weights: [400, 500, 700], class: "grotesk" },
  "work-sans": { family: "Work Sans", package: "work-sans", weights: [400, 500, 700], class: "grotesk" },
  montserrat: { family: "Montserrat", package: "montserrat", weights: [400, 600, 700], class: "geometric" },
  poppins: { family: "Poppins", package: "poppins", weights: [400, 600, 700], class: "geometric" },
  "space-grotesk": { family: "Space Grotesk", package: "space-grotesk", weights: [400, 500, 700], class: "grotesk" },
  "source-serif": { family: "Source Serif 4", package: "source-serif-4", weights: [400, 600, 700], class: "serif" },
  merriweather: { family: "Merriweather", package: "merriweather", weights: [400, 700], class: "serif" },
  "playfair-display": { family: "Playfair Display", package: "playfair-display", weights: [400, 600, 700], class: "serif" },
  lora: { family: "Lora", package: "lora", weights: [400, 600, 700], class: "serif" },
  barlow: { family: "Barlow", package: "barlow", weights: [400, 500, 700], class: "grotesk" },
  "barlow-condensed": { family: "Barlow Condensed", package: "barlow-condensed", weights: [400, 600, 700], class: "condensed" },
  oswald: { family: "Oswald", package: "oswald", weights: [400, 500, 700], class: "condensed" },
  "roboto-condensed": { family: "Roboto Condensed", package: "roboto-condensed", weights: [400, 500, 700], class: "condensed" },
  "bebas-neue": { family: "Bebas Neue", package: "bebas-neue", weights: [400], class: "condensed" },
} satisfies Record<string, SelfHostedFont>);

/** The key of one font file (`inter-700`): what the asset table and the renderer name it by. */
export const fontFileKey = (id: string, weight: number): string => `${id}-${weight}`;

/** Every font choice id, `system` first. */
export const FONT_IDS = [
  "system",
  "inter",
  "dm-sans",
  "work-sans",
  "montserrat",
  "poppins",
  "space-grotesk",
  "source-serif",
  "merriweather",
  "playfair-display",
  "lora",
  "barlow",
  "barlow-condensed",
  "oswald",
  "roboto-condensed",
  "bebas-neue",
] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface FontInfo {
  /** The choice's id (`inter`). */
  id: FontId;
  label: string;
  /** The CSS font stack. */
  stack: string;
  /** The family the app serves itself, when it isn't a system font. */
  family?: string;
  /** The weights served. Empty for a system font. */
  weights: readonly number[];
  /** A display face with one weight: a heading font only. */
  headingOnly?: boolean;
  /** Its class, for a design system's type rules. */
  class: FontClass;
}

const sans = (family: string) => `${family.includes(" ") ? `"${family}"` : family}, ui-sans-serif, system-ui, sans-serif`;
const serif = (family: string) => `${family.includes(" ") ? `"${family}"` : family}, Georgia, serif`;

function served(id: Exclude<FontId, "system">, label: string, stack: (family: string) => string): FontInfo {
  const font: SelfHostedFont = SELF_HOSTED_FONTS[id];
  return { id, label, stack: stack(font.family), family: font.family, weights: font.weights, class: font.class, ...(font.weights.length === 1 ? { headingOnly: true } : {}) };
}

/** The fonts a brand may choose. Every one but `system` is self-hosted. */
export const FONT_CHOICES: Readonly<Record<FontId, FontInfo>> = Object.freeze({
  system: { id: "system", label: "System", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weights: [], class: "grotesk" },
  inter: served("inter", "Inter", sans),
  "dm-sans": served("dm-sans", "DM Sans", sans),
  "work-sans": served("work-sans", "Work Sans", sans),
  montserrat: served("montserrat", "Montserrat", sans),
  poppins: served("poppins", "Poppins", sans),
  "space-grotesk": served("space-grotesk", "Space Grotesk", sans),
  "source-serif": served("source-serif", "Source Serif", serif),
  merriweather: served("merriweather", "Merriweather", serif),
  "playfair-display": served("playfair-display", "Playfair Display", serif),
  lora: served("lora", "Lora", serif),
  barlow: served("barlow", "Barlow", sans),
  "barlow-condensed": served("barlow-condensed", "Barlow Condensed", sans),
  oswald: served("oswald", "Oswald", sans),
  "roboto-condensed": served("roboto-condensed", "Roboto Condensed", sans),
  "bebas-neue": served("bebas-neue", "Bebas Neue", (family) => `"${family}", Impact, ui-sans-serif, sans-serif`),
});

/**
 * The font choice a font stack starts with (`["Bebas Neue", "Impact", …]` or
 * `"\"Bebas Neue\", Impact"`), when it is one of `FONT_CHOICES`.
 */
export function fontForStack(stack: string | readonly string[] | undefined): FontInfo | undefined {
  if (!stack) return undefined;
  const head = (typeof stack === "string" ? stack.split(",")[0] : stack[0])?.trim().replace(/^["']|["']$/g, "");
  if (!head) return undefined;
  return Object.values(FONT_CHOICES).find((f) => f.family === head || f.id === head);
}
