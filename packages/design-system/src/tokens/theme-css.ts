/**
 * Theme CSS renderers — the single variable list behind both generated
 * stylesheets in dist/themes/:
 *
 *   - {brand}.css            `:root` + `.dark` blocks of Shadcn HSL-component
 *                            variables (`--primary: 243 75% 59%`).
 *   - genesis-tailwind4.css  the Tailwind v4 `@theme inline` bridge that maps
 *                            every variable above to a Tailwind theme key
 *                            (`--color-primary: hsl(var(--primary))`).
 *
 * Driven by style-dictionary.config.ts (`pnpm build:tokens:css`). Kept free of
 * file-system access so tests render the exact same output the build writes.
 * Not a tsup entry: build-time only, never shipped as JS.
 */

export interface ThemeBrand {
  name: string;
  /** Primary hue/saturation/lightness (Shadcn HSL components). */
  h: number;
  s: number;
  l: number;
  radius: string;
}

/** Font stacks from tokens/dtcg/typography.json (`font.family.*`). */
export interface FontFamilies {
  sans: string;
  display: string;
  mono: string;
}

export const FONT_FAMILY_KEYS = ["sans", "display", "mono"] as const;

type VarKind = "color" | "radius" | "font";

interface Resolved {
  brand: ThemeBrand;
  primary: string;
  fonts: FontFamilies;
}

type Value = string | ((r: Resolved) => string);

interface ThemeVar {
  name: string;
  kind: VarKind;
  light: Value;
  dark: Value;
}

interface ThemeSection {
  /** Comment above the section in `:root` (none for the core block). */
  comment?: string;
  /** Comment above the section in `.dark`; defaults to `comment`. */
  darkComment?: string;
  vars: ThemeVar[];
}

const primary: Value = (r) => r.primary;
const radius: Value = (r) => r.brand.radius;

function color(name: string, light: Value, dark: Value = light): ThemeVar {
  return { name, kind: "color", light, dark };
}

function font(key: keyof FontFamilies): ThemeVar {
  const value: Value = (r) => r.fonts[key];
  return { name: `font-${key}`, kind: "font", light: value, dark: value };
}

/**
 * Every variable genesis.css declares, in emission order. Light and dark
 * values share one row so a variable can't exist in one mode only.
 */
export const THEME_SECTIONS: readonly ThemeSection[] = [
  {
    vars: [
      color("background", "0 0% 100%", "240 10% 3.9%"),
      color("foreground", "240 10% 3.9%", "0 0% 98%"),
      color("card", "0 0% 100%", "240 10% 3.9%"),
      color("card-foreground", "240 10% 3.9%", "0 0% 98%"),
      color("popover", "0 0% 100%", "240 10% 3.9%"),
      color("popover-foreground", "240 10% 3.9%", "0 0% 98%"),
      color("primary", primary),
      color("primary-foreground", "0 0% 100%", "240 10% 3.9%"),
      color("secondary", "240 4.8% 95.9%", "240 3.7% 15.9%"),
      color("secondary-foreground", "240 5.9% 10%", "0 0% 98%"),
      color("muted", "240 4.8% 95.9%", "240 3.7% 15.9%"),
      color("muted-foreground", "240 3.8% 46.1%", "240 5% 64.9%"),
      color("accent", "240 4.8% 95.9%", "240 3.7% 15.9%"),
      color("accent-foreground", "240 5.9% 10%", "0 0% 98%"),
      color("destructive", "0 84.2% 60.2%", "0 62.8% 30.6%"),
      color("destructive-foreground", "0 0% 98%"),
      color("border", "240 5.9% 90%", "240 3.7% 15.9%"),
      color("input", "240 5.9% 90%", "240 3.7% 15.9%"),
      color("ring", primary),
      { name: "radius", kind: "radius", light: radius, dark: radius },
      color("chart-1", "12 76% 61%", "220 70% 50%"),
      color("chart-2", "173 58% 39%", "160 60% 45%"),
      color("chart-3", "197 37% 24%", "30 80% 55%"),
      color("chart-4", "43 74% 66%", "280 65% 60%"),
      color("chart-5", "27 87% 67%", "340 75% 55%"),
    ],
  },
  {
    comment: "Semantic status colors",
    darkComment: "Semantic status colors (dark)",
    vars: [
      color("success", "160 84.1% 39.4%", "160 84.1% 49%"),
      color("success-foreground", "0 0% 100%"),
      color("warning", "38 92.1% 50.2%"),
      color("warning-foreground", "0 0% 100%"),
      color("info", "217 91.2% 59.8%"),
      color("info-foreground", "0 0% 100%"),
    ],
  },
  {
    comment: "Sidebar",
    vars: [
      color("sidebar-background", "0 0% 98%", "240 5.9% 10%"),
      color("sidebar-foreground", "240 5.3% 26.1%", "240 4.8% 95.9%"),
      color("sidebar-primary", primary),
      color("sidebar-primary-foreground", "0 0% 100%"),
      color("sidebar-accent", "240 4.8% 95.9%", "240 3.7% 15.9%"),
      color("sidebar-accent-foreground", "240 5.9% 10%", "240 4.8% 95.9%"),
      color("sidebar-border", "220 13% 91%", "240 3.7% 15.9%"),
      color("sidebar-ring", primary),
    ],
  },
  {
    comment: "Typography",
    vars: FONT_FAMILY_KEYS.map(font),
  },
];

/**
 * Tailwind theme key for a color variable, where it differs from the
 * variable name. Shadcn's sidebar surface is `--sidebar-background`, but the
 * utility is `bg-sidebar`.
 */
