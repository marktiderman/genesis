/**
 * Canonical Genesis brand schema.
 *
 * Genesis is brand-agnostic: this module defines the shape every consumer's
 * brand package must satisfy, plus the typed `extensions` slot where
 * consumers declare domain-specific color scales (rank, game-mode,
 * flow-template, etc.) without forking Genesis or mutating the canonical
 * categories (per PRD-07 D8 — revised).
 *
 * Universal categories (always present): `neutral`, `surface`, `text`,
 * `accent`, `status`. Anything brand-domain-specific (e.g. Gamify gold/
 * silver/bronze ranks, Acme flow-template colors) lives under
 * `extensions[<key>]: ColorScale`.
 *
 * Consumer apps get autocomplete on their custom extension keys via TS
 * declaration merging on the {@link BrandExtensions} interface — see
 * "Declaration-merging pattern" below.
 *
 * --------------------------------------------------------------------------
 * Declaration-merging pattern (consumer side)
 * --------------------------------------------------------------------------
 *
 * In `@<consumer>/brand/src/types.d.ts`:
 *
 *   import type { ColorScale } from "@marktiderman/genesis-design-system";
 *
 *   declare module "@marktiderman/genesis-design-system" {
 *     interface BrandExtensions {
 *       gameMode: ColorScale;   // Gamify-only
 *       rank: ColorScale;       // Gamify gold/silver/bronze leaderboard tier
 *     }
 *   }
 *
 * After this declaration, `brand.extensions.gameMode` is fully typed at
 * every callsite that imports the brand package.
 *
 * --------------------------------------------------------------------------
 * Naming convention
 * --------------------------------------------------------------------------
 *
 * - Extension keys are camelCase.
 * - Single-domain keys (`rank`, `gameMode`, `flowTemplate`) need no prefix —
 *   they're domain-tagged enough to read clearly at the callsite.
 * - When two consumers will plausibly want the same key with different
 *   values (e.g. both define `priority`), prefix with the consumer name:
 *   `gamifyPriority`, `acmePriority`. Collision is the trigger;
 *   speculative prefixing pollutes the namespace.
 * - The `brand-genesis` OOTB fallback declares NO extensions — it is the
 *   reference brand-agnostic preset (per PRD-07 D2).
 *
 * --------------------------------------------------------------------------
 * When to use extensions vs. ask Genesis to absorb a new core category
 * --------------------------------------------------------------------------
 *
 * Extensions are for **brand-domain** categories — gamification ranks, game
 * modes, flow templates, app-specific status emphases. If a category turns
 * out to be **universal** (every consumer would re-declare an identical-shape
 * extension under the same key), open a Genesis PR proposing it as a core
 * scale instead. Threshold: 2+ consumers shipping the same extension key
 * with the same shape for 2+ consecutive minor versions.
 */

/** Rem-based length pattern shared with brand.schema.json. Matches "0", "1rem", "0.5rem", etc. */
const LENGTH_REGEX = /^(?:0|\d+(?:\.\d+)?rem)$/;

// ---------------------------------------------------------------------------
// ColorScale: the shape of every entry in `extensions`.
// ---------------------------------------------------------------------------

/**
 * A semantic color scale. Every brand-extension entry is a `ColorScale`.
 *
 * `DEFAULT` is required — it's the value `bg-<key>` resolves to without a
 * suffix. `light` / `dark` are the conventional emphasis pair; anything
 * else is brand-author discretion (e.g. Gamify ranks `gold` / `silver` /
 * `bronze` are themselves separate `ColorScale` entries on `extensions.rank`,
 * NOT extra keys on a single `ColorScale`).
 */
