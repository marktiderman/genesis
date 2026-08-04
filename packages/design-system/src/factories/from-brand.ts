/**
 * Cross-platform brand factories — PRD-07 Phase A4.0.
 *
 * Derives a Tailwind v4 web preset AND a NativeWind v5 native theme from a
 * single {@link CanonicalBrand} object. Used by consumer brand packages
 * (@gamify/brand, @acme/brand) so brand authors edit one file and both
 * platforms stay in lockstep.
 *
 * --------------------------------------------------------------------------
 * Architecture (post-spike)
 * --------------------------------------------------------------------------
 *
 * Tailwind v4 + NativeWind v5 BOTH consume CSS `@theme` blocks as their
 * canonical token source. That is the convergence layer:
 *
 *   - {@link tailwindFromBrand} emits a CSS `@theme { ... }` string for web
 *     consumers to import (or paste into their `app/styles/tailwind.css`),
 *     PLUS a legacy v3-shaped JS preset for `@config` back-compat (Tailwind
 *     v4 still loads JS configs via the `@config` directive).
 *
 *   - {@link themeFromBrand} emits the SAME CSS `@theme` block for native
 *     consumers to import in their `global.css` (NativeWind v5 reads it),
 *     PLUS a `variables` map (light/dark) for runtime theme switching via
 *     `<VariableContextProvider>`, PLUS a structured `theme` object for
 *     non-CSS consumers (gradient stops for `expo-linear-gradient`,
 *     shadow shapes for direct `style={{...}}` usage, etc.).
 *
 * The single-config promise holds because both platforms read the same CSS
 * block. Where they genuinely diverge — gradients, shadows, font stacks
 * — the factories normalize the input shape (authored once) into the
 * platform-correct emission shape (web string vs native object).
 *
 * --------------------------------------------------------------------------
 * Divergence axes handled
 * --------------------------------------------------------------------------
 *
 *   - Length units (rem ↔ px): authored as rem strings; native conversion
 *     is `parseFloat(rem) × remRoot` (16 by default).
 *   - Font weights (string-numeric "400" ↔ React Native's `fontWeight`
 *     prop accepting both): emitted as strings on web, kept as strings on
 *     native (RN accepts both).
 *   - Font families (CSS stack ↔ single name + expo-font registration):
 *     authored as `[head, ...fallbacks]`; web joins with ", "; native
 *     uses the head only.
 *   - Shadows (`box-shadow` string ↔ shadowColor/shadowRadius/elevation):
 *     authored as a structured {@link ShadowToken}; web composes the CSS
 *     string; native exposes the structured object plus an `elevation`
 *     fallback for Android.
 *   - Gradients (CSS `linear-gradient(...)` ↔ stops array for
 *     `expo-linear-gradient`): authored as a {@link GradientToken}; web
 *     emits the CSS string; native exposes `colors[]` + `locations[]`.
 *
 * --------------------------------------------------------------------------
 * Escape hatch
 * --------------------------------------------------------------------------
 *
 * `brand.platformOverrides.{web,native}` lets a brand author override any
 * sub-section per platform. Use sparingly — every entry is a single-config
 * promise broken. Example:
 *
 *   brand.platformOverrides = {
 *     native: {
 *       typography: {
 *         fontFamily: { body: ["Oswald-Regular"] }, // expo-font name
 *       },
 *     },
 *     web: {
 *       typography: {
 *         fontFamily: { body: ["Oswald", "system-ui", "sans-serif"] },
 *       },
 *     },
 *   };
 *
 * @see {@link debugBrandPreset} for inspecting the resolved output.
 */

import type {
  CanonicalBrand,
  ColorScale,
  GradientToken,
  PlatformOverridable,
  ShadowToken,
  TypographyTokens,
} from "../schema/brand";

// ---------------------------------------------------------------------------
// Output types.
// ---------------------------------------------------------------------------

