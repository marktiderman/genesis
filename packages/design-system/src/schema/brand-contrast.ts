/**
 * WCAG contrast check for a {@link CanonicalBrand}: every foreground /
 * background pair its theme roles draw together, and every extension color
 * against the text used on it.
 *
 * Advisory. A pair under its minimum is a warning, so an existing brand keeps
 * building; only body text the reader can't tell from the page (under 1.5:1)
 * is an error. {@link validateBrand} reports both.
 *
 * Minimums follow WCAG 2.2 AA, as the role implies: 4.5:1 for text, 3:1 for
 * fills, focus rings and other non-text marks.
 *
 * Only what the brand changes is checked: a role pair is skipped when both
 * its colors are the ones the Genesis brand gives it, so a brand answers for
 * its own colors, and the Genesis brand reports nothing.
 *
 * This module imports `./brand`, never the other way: `./schema/brand` stays
 * the light shape check, and the package entry's {@link validateBrand} adds
 * this check to it.
 *
 * @stability Beta
 */

import { contrast, rgbToHex } from "../design-systems/color";
import { brandRoleVariables, hslToRgb } from "../factories/brand-roles";
import { genesisBrand } from "../presets/brand-genesis";
import {
  isColorScale,
  validateBrand as validateBrandShape,
  type BrandValidationResult,
  type CanonicalBrand,
  type ColorScale,
} from "./brand";

/** One pair under its minimum. @stability Beta */
export interface BrandContrastProblem {
  /** `"error"` only for body text on the page under {@link UNUSABLE}; otherwise `"warning"`. */
  level: "warning" | "error";
  /** What the pair is: "text on the primary fill". */
  name: string;
  /** Where the colors come from: "--primary-foreground on --primary", "extensions.rank.gold". */
  pair: string;
  foreground: string;
  background: string;
  /** The ratio, rounded down to two places (so 4.496 never reads as 4.50). */
  ratio: number;
  /** 4.5 for text, 3 for non-text marks. */
  minimum: number;
  /** Set when only one platform's overrides give the pair. */
  platform?: "web" | "native";
  message: string;
}