export interface ColorScale {
  DEFAULT: string;
  light?: string;
  dark?: string;
  /**
   * Additional emphasis stops are allowed but discouraged — prefer creating
   * a new extension key over piling stops onto an existing one.
   */
  [emphasis: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// BrandExtensions: the merge surface consumers augment.
// ---------------------------------------------------------------------------

/**
 * Open-ended interface that consumer brand packages augment via TypeScript
 * declaration merging. See module doc-comment for the pattern.
 *
 * The empty interface is intentional — Genesis ships no canonical
 * extensions of its own. Every member is contributed by a consumer brand
 * package. When TypeScript merges the consumer's `declare module` augments
 * into this interface, the keys become typed properties of
 * `CanonicalBrand['extensions']`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BrandExtensions {
  // intentionally empty — augmented by consumer brand packages
}

// ---------------------------------------------------------------------------
// CanonicalBrand: the full shape every brand package emits.
// ---------------------------------------------------------------------------

/**
 * The canonical brand-token shape. Universal categories are required;
 * `extensions` is optional and consumer-declared.
 *
 * Universal categories (rationale per PRD-07 A2.7): every shipped consumer
 * needs them, every Genesis primitive consumes them, and they translate 1:1
 * across web/native. Anything that doesn't pass that test is an extension.
 *
 * **Validation contract only** (until PRD-07 Phase A2b): `CanonicalBrand` is
 * the authoritative compile-time + JSON-Schema validation contract for
 * `@<consumer>/brand` packages. It is NOT yet consumed by
 * `GenesisThemeProvider` at runtime — the provider still resolves brand
 * primaries via the hex-string `primary` prop in v0.2.0, while themeable
 * surfaces use the legacy HSL-based `ThemeConfig`. Phase A2b unifies these
 * three representations behind a single runtime path; until then,
 * `CanonicalBrand` only flows through validation and tooling (Genesis
 * `doctor`, CI brand-package lint), not through render-time theme
 * resolution. See MIGRATION.md for the consumer migration timeline.
 *
 * **PRD-07 A4.0 spike (2026-05-03):** typography / spacing / radius /
 * shadow / gradient / platformOverrides slots ADDED as optional fields.
 * Rationale: the `tailwindFromBrand()` + `themeFromBrand()` factories
 * (packages/design-system/src/factories/from-brand.ts) require these to
 * derive Tailwind v4 + NativeWind v5 token shapes from a single config.
 * Color-only brand authors (today's contract) keep working — the new
 * fields are optional. The escape hatch (`platformOverrides`) lets brand
 * authors override one tone web-only or native-only when the universal
 * value can't bridge. See research/a4-0-cross-platform-factory-spike.md.
 */
export interface CanonicalBrand {
  /** Brand identifier — kebab-case, e.g. "genesis", "gamify". */
  name: string;
  /** Neutral grayscale ramp (50–900). */
  neutral: Record<string, string>;
  /** Background / card / popover surfaces. */
  surface: ColorScale;
  /** Foreground / muted-foreground text. */
  text: ColorScale;
  /** Brand primary + accents. */
  accent: ColorScale;
  /** Cross-brand status semantics: success / warning / error / info. */
  status: {
    success: ColorScale;
    warning: ColorScale;
    error: ColorScale;
    info: ColorScale;
  };
  /**
   * Optional consumer-domain extensions.
   *
   * Type-safe access requires consumer-side declaration merging on
   * {@link BrandExtensions} — each consumer brand package declares the
   * exact shape of its own extension keys (single `ColorScale` for
   * flat scales like `rank`, or nested `Record<string, ColorScale>` for
   * grouped scales like Acme's `flowTemplate`).
   *
   * The fallback index signature is `Record<string, unknown>` rather
   * than `Record<string, ColorScale>` so consumer declaration-merges
   * for nested-ColorScale extensions don't conflict with this base
   * type. Consumers that haven't declared their extension shape get
   * `unknown` and must narrow before use — same safety, more flexible
   * shape.
   */
  extensions?: BrandExtensions & Record<string, unknown>;

  /**
   * Optional typography tokens. Per PRD-07 A4.0, typography is brand-
   * authored (Gamify chooses Oswald, Acme chooses Geist) but renders
   * platform-correctly via the factories: web gets a font-stack string,
   * native gets the head family (consumer is responsible for expo-font
   * registration). See {@link TypographyTokens}.
   */
  typography?: TypographyTokens;

  /**
   * Optional spacing scale (semantic keys → length values).
   *
   * Authored as **rem strings** (web-canonical: `"0.5rem"`, `"1rem"`).
   * `themeFromBrand()` converts each entry to **px numbers** for native
   * (16px root assumption — RN's de facto convention). The factory's
   * `remRoot` option lets brand authors override the px-per-rem ratio.
   */
  spacing?: Record<string, string>;

  /**
   * Optional border-radius scale. Same rem→px conversion as spacing.
   */
  radius?: Record<string, string>;

  /**
   * Optional shadow tokens. Defined platform-correctly: web consumes the
   * `boxShadow` string; native consumes the structured object. Both are
   * authored together so a brand author edits one place per shadow tier.
   * See {@link ShadowToken}.
   */
  shadow?: Record<string, ShadowToken>;

  /**
   * Optional gradient tokens. Defined as a stops array (color + position);
   * web emits a `linear-gradient(...)` CSS string, native consumers feed
   * the stops into `react-native-linear-gradient` / `expo-linear-gradient`.
   * See {@link GradientToken}.
   */
  gradient?: Record<string, GradientToken>;

  /**
   * **Escape hatch** (per PRD-07 A4.0 spike).
   *
   * When a single value can't bridge web ↔ native — e.g. native needs a
   * different Oswald font name than web's Google-Fonts stack, or web wants
   * an OKLCH color but native needs hex — declare the override under
   * `platformOverrides.web` or `platformOverrides.native`. The factory
   * applies the override at emission time:
   *
   *   - `tailwindFromBrand()` merges `platformOverrides.web` over the
   *     universal value before emitting CSS.
   *   - `themeFromBrand()` merges `platformOverrides.native` over the
   *     universal value before emitting the runtime theme.
   *
   * Use sparingly — every entry here is a single-config promise broken.
   * Track usage; if 50%+ of a brand's tokens land in `platformOverrides`,
   * the spike's "single-config" verdict no longer holds for that brand.
   */
  platformOverrides?: {
    web?: Partial<PlatformOverridable>;
    native?: Partial<PlatformOverridable>;
  };
}

// ---------------------------------------------------------------------------
// Typography tokens (PRD-07 A4.0 — optional; lives on CanonicalBrand).
// ---------------------------------------------------------------------------

/**
 * Typography tokens. Designed for cross-platform fidelity:
 *
 * - `fontFamily.body = ["Oswald", "system-ui", "sans-serif"]` (array of
 *   stack entries). Web emits the comma-joined CSS font stack. Native
 *   uses the **head** entry (`"Oswald"`); consumer is responsible for
 *   loading via expo-font. The fallbacks are web-only.
 *
 * - `fontWeight` values are **string-numeric** (`"400"`, `"700"`) per
 *   CSS contract. Web emits the string; native converts to number for
 *   React Native's `fontWeight` style prop (which accepts `"400"` or
 *   `400` interchangeably).
 *
 * - `fontSize` values are **rem strings** for web; native converts to
 *   px numbers (×16 by default). `lineHeight` follows the same rule.
 */
export interface TypographyTokens {
  /** Font family stacks. Each value is `[head, ...fallbacks]`. */
  fontFamily?: Record<string, string[]>;
  /** Font sizes — rem strings on web, converted to px on native. */
  fontSize?: Record<string, string>;
  /** Line heights — same rem-to-px conversion as fontSize. */
  lineHeight?: Record<string, string>;
  /** Font weights — string-numeric (`"400"`, `"700"`). */
  fontWeight?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Shadow token (PRD-07 A4.0 — author one, emit two).
// ---------------------------------------------------------------------------

/**
 * Shadow token. Authored once, emitted platform-correctly:
 *
 *   {
 *     offsetX: 0,           // px
 *     offsetY: 4,           // px
 *     blur: 12,             // px
 *     spread: 0,            // px (web-only; native ignores)
 *     color: "rgba(0,0,0,0.4)",
 *     elevation: 4,         // Android-only material elevation
 *   }
 *
 * Web emits `box-shadow: 0 4px 12px 0 rgba(0,0,0,0.4)`.
 * Native iOS reads `shadowColor`, `shadowOffset`, `shadowRadius`,
 * `shadowOpacity` (parsed from rgba alpha).
 * Native Android reads `elevation` (falls back to `blur` if unset).
 */
export interface ShadowToken {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread?: number;
  color: string;
  /**
   * Android material elevation. Defaults to `blur / 2` rounded if unset
   * (sensible approximation of the visual weight).
   */
  elevation?: number;
}

// ---------------------------------------------------------------------------
// Gradient token (PRD-07 A4.0 — stops author once, emit two).
// ---------------------------------------------------------------------------

/**
 * Gradient token. Defined as a directional stops array:
 *
 *   {
 *     direction: "to bottom right",   // CSS direction OR angle "135deg"
 *     stops: [
 *       { color: "#0F172A", position: 0 },
 *       { color: "#1E293B", position: 0.5 },
 *       { color: "#334155", position: 1 },
 *     ],
 *   }
 *
 * Web emits `linear-gradient(to bottom right, #0F172A 0%, ...)`.
 * Native consumers feed `stops` into `expo-linear-gradient` /
 * `react-native-linear-gradient` via the `colors` + `locations` props.
 * The factory normalizes both: see `themeFromBrand().gradients`.
 */
export interface GradientToken {
  /** CSS direction ("to right", "to bottom"…) or angle ("135deg"). */
  direction: string;
  stops: Array<{ color: string; position: number }>;
}

// ---------------------------------------------------------------------------
// Platform-override surface (PRD-07 A4.0 escape hatch).
// ---------------------------------------------------------------------------

/**
 * The fields that can be overridden per-platform. This is a structural
 * subset of CanonicalBrand — only the categories where divergence is
 * realistic. Brand authors don't need to override `name` or `status`
 * keys; those translate cleanly. They DO sometimes need to override
 * `accent.DEFAULT` (e.g. web uses an OKLCH color, native uses hex
 * because RN doesn't yet support OKLCH).
 */
export interface PlatformOverridable {
  surface: Partial<ColorScale>;
  text: Partial<ColorScale>;
  accent: Partial<ColorScale>;
  typography: TypographyTokens;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, ShadowToken>;
  gradient: Record<string, GradientToken>;
}

// ---------------------------------------------------------------------------
// Runtime guards / validators.
// ---------------------------------------------------------------------------

/**
 * Type guard: returns true when `value` looks like a `ColorScale`.
 *
 * Genesis primitives never call this at render time (the schema is
 * compile-time enforced); this is for the `validateBrand` validator and
 * for consumer brand packages that load tokens from JSON at runtime.
 */
export function isColorScale(value: unknown): value is ColorScale {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.DEFAULT !== "string" || v.DEFAULT.length === 0) return false;
  for (const key of Object.keys(v)) {
    if (typeof v[key] !== "string" && v[key] !== undefined) return false;
  }
  return true;
}

/**
 * Allowed top-level keys on a `CanonicalBrand`. Used by `validateBrand`
 * to reject unknown properties — matches the JSON Schema's
 * `additionalProperties: false`.
 */
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "name",
  "neutral",
  "surface",
  "text",
  "accent",
  "status",
  "extensions",
  // PRD-07 A4.0 — optional cross-platform factory inputs.
  "typography",
  "spacing",
  "radius",
  "shadow",
  "gradient",
  "platformOverrides",
]);