/**
 * Output of {@link tailwindFromBrand}. The `css` string is the canonical
 * Tailwind v4 token source; `preset` is a legacy v3-shaped JS object for
 * consumers still using `@config "../tailwind.config.js"` for back-compat.
 */
export interface TailwindBrandOutput {
  /**
   * Tailwind v4 `@theme { ... }` block (without surrounding `@theme` —
   * just the property body, indent-friendly). Consumers paste this into
   * their `app/styles/tailwind.css` or include via `@import`.
   */
  css: string;
  /**
   * Tailwind v3-style preset for back-compat. Pass to a v3 config's
   * `presets: [preset]` array, OR use Tailwind v4's `@config` directive
   * pointing at a tailwind.config.js that exports this object.
   *
   * In Tailwind v4 the preferred path is the `css` field above; this
   * preset is here for consumers in mid-migration.
   */
  preset: {
    theme: {
      extend: {
        colors: Record<string, string | Record<string, string>>;
        fontFamily?: Record<string, string[]>;
        fontSize?: Record<string, string | [string, { lineHeight: string }]>;
        lineHeight?: Record<string, string>;
        fontWeight?: Record<string, string>;
        spacing?: Record<string, string>;
        borderRadius?: Record<string, string>;
        boxShadow?: Record<string, string>;
        backgroundImage?: Record<string, string>;
      };
    };
  };
}

/**
 * Output of {@link themeFromBrand}. Three views of the same brand:
 *
 *  - `css` — same Tailwind v4 `@theme` block as web, for NativeWind v5 to
 *    consume in the consumer's `global.css`.
 *  - `variables.light` / `variables.dark` — flat record of CSS variable
 *    name → value, for `<VariableContextProvider value={...}>` runtime
 *    theme switching.
 *  - `theme` — structured native shapes (gradient stops as arrays,
 *    shadows as React Native style objects, spacing as px numbers) for
 *    consumers who need non-CSS access (e.g. `expo-linear-gradient`'s
 *    `colors` prop, or imperative `Animated.spring` configs).
 */
export interface NativeBrandOutput {
  css: string;
  variables: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  theme: {
    colors: Record<string, string | Record<string, string>>;
    spacing: Record<string, number>;
    radius: Record<string, number>;
    fontSize: Record<string, number>;
    lineHeight: Record<string, number>;
    fontWeight: Record<string, string>;
    fontFamily: Record<string, string>;
    /** React Native `View`-style shadow + Android elevation. */
    shadow: Record<string, NativeShadowStyle>;
    /** Stops + locations for `expo-linear-gradient`. */
    gradient: Record<string, NativeGradientStops>;
  };
}

/**
 * React Native shadow shape — what you spread into a `View`'s `style`.
 * `shadowOpacity` is parsed from the rgba alpha in {@link ShadowToken.color};
 * if `color` lacks alpha (plain hex), opacity defaults to 1.
 */
export interface NativeShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowRadius: number;
  shadowOpacity: number;
  elevation: number;
}

/** Native gradient — feed straight into `<LinearGradient colors locations />`. */
export interface NativeGradientStops {
  colors: string[];
  locations: number[];
  /** Original CSS direction string, useful for deriving start/end vectors. */
  direction: string;
  /**
   * Pre-computed start/end points for `expo-linear-gradient`'s `start`/
   * `end` props (each is `{ x: 0..1, y: 0..1 }`). Defaults to a top-to-
   * bottom gradient for unrecognized direction strings.
   */
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** Options accepted by both factories. */
export interface BrandFactoryOptions {
  /**
   * Pixels per CSS rem. React Native has no rem; the factory multiplies
   * `parseFloat(remString)` by this to derive native px numbers.
   * Default: 16 (browser default + RN convention).
   */
  remRoot?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

/** Multiply rem string by rem-root → px number. */
function remToPx(value: string, remRoot: number): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("rem")) {
    const n = parseFloat(trimmed.slice(0, -3));
    if (Number.isFinite(n)) return Math.round(n * remRoot);
  }
  if (trimmed.endsWith("px")) {
    const n = parseFloat(trimmed.slice(0, -2));
    if (Number.isFinite(n)) return Math.round(n);
  }
  // Bare number — assume px.
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Parse rgba alpha out of `rgba(r,g,b,a)`. Returns 1 if not an rgba. */
function parseAlpha(color: string): number {
  const m = color.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  if (!m) return 1;
  const a = parseFloat(m[1]!);
  return Number.isFinite(a) ? a : 1;
}

/** Strip alpha from rgba → rgb (for native `shadowColor` which expects opaque). */
function stripAlpha(color: string): string {
  const m = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/);
  if (m) return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
  return color;
}