const TAILWIND_COLOR_ALIASES: Readonly<Record<string, string>> = {
  "sidebar-background": "sidebar",
};

/**
 * Normalize a font stack: double-quote multi-word family names
 * (`Space Grotesk` or `'Space Grotesk'` → `"Space Grotesk"`); single-word
 * names and generic keywords stay bare. Accepts a DTCG array or a
 * comma-separated string, and is idempotent, so Style Dictionary's
 * `fontFamily/css` output and the raw token value render identically.
 */
export function formatFontStack(stack: string | readonly string[]): string {
  const entries = typeof stack === "string" ? stack.split(",") : stack;
  return entries
    .map((entry) => entry.trim().replace(/^(["'])(.*)\1$/, "$2"))
    .filter(Boolean)
    .map((entry) => (/\s/.test(entry) ? `"${entry}"` : entry))
    .join(", ");
}

/** A token as Style Dictionary hands it to a format (or as read from DTCG JSON). */
export interface FontToken {
  path: readonly string[];
  $value?: unknown;
  value?: unknown;
}

/**
 * Pick `font.family.{sans,display,mono}` out of a token list. The build passes
 * `dictionary.allTokens`, so aliases are already resolved.
 */
export function fontFamiliesFromTokens(tokens: readonly FontToken[]): FontFamilies {
  const out = {} as FontFamilies;
  for (const key of FONT_FAMILY_KEYS) {
    const token = tokens.find(
      (t) => t.path.length === 3 && t.path[0] === "font" && t.path[1] === "family" && t.path[2] === key
    );
    const value = token?.$value ?? token?.value;
    const isStack =
      (typeof value === "string" && value.trim() !== "") ||
      (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string"));
    if (!isStack) {
      throw new Error(
        `[theme-css] typography tokens are missing font.family.${key} (a font stack string or array).`
      );
    }
    out[key] = formatFontStack(value as string | string[]);
  }
  return out;
}

/** Same as {@link fontFamiliesFromTokens}, from a parsed typography.json. */
export function fontFamiliesFromDtcg(doc: unknown): FontFamilies {
  const family = (doc as { font?: { family?: Record<string, { $value?: unknown }> } })
    ?.font?.family ?? {};
  return fontFamiliesFromTokens(
    Object.entries(family).map(([key, token]) => ({
      path: ["font", "family", key],
      $value: token?.$value,
    }))
  );
}

function resolve(value: Value, r: Resolved): string {
  return typeof value === "function" ? value(r) : value;
}

function renderBlock(selector: string, mode: "light" | "dark", r: Resolved): string {
  const sections = THEME_SECTIONS.map((section) => {
    const comment = mode === "dark" ? section.darkComment ?? section.comment : section.comment;
    const lines = section.vars.map((v) => `  --${v.name}: ${resolve(v[mode], r)};`);
    return comment ? [`  /* ${comment} */`, ...lines].join("\n") : lines.join("\n");
  });
  return `${selector} {\n${sections.join("\n\n")}\n}\n`;
}

/** Render dist/themes/{brand}.css. */
export function renderThemeCss(brand: ThemeBrand, fonts: FontFamilies): string {
  const { h, s, l } = brand;
  const darkL = Math.min(l + 10, 80);
  const light: Resolved = { brand, fonts, primary: `${h} ${s}% ${l}%` };
  const dark: Resolved = { brand, fonts, primary: `${h} ${s}% ${darkL}%` };

  return `/**
 * ${brand.name} theme — generated by Style Dictionary from DTCG tokens.
 * Do not edit by hand. Run: pnpm build:tokens
 */

${renderBlock(":root", "light", light)}
${renderBlock(".dark", "dark", dark)}`;
}

/** Render dist/themes/genesis-tailwind4.css. Brand-agnostic: it maps variables only. */
export function renderTailwind4Bridge(): string {
  const lines: string[] = [];
  for (const section of THEME_SECTIONS) {
    for (const v of section.vars) {
      switch (v.kind) {
        case "color": {
          const key = TAILWIND_COLOR_ALIASES[v.name] ?? v.name;
          lines.push(`  --color-${key}: hsl(var(--${v.name}));`);
          break;
        }
        case "radius":
          lines.push(
            `  --radius-sm: calc(var(--radius) - 4px);`,
            `  --radius-md: calc(var(--radius) - 2px);`,
            `  --radius-lg: var(--radius);`,
            `  --radius-xl: calc(var(--radius) + 4px);`
          );
          break;
        case "font":
          lines.push(`  --${v.name}: var(--${v.name});`);
          break;
      }
    }
  }

  return `/**
 * Genesis → Tailwind v4 bridge — generated from the same variable list as
 * genesis.css. Do not edit by hand. Run: pnpm build:tokens
 *
 * Usage (order matters):
 *   @import "tailwindcss";
 *   @import "@marktiderman/genesis-design-system/themes/genesis.css";
 *   @import "@marktiderman/genesis-design-system/themes/genesis-tailwind4.css";
 *
 * \`inline\` makes utilities read the Genesis variables directly
 * (\`bg-primary\` → \`hsl(var(--primary))\`), so a \`.dark\` class or a brand
 * override switches them at runtime.
 *
 * Overriding fonts or colors: genesis.css declares its variables in an
 * unlayered \`:root\`, which beats anything Tailwind puts in \`@layer theme\`.
 * Set app overrides in an unlayered \`:root { --font-sans: ...; }\` after these
 * imports, not inside \`@theme\`.
 */

@custom-variant dark (&:is(.dark *));

@theme inline {
${lines.join("\n")}
}
`;
}