const ALLOWED_STATUS_KEYS = new Set([
  "success",
  "warning",
  "error",
  "info",
]);

/**
 * Result returned by {@link validateBrand}.
 */
export interface BrandValidationResult {
  ok: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// PRD-07 A4.0 — per-key shape validators (CodeRabbit MAJOR fix on PR #19).
//
// Previously the new A4.0 keys (typography / spacing / radius / shadow /
// gradient / platformOverrides) were allowed by ALLOWED_TOP_LEVEL_KEYS but
// their shapes were not validated, so malformed payloads slipped through
// validateBrand() and reached the factories at runtime. Each helper below
// mirrors the JSON Schema constraints in brand.schema.json so the runtime
// path matches the Ajv path.
// ---------------------------------------------------------------------------

/** True for plain objects (not arrays, not null, not primitives). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Numeric-hundreds pattern shared with the JSON Schema (`/^[1-9]00$/`). */
const FONT_WEIGHT_PATTERN = /^[1-9]00$/;

/** Validate a `Record<string, string>` (any non-empty string value). */
function validateStringRecord(
  value: unknown,
  path: string
): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object map of string values`);
    return errors;
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string" || v.length === 0) {
      errors.push(`${path}.${k}: expected non-empty string`);
    }
  }
  return errors;
}

/**
 * Validate a `Record<string, string>` where every value must match the
 * shared rem-based length pattern (LENGTH_REGEX). Used for spacing,
 * radius, fontSize, lineHeight — all of which are authored as rem on
 * web and converted to px on native by themeFromBrand().
 */
function validateLengthRecord(
  value: unknown,
  path: string
): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object map of rem-length string values`);
    return errors;
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string" || v.length === 0) {
      errors.push(`${path}.${k}: expected non-empty string`);
      continue;
    }
    if (!LENGTH_REGEX.test(v)) {
      errors.push(
        `${path}.${k}: expected rem length matching ${LENGTH_REGEX} (e.g., "1rem", "0.5rem", "0")`
      );
    }
  }
  return errors;
}