/** Map CSS gradient direction → expo-linear-gradient start/end vectors. */
function directionToVectors(
  direction: string
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const d = direction.trim().toLowerCase();
  switch (d) {
    case "to right":
      return { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
    case "to left":
      return { start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } };
    case "to top":
      return { start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } };
    case "to bottom":
      return { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } };
    case "to bottom right":
      return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
    case "to top right":
      return { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } };
    case "to bottom left":
      return { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } };
    case "to top left":
      return { start: { x: 1, y: 1 }, end: { x: 0, y: 0 } };
    default:
      // Angle ("135deg") or unrecognized — default vertical (top→bottom).
      return { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } };
  }
}

/** Compose `box-shadow: x y blur spread color`. */
function shadowToCss(s: ShadowToken): string {
  const parts = [
    `${s.offsetX}px`,
    `${s.offsetY}px`,
    `${s.blur}px`,
  ];
  if (typeof s.spread === "number") parts.push(`${s.spread}px`);
  parts.push(s.color);
  return parts.join(" ");
}

/** Compose `linear-gradient(direction, color pos%, ...)`. */
function gradientToCss(g: GradientToken): string {
  const stops = g.stops
    .map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
    .join(", ");
  return `linear-gradient(${g.direction}, ${stops})`;
}

/**
 * Merge a `Partial<PlatformOverridable>` into a brand object before
 * factory emission. Returns a NEW brand — never mutates the input.
 */
