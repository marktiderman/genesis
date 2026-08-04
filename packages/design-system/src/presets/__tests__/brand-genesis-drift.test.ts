/**
 * Drift guard: `genesisBrand` preset ⟷ DTCG token source of truth.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists (CMT-240-048 — CodeRabbit follow-up to PR #240)
 * ---------------------------------------------------------------------------
 *
 * The published `genesisBrand` preset (src/presets/brand-genesis.ts) is a hand-
 * authored hex palette. The theme that actually renders is generated from the
 * DTCG tokens under `tokens/dtcg/*.json` (hex) + the HSL primary in
 * `brands/genesis.json`. Nothing tied the two together, so they silently drifted
 * apart — most visibly on the brand green: the preset shipped emerald-600
 * (#059669) while the rendered `--primary` is emerald-500 (`160 84% 39%` ≈
 * #10b981). The two greens even trace to a documented conflation (a prior audit
 * asserted "160 84% 39% = #059669", which is false — see git history).
 *
 * This test is the missing synchronization invariant. It defines the canonical
 * relationship and fails when preset and source diverge.
 *
 * ---------------------------------------------------------------------------
 * The canonical relationship
 * ---------------------------------------------------------------------------
 *
 * SOURCE OF TRUTH = the DTCG tokens (`tokens/dtcg/*.json`). The preset mirrors
 * them; where the two disagree the DTCG value wins (the preset is reconciled
 * to it). Brand green is `160 84% 39%` (emerald-500) — the value documented in
 * docs/specs/2026-04-13-genesis-design-system.md and rendered as `--primary`.
 *
 * Field-by-field mapping (preset leaf → DTCG source token):
 *
 *   neutral.{50..900}      → color.neutral.{50..900}        (colors.json)   [hex]
 *   surface.DEFAULT/light  → theme.background               (themes/light)  [hex]
 *   surface.dark           → theme.background               (themes/dark)   [hex]
 *   text.DEFAULT/light     → theme.foreground               (themes/light)  [hex]
 *   text.dark              → theme.foreground               (themes/dark)   [hex]
 *   accent.DEFAULT/light   → brand.primary                  (brands/genesis)[hex]
 *   status.success.DEFAULT → color.semantic.success.DEFAULT (colors.json)   [hex]
 *   status.warning.DEFAULT → color.semantic.warning.DEFAULT (colors.json)   [hex]
 *   status.error.DEFAULT   → color.semantic.error.DEFAULT   (colors.json)   [hex]
 *   status.info.DEFAULT    → color.semantic.info.DEFAULT    (colors.json)   [hex]
 *
 * The hex↔HSL bridge for the green (the exact mismatch CodeRabbit flagged) is
 * asserted separately: hexToHsl(accent.DEFAULT) ≈ brand.primary-hsl, and the
 * DTCG source is checked for internal consistency (its own hex must match its
 * own HSL) so the root conflation cannot silently reappear.
 *
 * UNMAPPED preset leaves (brand-authored, no clean DTCG anchor) are enumerated
 * explicitly and a completeness test guarantees every preset leaf is either
 * mapped or acknowledged here — so adding a new preset field forces a decision.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { genesisBrand, genesisTheme } from "../brand-genesis";

// ---------------------------------------------------------------------------
// Load the DTCG token source at test time (the source of truth).
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const dtcgDir = join(__dirname, "..", "..", "..", "tokens", "dtcg");

function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dtcgDir, rel), "utf-8"));
}

const colorsDoc = loadJson("colors.json");
const brandDoc = loadJson("brands/genesis.json");
const lightDoc = loadJson("themes/light.json");
const darkDoc = loadJson("themes/dark.json");

/** Resolve a dotted `$value` leaf out of a DTCG document. */
function dtcgValue(doc: Record<string, unknown>, path: string): string {
  let node: unknown = doc;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)?.[key];
  }
  const value = (node as { $value?: unknown } | undefined)?.$value;
  if (typeof value !== "string") {
    throw new Error(`DTCG token "${path}" did not resolve to a string $value`);
  }
  return value;
}