/** Validate the `typography` block (or partial under platformOverrides). */
function validateTypography(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object`);
    return errors;
  }
  const t = value;
  if (t.fontFamily !== undefined) {
    if (!isPlainObject(t.fontFamily)) {
      errors.push(`${path}.fontFamily: expected object`);
    } else {
      for (const [k, v] of Object.entries(t.fontFamily)) {
        // Canonical TypographyTokens.fontFamily is `Record<string, string[]>`
        // (font-family stack). Bare-string convenience form is NOT accepted;
        // brand authors must declare an array even for a single family.
        if (!Array.isArray(v) || v.length === 0) {
          errors.push(
            `${path}.fontFamily.${k}: expected string[] (font family stack)`
          );
          continue;
        }
        for (const entry of v) {
          if (typeof entry !== "string" || entry.length === 0) {
            errors.push(
              `${path}.fontFamily.${k}: every stack entry must be a non-empty string`
            );
            break;
          }
        }
      }
    }
  }
  if (t.fontSize !== undefined) {
    if (!isPlainObject(t.fontSize)) {
      errors.push(`${path}.fontSize: expected object`);
    } else {
      for (const [k, v] of Object.entries(t.fontSize)) {
        // Canonical TypographyTokens.fontSize is `Record<string, string>`
        // — a rem-length string. The v3-style `[size, { lineHeight }]`
        // tuple form is the OUTPUT shape produced by tailwindFromBrand()
        // for back-compat presets, NOT a valid INPUT shape.
        if (typeof v !== "string" || v.length === 0) {
          errors.push(
            `${path}.fontSize.${k}: expected rem length string (e.g., "1rem")`
          );
          continue;
        }
        if (!LENGTH_REGEX.test(v)) {
          errors.push(
            `${path}.fontSize.${k}: expected rem length matching ${LENGTH_REGEX} (e.g., "1rem", "0.5rem", "0")`
          );
        }
      }
    }
  }
  if (t.lineHeight !== undefined) {
    errors.push(...validateLengthRecord(t.lineHeight, `${path}.lineHeight`));
  }
  if (t.fontWeight !== undefined) {
    if (!isPlainObject(t.fontWeight)) {
      errors.push(`${path}.fontWeight: expected object`);
    } else {
      for (const [k, v] of Object.entries(t.fontWeight)) {
        if (typeof v !== "string" || !FONT_WEIGHT_PATTERN.test(v)) {
          errors.push(
            `${path}.fontWeight.${k}: expected numeric-hundreds string (e.g. "400", "700")`
          );
        }
      }
    }
  }
  return errors;
}

/** Validate a single ShadowToken shape. */
function validateShadowToken(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object`);
    return errors;
  }
  const s = value;
  for (const k of ["offsetX", "offsetY", "blur"] as const) {
    if (typeof s[k] !== "number" || !Number.isFinite(s[k] as number)) {
      errors.push(`${path}.${k}: expected finite number`);
    }
  }
  if (typeof s.blur === "number" && (s.blur as number) < 0) {
    errors.push(`${path}.blur: must be >= 0`);
  }
  if (s.spread !== undefined && typeof s.spread !== "number") {
    errors.push(`${path}.spread: expected number when present`);
  }
  if (typeof s.color !== "string" || (s.color as string).length === 0) {
    errors.push(`${path}.color: expected non-empty string`);
  }
  if (s.elevation !== undefined) {
    if (typeof s.elevation !== "number" || (s.elevation as number) < 0) {
      errors.push(`${path}.elevation: expected non-negative number`);
    }
  }
  return errors;
}