function applyOverrides(
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

/** Indent a CSS line under `@theme { ... }`. */
function themeLine(name: string, value: string): string {
  return `  ${name}: ${value};`;
}

/**
 * Convert a camelCase extension key to kebab-case for CSS variable emission.
 * `gameMode` → `game-mode`. Schema-required casing is camelCase (validator
 * regex `/^[a-z][a-zA-Z0-9]*$/`); CSS convention is kebab. The brand author
 * writes camelCase; the factory emits kebab so consumer Tailwind utility
 * classes read naturally (`bg-game-mode-solo`, not `bg-gameMode-solo`).
 */
function kebab(camel: string): string {
  return camel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// tailwindFromBrand — web factory.
// ---------------------------------------------------------------------------

/**
 * Derive a Tailwind v4 preset from a {@link CanonicalBrand} config.
 *
 * Returns:
 *  - `css`: Tailwind v4 `@theme` block body. Paste into the consumer's
 *    `app/styles/tailwind.css` between `@theme {` and `}` (or wrap with
 *    {@link wrapAsAtTheme}). All tokens become CSS variables that
 *    Tailwind v4 auto-derives utility classes from.
 *  - `preset`: Tailwind v3-shaped preset (theme.extend.*) for legacy
 *    `@config` consumers.
 *
 * Per PRD-07 A4.0 spike: prefer `css` for v4-native projects.
 */
export function tailwindFromBrand(
  brand: CanonicalBrand,
  options: BrandFactoryOptions = {}
): TailwindBrandOutput {
  const merged = applyOverrides(brand, brand.platformOverrides?.web);
  const lines: string[] = [];
  const presetColors: Record<string, string | Record<string, string>> = {};
  const presetFontFamily: Record<string, string[]> = {};
  const presetFontSize: Record<string, string> = {};
  const presetLineHeight: Record<string, string> = {};
  const presetFontWeight: Record<string, string> = {};
  const presetSpacing: Record<string, string> = {};
  const presetRadius: Record<string, string> = {};
  const presetBoxShadow: Record<string, string> = {};
  const presetBackgroundImage: Record<string, string> = {};

  // ---- Colors --------------------------------------------------------------

  // Neutral ramp.
  for (const [stop, hex] of Object.entries(merged.neutral)) {
    lines.push(themeLine(`--color-neutral-${stop}`, hex));
    presetColors[`neutral-${stop}`] = hex;
  }

  // Universal color scales.
  emitColorScale("surface", merged.surface, lines, presetColors);
  emitColorScale("text", merged.text, lines, presetColors);
  emitColorScale("accent", merged.accent, lines, presetColors);

  // Status.
  for (const [key, scale] of Object.entries(merged.status)) {
    emitColorScale(key, scale, lines, presetColors);
  }

  // Extensions (each is a ColorScale — emit DEFAULT + emphases).
  // Schema mandates camelCase keys; we kebab-case them for CSS-variable
  // emission so consumer utilities read like `bg-game-mode-solo`. The
  // structured `preset.colors` map keeps the original camelCase key —
  // that's what Tailwind's JS-side preset resolver expects.
  if (merged.extensions) {
    for (const [key, scale] of Object.entries(merged.extensions)) {
      // Skip the augment-key index-signature undefineds.
      if (!scale) continue;
      emitColorScale(key, scale as ColorScale, lines, presetColors, {
        cssKey: kebab(key),
      });
    }
  }

  // ---- Typography ---------------------------------------------------------

  if (merged.typography) {
    const t = merged.typography;
    if (t.fontFamily) {
      for (const [key, stack] of Object.entries(t.fontFamily)) {
        // Web emits the joined stack. Quote multi-word entries (`"Space Grotesk"`).
        const joined = stack
          .map((entry) => (entry.includes(" ") ? `"${entry}"` : entry))
          .join(", ");
        lines.push(themeLine(`--font-${key}`, joined));
        presetFontFamily[key] = stack;
      }
    }
    if (t.fontSize) {
      for (const [key, size] of Object.entries(t.fontSize)) {
        lines.push(themeLine(`--text-${key}`, size));
        presetFontSize[key] = size;
      }
    }
    if (t.lineHeight) {
      for (const [key, lh] of Object.entries(t.lineHeight)) {
        lines.push(themeLine(`--text-${key}--line-height`, lh));
        // Mirror to the legacy v3-style preset. CSS emits
        // `--text-<key>--line-height`; the preset path historically dropped
        // these, leaving JS consumers without lineHeight tokens. Emit a
        // matching `lineHeight` map keyed identically to fontSize so
        // tailwind.config.js can extend `lineHeight` directly (and brand
        // authors can also wire fontSize tuples downstream if they prefer).
        presetLineHeight[key] = lh;
      }
    }
    if (t.fontWeight) {
      for (const [key, weight] of Object.entries(t.fontWeight)) {
        lines.push(themeLine(`--font-weight-${key}`, weight));
        presetFontWeight[key] = weight;
      }
    }
  }

  // ---- Spacing & radius ---------------------------------------------------

  if (merged.spacing) {
    for (const [key, value] of Object.entries(merged.spacing)) {
      lines.push(themeLine(`--spacing-${key}`, value));
      presetSpacing[key] = value;
    }
  }
  if (merged.radius) {
    for (const [key, value] of Object.entries(merged.radius)) {
      lines.push(themeLine(`--radius-${key}`, value));
      presetRadius[key] = value;
    }
  }

  // ---- Shadows ------------------------------------------------------------

  if (merged.shadow) {
    for (const [key, token] of Object.entries(merged.shadow)) {
      const css = shadowToCss(token);
      lines.push(themeLine(`--shadow-${key}`, css));
      presetBoxShadow[key] = css;
    }
  }

  // ---- Gradients ----------------------------------------------------------

  if (merged.gradient) {
    for (const [key, token] of Object.entries(merged.gradient)) {
      const css = gradientToCss(token);
      // Tailwind v4 `--gradient-*` isn't a first-class category; emit as a
      // background-image utility via `--background-image-<key>`.
      lines.push(themeLine(`--background-image-${key}`, css));
      presetBackgroundImage[key] = css;
    }
  }

  // Build the fontSize preset entries. When a matching lineHeight exists for
  // the same key, emit the v3-style tuple form `[size, { lineHeight }]` so
  // consumers using the JS preset get the same line-height pairing the CSS
  // path emits via `--text-<key>--line-height`. Standalone (no-pairing)
  // sizes stay as plain strings to keep the preset minimal.
  const fontSizePreset: Record<
    string,
    string | [string, { lineHeight: string }]
  > = {};
  for (const [key, size] of Object.entries(presetFontSize)) {
    const lh = presetLineHeight[key];
    fontSizePreset[key] = lh ? [size, { lineHeight: lh }] : size;
  }

  return {
    css: lines.join("\n"),
    preset: {
      theme: {
        extend: {
          colors: presetColors,
          ...(Object.keys(presetFontFamily).length
            ? { fontFamily: presetFontFamily }
            : {}),
          ...(Object.keys(fontSizePreset).length
            ? { fontSize: fontSizePreset }
            : {}),
          ...(Object.keys(presetLineHeight).length
            ? { lineHeight: presetLineHeight }
            : {}),
          ...(Object.keys(presetFontWeight).length
            ? { fontWeight: presetFontWeight }
            : {}),
          ...(Object.keys(presetSpacing).length
            ? { spacing: presetSpacing }
            : {}),
          ...(Object.keys(presetRadius).length
            ? { borderRadius: presetRadius }
            : {}),
          ...(Object.keys(presetBoxShadow).length
            ? { boxShadow: presetBoxShadow }
            : {}),
          ...(Object.keys(presetBackgroundImage).length
            ? { backgroundImage: presetBackgroundImage }
            : {}),
        },
      },
    },
  };
}

function emitColorScale(
  key: string,
  scale: ColorScale,
  lines: string[],
  presetColors: Record<string, string | Record<string, string>>,
  opts: { cssKey?: string } = {}
): void {
  const cssKey = opts.cssKey ?? key;
  const out: Record<string, string> = {};
  for (const [emphasis, hex] of Object.entries(scale)) {
    if (typeof hex !== "string" || hex.length === 0) continue;
    if (emphasis === "DEFAULT") {
      lines.push(themeLine(`--color-${cssKey}`, hex));
      out.DEFAULT = hex;
    } else {
      lines.push(themeLine(`--color-${cssKey}-${emphasis}`, hex));
      out[emphasis] = hex;
    }
  }
  presetColors[key] = out;
}

// ---------------------------------------------------------------------------
// themeFromBrand — native factory.
// ---------------------------------------------------------------------------

/**
 * Derive a NativeWind v5 theme from a {@link CanonicalBrand} config.
 *
 * Returns:
 *  - `css`: same Tailwind v4 `@theme` body as web. Paste into the
 *    consumer's `apps/<app>/global.css` (NativeWind v5 reads it).
 *  - `variables.{light,dark}`: flat CSS-variable maps for runtime theme
 *    switching via `<VariableContextProvider value={variables.light}>`.
 *  - `theme`: structured native shapes (gradient stops, RN shadow style
 *    objects, px numbers) for non-CSS consumers.
 *
 * Per PRD-07 A4.0 spike: native consumers should import `css` into
 * global.css for compile-time tokens, then use `theme.gradient.*` /
 * `theme.shadow.*` for the imperatives that don't have Tailwind classes.
 */
export function themeFromBrand(
  brand: CanonicalBrand,
  options: BrandFactoryOptions = {}
): NativeBrandOutput {
  const remRoot = options.remRoot ?? 16;
  const merged = applyOverrides(brand, brand.platformOverrides?.native);

  // Re-use tailwindFromBrand for the CSS emission — same `@theme` body.
  // Run on the native-merged brand so platformOverrides.native lands in CSS.
  // CRITICAL: strip `platformOverrides` before re-entering tailwindFromBrand,
  // otherwise it would re-apply `platformOverrides.web` on top of the
  // already-native-merged tokens and the native CSS would silently inherit
  // web overrides. (CodeRabbit MAJOR — PR #19.)
  const tw = tailwindFromBrand(
    { ...merged, platformOverrides: undefined },
    options
  );

  // ---- Flat variables (light + dark) for VariableContextProvider --------

  const lightVars: Record<string, string> = {};
  const darkVars: Record<string, string> = {};

  // Neutral.
  for (const [stop, hex] of Object.entries(merged.neutral)) {
    lightVars[`--color-neutral-${stop}`] = hex;
    darkVars[`--color-neutral-${stop}`] = hex;
  }

  // Universal scales — light/dark variants split.
  fillVarsForScale("surface", merged.surface, lightVars, darkVars);
  fillVarsForScale("text", merged.text, lightVars, darkVars);
  fillVarsForScale("accent", merged.accent, lightVars, darkVars);
  for (const [key, scale] of Object.entries(merged.status)) {
    fillVarsForScale(key, scale, lightVars, darkVars);
  }
  if (merged.extensions) {
    for (const [key, scale] of Object.entries(merged.extensions)) {
      if (!scale) continue;
      // Same kebab convention as tailwindFromBrand.
      fillVarsForScale(kebab(key), scale as ColorScale, lightVars, darkVars);
    }
  }

  // ---- Structured native theme --------------------------------------------

  const themeColors: Record<string, string | Record<string, string>> = {
    ...tw.preset.theme.extend.colors,
  };

  const themeSpacing: Record<string, number> = {};
  if (merged.spacing) {
    for (const [key, value] of Object.entries(merged.spacing)) {
      themeSpacing[key] = remToPx(value, remRoot);
    }
  }

  const themeRadius: Record<string, number> = {};
  if (merged.radius) {
    for (const [key, value] of Object.entries(merged.radius)) {
      themeRadius[key] = remToPx(value, remRoot);
    }
  }

  const themeFontSize: Record<string, number> = {};
  const themeLineHeight: Record<string, number> = {};
  const themeFontWeight: Record<string, string> = {};
  const themeFontFamily: Record<string, string> = {};
  if (merged.typography) {
    const t = merged.typography;
    if (t.fontSize) {
      for (const [key, value] of Object.entries(t.fontSize)) {
        themeFontSize[key] = remToPx(value, remRoot);
      }
    }
    if (t.lineHeight) {
      for (const [key, value] of Object.entries(t.lineHeight)) {
        themeLineHeight[key] = remToPx(value, remRoot);
      }
    }
    if (t.fontWeight) {
      // RN's `fontWeight` style prop accepts both number and numeric
      // string; emit as string (the de-facto convention) so consumers can
      // spread the map directly into a Text style.
      for (const [key, value] of Object.entries(t.fontWeight)) {
        themeFontWeight[key] = value;
      }
    }
    if (t.fontFamily) {
      // Native uses ONLY the head — fallbacks are web-only. Brand author
      // is responsible for `expo-font` registration of the head name.
      for (const [key, stack] of Object.entries(t.fontFamily)) {
        if (stack[0]) themeFontFamily[key] = stack[0];
      }
    }
  }

  const themeShadow: Record<string, NativeShadowStyle> = {};
  if (merged.shadow) {
    for (const [key, token] of Object.entries(merged.shadow)) {
      themeShadow[key] = {
        shadowColor: stripAlpha(token.color),
        shadowOffset: { width: token.offsetX, height: token.offsetY },
        shadowRadius: token.blur,
        shadowOpacity: parseAlpha(token.color),
        elevation:
          typeof token.elevation === "number"
            ? token.elevation
            : Math.max(1, Math.round(token.blur / 2)),
      };
    }
  }

  const themeGradient: Record<string, NativeGradientStops> = {};
  if (merged.gradient) {
    for (const [key, token] of Object.entries(merged.gradient)) {
      const vectors = directionToVectors(token.direction);
      themeGradient[key] = {
        colors: token.stops.map((s) => s.color),
        locations: token.stops.map((s) => s.position),
        direction: token.direction,
        ...vectors,
      };
    }
  }

  return {
    css: tw.css,
    variables: { light: lightVars, dark: darkVars },
    theme: {
      colors: themeColors,
      spacing: themeSpacing,
      radius: themeRadius,
      fontSize: themeFontSize,
      lineHeight: themeLineHeight,
      fontWeight: themeFontWeight,
      fontFamily: themeFontFamily,
      shadow: themeShadow,
      gradient: themeGradient,
    },
  };
}

function fillVarsForScale(
  key: string,
  scale: ColorScale,
  lightVars: Record<string, string>,
  darkVars: Record<string, string>
): void {
  for (const [emphasis, hex] of Object.entries(scale)) {
    if (typeof hex !== "string" || hex.length === 0) continue;
    const varName =
      emphasis === "DEFAULT"
        ? `--color-${key}`
        : `--color-${key}-${emphasis}`;
    // The light/dark contract: if `light` exists use it for light mode and
    // `dark` for dark mode; otherwise fall back to DEFAULT.
    if (emphasis === "light") {
      lightVars[`--color-${key}`] = hex;
    } else if (emphasis === "dark") {
      darkVars[`--color-${key}`] = hex;
    } else if (emphasis === "DEFAULT") {
      // DEFAULT is the always-present base; populate both unless a more
      // specific entry already set them.
      if (!(`--color-${key}` in lightVars)) lightVars[`--color-${key}`] = hex;
      if (!(`--color-${key}` in darkVars)) darkVars[`--color-${key}`] = hex;
    }
    // Always emit the named variant in both maps for direct utility access.
    lightVars[varName] = hex;
    darkVars[varName] = hex;
  }
}

// ---------------------------------------------------------------------------
// debugBrandPreset — A4.1 round-3 utility.
// ---------------------------------------------------------------------------

/**
 * Debug utility — dumps the resolved Tailwind preset and NativeWind theme
 * side-by-side so brand authors can introspect token mis-resolution
 * without reading factory source.
 *
 * Usage in a consumer's `scripts/debug-brand.ts`:
 *
 *   import { debugBrandPreset } from "@marktiderman/genesis-design-system";
 *   import { gamifyBrand } from "../src/brand";
 *   console.log(JSON.stringify(debugBrandPreset(gamifyBrand), null, 2));
 *
 * Per PRD-07 A4.1: ships ~20 LoC; prevents the "factory magic" anti-
 * pattern that bites teams when the preset and the theme disagree.
 */
export function debugBrandPreset(
  brand: CanonicalBrand,
  options: BrandFactoryOptions = {}
): {
  brand: string;
  tailwind: TailwindBrandOutput;
  nativewind: NativeBrandOutput;
  hasPlatformOverrides: { web: boolean; native: boolean };
} {
  return {
    brand: brand.name,
    tailwind: tailwindFromBrand(brand, options),
    nativewind: themeFromBrand(brand, options),
    hasPlatformOverrides: {
      web: Boolean(brand.platformOverrides?.web),
      native: Boolean(brand.platformOverrides?.native),
    },
  };
}

/**
 * Convenience: wrap a `tailwindFromBrand` `css` body in a full `@theme`
 * block. Useful when emitting a complete CSS file rather than splicing
 * into an existing `@theme`.
 */
export function wrapAsAtTheme(cssBody: string): string {
  return `@theme {\n${cssBody}\n}`;
}