/** Resolve a numeric `$value` leaf (used for brand.primary-hsl components). */
function dtcgNumber(doc: Record<string, unknown>, path: string): number {
  let node: unknown = doc;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)?.[key];
  }
  const value = (node as { $value?: unknown } | undefined)?.$value;
  if (typeof value !== "number") {
    throw new Error(`DTCG token "${path}" did not resolve to a number $value`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Color helpers. `hexToHsl` mirrors the algorithm in style-dictionary.config.ts
// (kept inline — that file is a build script with a top-level side effect and
// cannot be imported into a test).
// ---------------------------------------------------------------------------

const normalizeHex = (hex: string): string => hex.trim().toLowerCase();

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#([0-9a-f]{6})$/.exec(normalizeHex(hex));
  if (!m) throw new Error(`Expected 6-digit hex, got "${hex}"`);
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: round(h * 360), s: round(s * 100), l: round(l * 100) };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/**
 * Absolute per-component HSL tolerance. hex→HSL round-trips within ~0.5 of the
 * authored HSL (#10b981 → 160.1/84.1/39.4 vs the authored 160/84/39), so ±1
 * absorbs rounding while still cleanly rejecting a different green (#059669 →
 * hue 161.4, lightness 30.4 — both well outside ±1).
 */
const HSL_TOLERANCE = 1;

function expectHslClose(
  actual: { h: number; s: number; l: number },
  expected: { h: number; s: number; l: number }
): void {
  for (const c of ["h", "s", "l"] as const) {
    expect(
      Math.abs(actual[c] - expected[c]),
      `HSL component "${c}" (${actual[c]} vs ${expected[c]})`
    ).toBeLessThanOrEqual(HSL_TOLERANCE);
  }
}

// ---------------------------------------------------------------------------
// The mapping table: preset leaf → resolved DTCG hex. Single source that both
// the per-field assertions and the completeness check read from.
// ---------------------------------------------------------------------------

const HEX_MAP: ReadonlyArray<{ preset: string; presetHex: string; dtcgHex: string }> = [
  ...Object.keys(genesisBrand.neutral).map((k) => ({
    preset: `neutral.${k}`,
    presetHex: genesisBrand.neutral[k],
    dtcgHex: dtcgValue(colorsDoc, `color.neutral.${k}`),
  })),
  { preset: "surface.DEFAULT", presetHex: genesisBrand.surface.DEFAULT, dtcgHex: dtcgValue(lightDoc, "theme.background") },
  { preset: "surface.light", presetHex: genesisBrand.surface.light!, dtcgHex: dtcgValue(lightDoc, "theme.background") },
  { preset: "surface.dark", presetHex: genesisBrand.surface.dark!, dtcgHex: dtcgValue(darkDoc, "theme.background") },
  { preset: "text.DEFAULT", presetHex: genesisBrand.text.DEFAULT, dtcgHex: dtcgValue(lightDoc, "theme.foreground") },
  { preset: "text.light", presetHex: genesisBrand.text.light!, dtcgHex: dtcgValue(lightDoc, "theme.foreground") },
  { preset: "text.dark", presetHex: genesisBrand.text.dark!, dtcgHex: dtcgValue(darkDoc, "theme.foreground") },
  { preset: "accent.DEFAULT", presetHex: genesisBrand.accent.DEFAULT, dtcgHex: dtcgValue(brandDoc, "brand.primary") },
  { preset: "accent.light", presetHex: genesisBrand.accent.light!, dtcgHex: dtcgValue(brandDoc, "brand.primary") },
  { preset: "status.success.DEFAULT", presetHex: genesisBrand.status.success.DEFAULT, dtcgHex: dtcgValue(colorsDoc, "color.semantic.success.DEFAULT") },
  { preset: "status.warning.DEFAULT", presetHex: genesisBrand.status.warning.DEFAULT, dtcgHex: dtcgValue(colorsDoc, "color.semantic.warning.DEFAULT") },
  { preset: "status.error.DEFAULT", presetHex: genesisBrand.status.error.DEFAULT, dtcgHex: dtcgValue(colorsDoc, "color.semantic.error.DEFAULT") },
  { preset: "status.info.DEFAULT", presetHex: genesisBrand.status.info.DEFAULT, dtcgHex: dtcgValue(colorsDoc, "color.semantic.info.DEFAULT") },
];

/**
 * Preset leaves with no clean DTCG anchor. Documented, brand-authored:
 *   - name: an identifier, not a color.
 *   - accent.dark: the dark-mode emphasis (#34d399, emerald-400). The rendered
 *     dark `--primary` is *computed* (lightness + 10) in generate-css.ts, not a
 *     stored DTCG token, so there is nothing to compare it against.
 */
const UNMAPPED_LEAVES: ReadonlySet<string> = new Set(["name", "accent.dark"]);

/** All string-leaf dotted paths in the preset (for the completeness check). */
function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("genesisBrand ⟷ DTCG source drift guard", () => {
  it.each(HEX_MAP)(
    "preset $preset matches the DTCG source hex",
    ({ presetHex, dtcgHex }) => {
      expect(normalizeHex(presetHex)).toBe(normalizeHex(dtcgHex));
    }
  );

  it("brand green: hexToHsl(accent.DEFAULT) ≈ the DTCG primary-hsl (the hex↔HSL invariant)", () => {
    const hsl = hexToHsl(genesisBrand.accent.DEFAULT);
    expectHslClose(hsl, {
      h: dtcgNumber(brandDoc, "brand.primary-hsl.h"),
      s: dtcgNumber(brandDoc, "brand.primary-hsl.s"),
      l: dtcgNumber(brandDoc, "brand.primary-hsl.l"),
    });
  });

  it("DTCG source is internally consistent: brand.primary hex ≈ brand.primary-hsl", () => {
    // Guards against the root conflation reappearing in the source itself.
    expectHslClose(hexToHsl(dtcgValue(brandDoc, "brand.primary")), {
      h: dtcgNumber(brandDoc, "brand.primary-hsl.h"),
      s: dtcgNumber(brandDoc, "brand.primary-hsl.s"),
      l: dtcgNumber(brandDoc, "brand.primary-hsl.l"),
    });
  });

  it("genesisTheme (the HSL config that renders --primary) matches the DTCG primary-hsl", () => {
    // Closes the loop preset-hex ⟷ preset-hsl ⟷ DTCG-hsl ⟷ DTCG-hex.
    expect(genesisTheme.primary).toEqual({
      h: dtcgNumber(brandDoc, "brand.primary-hsl.h"),
      s: dtcgNumber(brandDoc, "brand.primary-hsl.s"),
      l: dtcgNumber(brandDoc, "brand.primary-hsl.l"),
    });
  });

  it("every preset leaf is either mapped to a DTCG token or explicitly unmapped", () => {
    const mapped = new Set(HEX_MAP.map((m) => m.preset));
    const unclassified = leafPaths(genesisBrand).filter(
      (p) => !mapped.has(p) && !UNMAPPED_LEAVES.has(p)
    );
    expect(unclassified).toEqual([]);
  });
});