/** Validate `Record<string, ShadowToken>`. */
function validateShadowMap(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object map of ShadowToken`);
    return errors;
  }
  for (const [k, v] of Object.entries(value)) {
    errors.push(...validateShadowToken(v, `${path}.${k}`));
  }
  return errors;
}

/** Validate a single GradientToken shape. */
function validateGradientToken(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object`);
    return errors;
  }
  const g = value;
  if (typeof g.direction !== "string" || (g.direction as string).length === 0) {
    errors.push(`${path}.direction: expected non-empty string`);
  }
  if (!Array.isArray(g.stops) || g.stops.length < 2) {
    errors.push(`${path}.stops: expected array with at least 2 entries`);
  } else {
    g.stops.forEach((stop, i) => {
      if (!isPlainObject(stop)) {
        errors.push(`${path}.stops[${i}]: expected object`);
        return;
      }
      if (typeof stop.color !== "string" || (stop.color as string).length === 0) {
        errors.push(`${path}.stops[${i}].color: expected non-empty string`);
      }
      if (
        typeof stop.position !== "number" ||
        (stop.position as number) < 0 ||
        (stop.position as number) > 1
      ) {
        errors.push(`${path}.stops[${i}].position: expected number in [0, 1]`);
      }
    });
  }
  return errors;
}