const AA = 4.5;
const NON_TEXT = 3;
/** Under this, text and its page are hard to tell apart at all. */
const UNUSABLE = 1.5;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The theme role pairs (light mode, where a brand's colors apply): foreground,
 * background, minimum, what it is. Text on a fill is checked only on the fills
 * genesis-ui draws their `*-foreground` on (primary, secondary, accent,
 * destructive); success, warning and info mark state on the page.
 */
const ROLE_PAIRS: readonly [string, string, number, string][] = [
  ["foreground", "background", AA, "body text on the page"],
  ["muted-foreground", "background", AA, "muted text on the page"],
  ["muted-foreground", "muted", AA, "muted text on the muted fill"],
  ["primary-foreground", "primary", AA, "text on the primary fill"],
  ["primary", "background", NON_TEXT, "the primary fill on the page"],
  ["primary-text", "background", AA, "primary text on the page"],
  ["ring", "background", NON_TEXT, "the focus ring on the page"],
  ["secondary-foreground", "secondary", AA, "text on the secondary fill"],
  ["accent-foreground", "accent", AA, "text on the accent fill"],
  ["destructive", "background", AA, "error text on the page"],
  ["destructive-foreground", "destructive", AA, "text on the destructive (error) fill"],
  // text-success / -warning / -info mark state (icons, a short label): non-text.
  ["success", "background", NON_TEXT, "the success color on the page"],
  ["warning", "background", NON_TEXT, "the warning color on the page"],
  ["info", "background", NON_TEXT, "the info color on the page"],
];

function floor2(n: number): number {
  return Math.floor(n * 100) / 100;
}

/** `243 75% 59%` → `#4f46e5`. */
function tripletToHex(triplet: string | undefined): string | undefined {
  if (!triplet) return undefined;
  const [h, s, l] = triplet.split(" ").map((p) => parseFloat(p));
  if (![h, s, l].every((n) => Number.isFinite(n))) return undefined;
  return rgbToHex(hslToRgb(h!, s!, l!).map((c) => c / 255) as [number, number, number]);
}

function hex(value: unknown): string | undefined {
  return typeof value === "string" && HEX.test(value) ? value : undefined;
}

function rolePairProblems(brand: CanonicalBrand, platform: "web" | "native"): BrandContrastProblem[] {
  const vars = brandRoleVariables(brand, { platform }).light;
  const genesis = brandRoleVariables(genesisBrand, { platform }).light;
  const problems: BrandContrastProblem[] = [];
  for (const [fgName, bgName, minimum, name] of ROLE_PAIRS) {
    const foreground = tripletToHex(vars[`--${fgName}`]);
    const background = tripletToHex(vars[`--${bgName}`]);
    if (!foreground || !background) continue;
    // Not the brand's to answer for: both colors are the Genesis brand's.
    if (foreground === tripletToHex(genesis[`--${fgName}`]) && background === tripletToHex(genesis[`--${bgName}`])) continue;
    const ratio = contrast(foreground, background);
    if (ratio >= minimum) continue;
    const level = fgName === "foreground" && ratio < UNUSABLE ? "error" : "warning";
    problems.push({
      level,
      name,
      pair: `--${fgName} on --${bgName}`,
      foreground,
      background,
      ratio: floor2(ratio),
      minimum,
      message: `${name} (--${fgName} ${foreground} on --${bgName} ${background}) is ${floor2(ratio).toFixed(2)}:1, under ${minimum}:1`,
    });
  }
  return problems;
}

/**
 * Every extension color against the text drawn on it. A scale that declares
 * a `foreground` stop is checked against it, stop by stop. One that doesn't
 * is checked against the brand's two text candidates, `text.DEFAULT` and
 * `surface.DEFAULT` (light text on a colored chip), and warns when neither
 * reads: declare `foreground` to have the color you actually use checked.
 */
function extensionProblems(brand: CanonicalBrand): BrandContrastProblem[] {
  const problems: BrandContrastProblem[] = [];
  const candidates = [
    ["text.DEFAULT", hex(brand.text?.DEFAULT)],
    ["surface.DEFAULT", hex(brand.surface?.DEFAULT)],
  ].filter((c): c is [string, string] => c[1] !== undefined);

  const checkScale = (scale: ColorScale, path: string) => {
    const declared = hex(scale.foreground);
    for (const [stop, value] of Object.entries(scale)) {
      if (stop === "foreground") continue;
      const background = hex(value);
      if (!background) continue;
      const at = stop === "DEFAULT" ? path : `${path}.${stop}`;
      if (declared) {
        const ratio = contrast(declared, background);
        if (ratio >= AA) continue;
        problems.push({
          level: "warning",
          name: `text on ${at}`,
          pair: `${path}.foreground on ${at}`,
          foreground: declared,
          background,
          ratio: floor2(ratio),
          minimum: AA,
          message: `text on ${at} (${path}.foreground ${declared} on ${background}) is ${floor2(ratio).toFixed(2)}:1, under ${AA}:1`,
        });
        continue;
      }
      if (candidates.length === 0) continue;
      const scored = candidates.map(([label, fg]) => ({ label, fg, ratio: contrast(fg, background) }));
      const best = scored.reduce((a, b) => (b.ratio > a.ratio ? b : a));
      if (best.ratio >= AA) continue;
      const tried = scored.map((c) => `${c.label} ${c.fg} ${floor2(c.ratio).toFixed(2)}:1`).join(", ");
      problems.push({
        level: "warning",
        name: `text on ${at}`,
        pair: `${best.label} on ${at}`,
        foreground: best.fg,
        background,
        ratio: floor2(best.ratio),
        minimum: AA,
        message: `no brand text color reads on ${at} (${background}): ${tried}, under ${AA}:1. Declare ${path}.foreground with the color drawn on it`,
      });
    }
  };

  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    if (isColorScale(node)) return checkScale(node, path);
    for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
  };
  for (const [key, value] of Object.entries(brand.extensions ?? {})) walk(value, `extensions.${key}`);
  return problems;
}

/**
 * The brand's contrast problems: role pairs (per platform, when its
 * `platformOverrides` make them differ) and extension colors. Empty when
 * every pair reaches its minimum. Colors that aren't `#rgb` / `#rrggbb` are
 * skipped. Assumes a brand of the right shape; {@link validateBrand} only
 * runs it on one.
 *
 * @stability Beta
 */
export function brandContrastProblems(brand: CanonicalBrand): BrandContrastProblem[] {
  const web = rolePairProblems(brand, "web");
  const native = rolePairProblems(brand, "native");
  const key = (p: BrandContrastProblem) => `${p.pair}|${p.foreground}|${p.background}`;
  const webKeys = new Set(web.map(key));
  const nativeKeys = new Set(native.map(key));
  const out: BrandContrastProblem[] = [];
  for (const p of web) {
    if (nativeKeys.has(key(p))) out.push(p);
    else out.push({ ...p, platform: "web", message: `${p.message} (web)` });
  }
  for (const p of native) {
    if (!webKeys.has(key(p))) out.push({ ...p, platform: "native", message: `${p.message} (native)` });
  }
  out.push(...extensionProblems(brand));
  return out;
}

/**
 * {@link validateBrandShape | The brand shape check} plus
 * {@link brandContrastProblems}: contrast pairs under their minimum come back
 * as `warnings` (`ok` stays true); body text under 1.5:1 on its page is an
 * error. The package entry exports this as `validateBrand`.
 *
 * @stability Beta
 */
export function validateBrand(input: unknown): BrandValidationResult {
  return validateBrandShape(input, { contrast: brandContrastProblems });
}