/** Validate `Record<string, GradientToken>`. */
function validateGradientMap(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object map of GradientToken`);
    return errors;
  }
  for (const [k, v] of Object.entries(value)) {
    errors.push(...validateGradientToken(v, `${path}.${k}`));
  }
  return errors;
}

/**
 * Validate a `Partial<PlatformOverridable>` block. Every field is optional
 * here — the override slot lets brand authors override a single sub-section
 * without re-declaring the rest.
 */
function validatePlatformOverride(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object`);
    return errors;
  }
  const o = value;
  const ALLOWED_OVERRIDE_KEYS = new Set([
    "surface",
    "text",
    "accent",
    "typography",
    "spacing",
    "radius",
    "shadow",
    "gradient",
  ]);
  for (const k of Object.keys(o)) {
    if (!ALLOWED_OVERRIDE_KEYS.has(k)) {
      errors.push(`${path}.${k}: unknown property`);
    }
  }
  for (const k of ["surface", "text", "accent"] as const) {
    if (o[k] !== undefined) {
      if (!isPlainObject(o[k])) {
        errors.push(`${path}.${k}: expected partial ColorScale object`);
      } else {
        for (const [emphasis, hex] of Object.entries(
          o[k] as Record<string, unknown>
        )) {
          if (typeof hex !== "string" || hex.length === 0) {
            errors.push(
              `${path}.${k}.${emphasis}: expected non-empty string`
            );
          }
        }
      }
    }
  }
  if (o.typography !== undefined) {
    errors.push(...validateTypography(o.typography, `${path}.typography`));
  }
  if (o.spacing !== undefined) {
    errors.push(...validateLengthRecord(o.spacing, `${path}.spacing`));
  }
  if (o.radius !== undefined) {
    errors.push(...validateLengthRecord(o.radius, `${path}.radius`));
  }
  if (o.shadow !== undefined) {
    errors.push(...validateShadowMap(o.shadow, `${path}.shadow`));
  }
  if (o.gradient !== undefined) {
    errors.push(...validateGradientMap(o.gradient, `${path}.gradient`));
  }
  return errors;
}

/** Validate the top-level `platformOverrides` block. */
function validatePlatformOverrides(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected object`);
    return errors;
  }
  const po = value;
  for (const k of Object.keys(po)) {
    if (k !== "web" && k !== "native") {
      errors.push(`${path}.${k}: unknown property (only "web"/"native" allowed)`);
    }
  }
  if (po.web !== undefined) {
    errors.push(...validatePlatformOverride(po.web, `${path}.web`));
  }
  if (po.native !== undefined) {
    errors.push(...validatePlatformOverride(po.native, `${path}.native`));
  }
  return errors;
}

/**
 * Validate a candidate brand object against the canonical schema.
 *
 * Use cases:
 *   1. CI lint of consumer brand packages — load `@<consumer>/brand` JSON
 *      and run `validateBrand(json)` to catch shape drift.
 *   2. Genesis `doctor` introspection — surface a brand's full extension
 *      surface area to the agent reviewing a PRD.
 *
 * Universal-category violations are errors; missing `extensions` is fine
 * (it's optional). When `extensions` IS present, every value must be a
 * valid `ColorScale` and every key must be a non-empty string matching
 * the camelCase convention.
 */
export function validateBrand(input: unknown): BrandValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["brand: expected object"] };
  }
  const b = input as Record<string, unknown>;

  // Reject unknown top-level keys to match the JSON Schema's
  // `additionalProperties: false`. Without this the runtime validator
  // silently accepts shapes that Ajv would reject.
  for (const key of Object.keys(b)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`brand.${key}: unknown property`);
    }
  }

  if (typeof b.name !== "string" || b.name.length === 0) {
    errors.push("brand.name: expected non-empty string");
  }
  if (!b.neutral || typeof b.neutral !== "object") {
    errors.push("brand.neutral: expected object map");
  } else {
    for (const [k, v] of Object.entries(b.neutral as Record<string, unknown>)) {
      if (typeof v !== "string") {
        errors.push(`brand.neutral.${k}: expected string`);
      }
    }
  }
  for (const cat of ["surface", "text", "accent"] as const) {
    if (!isColorScale(b[cat])) {
      errors.push(`brand.${cat}: expected ColorScale`);
    }
  }
  if (!b.status || typeof b.status !== "object") {
    errors.push("brand.status: expected object");
  } else {
    const status = b.status as Record<string, unknown>;
    for (const key of Object.keys(status)) {
      if (!ALLOWED_STATUS_KEYS.has(key)) {
        errors.push(`brand.status.${key}: unknown property`);
      }
    }
    for (const key of ["success", "warning", "error", "info"] as const) {
      if (!isColorScale(status[key])) {
        errors.push(`brand.status.${key}: expected ColorScale`);
      }
    }
  }
  if (b.extensions !== undefined) {
    if (!b.extensions || typeof b.extensions !== "object") {
      errors.push("brand.extensions: expected nested record of ColorScale leaves");
    } else {
      // Walk the extensions tree. Leaves must be ColorScale; intermediate
      // nodes are nested records (e.g. `flowTemplate.breath: ColorScale`).
      // Every key in the tree must be camelCase. Aligns runtime validation
      // with the type contract (CR feedback on PR #38: type permits nested
      // shapes, runtime previously rejected them).
      const camel = /^[a-z][a-zA-Z0-9]*$/;
      const walk = (node: unknown, path: string): void => {
        if (!node || typeof node !== "object") {
          errors.push(`${path}: expected ColorScale or nested record`);
          return;
        }
        if (isColorScale(node)) {
          return; // leaf — valid
        }
        // Not a ColorScale leaf: must be a nested record. Walk its keys.
        for (const [key, value] of Object.entries(node)) {
          if (key.length === 0) {
            errors.push(`${path}: empty key not allowed`);
            continue;
          }
          if (!camel.test(key)) {
            errors.push(
              `${path}.${key}: key must be camelCase (matches /^[a-z][a-zA-Z0-9]*$/)`,
            );
          }
          walk(value, `${path}.${key}`);
        }
      };
      for (const [key, value] of Object.entries(b.extensions)) {
        if (key.length === 0) {
          errors.push("brand.extensions: empty key not allowed");
          continue;
        }
        if (!camel.test(key)) {
          errors.push(
            `brand.extensions.${key}: key must be camelCase (matches /^[a-z][a-zA-Z0-9]*$/)`,
          );
        }
        walk(value, `brand.extensions.${key}`);
      }
    }
  }

  // PRD-07 A4.0 — per-key shape validation for the new optional fields.
  // Mirrors brand.schema.json constraints so runtime validation can't drift
  // away from the Ajv path. (CodeRabbit MAJOR — PR #19.)
  if (b.typography !== undefined) {
    errors.push(...validateTypography(b.typography, "brand.typography"));
  }
  if (b.spacing !== undefined) {
    errors.push(...validateLengthRecord(b.spacing, "brand.spacing"));
  }
  if (b.radius !== undefined) {
    errors.push(...validateLengthRecord(b.radius, "brand.radius"));
  }
  if (b.shadow !== undefined) {
    errors.push(...validateShadowMap(b.shadow, "brand.shadow"));
  }
  if (b.gradient !== undefined) {
    errors.push(...validateGradientMap(b.gradient, "brand.gradient"));
  }
  if (b.platformOverrides !== undefined) {
    errors.push(
      ...validatePlatformOverrides(
        b.platformOverrides,
        "brand.platformOverrides"
      )
    );
  }

  return { ok: errors.length === 0, errors };
}
