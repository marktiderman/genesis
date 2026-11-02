/**
 * The brand contrast check: role pairs and extension colors under their WCAG
 * minimum are warnings (an existing brand keeps validating); only body text
 * nobody can read is an error.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateBrand as validateBrandShape, type CanonicalBrand } from "../brand";
import { brandContrastProblems, validateBrand } from "../brand-contrast";
import { genesisBrand } from "../../presets/brand-genesis";
import { contrast } from "../../design-systems/color";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "__fixtures__");
const fixture = (name: string) => JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf-8")) as CanonicalBrand;

// Readable on every role, so only what a test changes is reported.
const clean: CanonicalBrand = {
  ...genesisBrand,
  name: "clean",
  surface: { DEFAULT: "#ffffff" },
  text: { DEFAULT: "#111111" },
  accent: { DEFAULT: "#1d4ed8" },
  status: {
    success: { DEFAULT: "#166534" },
    warning: { DEFAULT: "#92400e" },
    error: { DEFAULT: "#b91c1c" },
    info: { DEFAULT: "#1e40af" },
  },
};

const CREAM = "#f5ebdc";

describe("brandContrastProblems", () => {
  it("finds nothing on a brand whose pairs all read", () => {
    expect(brandContrastProblems(clean)).toEqual([]);
  });

  it("warns on cream text over category colors that don't carry it", () => {
    // Mid-tone category colors with cream drawn on them: 2.70–4.39:1.
    const brand: CanonicalBrand = {
      ...clean,
      extensions: {
        category: { DEFAULT: "#c2410c", foreground: CREAM, strength: "#d97706", mobility: "#0d9488", cardio: "#e11d48", rest: "#1e3a8a" },
      },
    };
    const problems = brandContrastProblems(brand);
    const names = problems.map((p) => p.name).sort();
    expect(names).toEqual(["text on extensions.category", "text on extensions.category.cardio", "text on extensions.category.mobility", "text on extensions.category.strength"]);
    for (const p of problems) {
      expect(p.level).toBe("warning");
      expect(p.foreground).toBe(CREAM);
      expect(p.minimum).toBe(4.5);
      expect(p.ratio).toBeLessThan(4.5);
      expect(p.ratio).toBeCloseTo(Math.floor(contrast(CREAM, p.background) * 100) / 100, 5);
    }
    // The validation path reports them as warnings and still passes.
    const result = validateBrand(brand);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(4);
    expect(result.warnings![0]).toMatch(/^brand contrast: text on extensions\.category.* is \d\.\d\d:1, under 4\.5:1$/);
  });

  it("without a declared foreground, warns only when neither the text nor the surface color reads", () => {
    const brand: CanonicalBrand = {
      ...clean,
      // A mid gray reads with neither the near-black text (4.40:1) nor the white surface (4.29:1).
      extensions: { tag: { DEFAULT: "#1d4ed8", muddy: "#7a7a7a" } },
    };
    const problems = brandContrastProblems(brand);
    expect(problems.map((p) => p.pair)).toEqual(["text.DEFAULT on extensions.tag.muddy"]);
    expect(problems[0]!.message).toMatch(/Declare extensions\.tag\.foreground/);
  });

  it("walks nested extension groups", () => {
    const brand: CanonicalBrand = {
      ...clean,
      extensions: { flowTemplate: { breath: { DEFAULT: "#fde68a", foreground: "#ffffff" } } },
    };
    expect(brandContrastProblems(brand).map((p) => p.pair)).toEqual(["extensions.flowTemplate.breath.foreground on extensions.flowTemplate.breath"]);
  });

  it("checks each role pair at the minimum its role implies", () => {
    const brand: CanonicalBrand = {
      ...clean,
      accent: { DEFAULT: "#bfdbfe" }, // a pale primary: fine with dark text on it, too faint as a fill on white
      status: { ...clean.status, warning: { DEFAULT: "#facc15" } },
    };
    const byPair = Object.fromEntries(brandContrastProblems(brand).map((p) => [p.pair, p]));
    expect(byPair["--primary on --background"]?.minimum).toBe(3);
    expect(byPair["--warning on --background"]?.minimum).toBe(3);
    // genesis-ui draws no text on the warning fill, so that pair isn't checked.
    expect(byPair["--warning-foreground on --warning"]).toBeUndefined();
    expect(Object.values(byPair).every((p) => p.level === "warning")).toBe(true);
  });

  it("is an error only when body text can't be told from the page", () => {
    const brand: CanonicalBrand = { ...clean, text: { DEFAULT: "#f2f2f2" } };
    const [problem] = brandContrastProblems(brand).filter((p) => p.pair === "--foreground on --background");
    expect(problem?.level).toBe("error");
    const result = validateBrand(brand);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/^brand contrast: body text on the page/)]);
  });

  it("names the platform when only one platform's overrides give the pair", () => {
    const brand: CanonicalBrand = { ...clean, platformOverrides: { native: { accent: { DEFAULT: "#93c5fd" } } } };
    const primary = brandContrastProblems(brand).filter((p) => p.pair === "--primary on --background");
    expect(primary.map((p) => p.platform)).toEqual(["native"]);
    expect(primary[0]!.message).toMatch(/\(native\)$/);
  });

  it("leaves every existing fixture and the Genesis brand valid (warnings only)", () => {
    for (const brand of [genesisBrand, fixture("brand-canonical"), fixture("brand-with-extensions"), fixture("brand-full-divergence")]) {
      const result = validateBrand(brand);
      expect(result, brand.name).toMatchObject({ ok: true, errors: [] });
    }
  });

  it("reports nothing for the Genesis brand", () => {
    expect(brandContrastProblems(genesisBrand)).toEqual([]);
    expect(validateBrand(genesisBrand).warnings ?? []).toEqual([]);
  });

  it("checks only the pairs a brand changes", () => {
    // Genesis's own error red on white (3.76:1) isn't this brand's to answer for.
    const brand: CanonicalBrand = { ...genesisBrand, name: "teal", accent: { DEFAULT: "#0f766e" } };
    expect(brandContrastProblems(brand).map((p) => p.pair)).toEqual([]);
    const pale: CanonicalBrand = { ...genesisBrand, name: "pale", status: { ...genesisBrand.status, error: { DEFAULT: "#fca5a5" } } };
    expect(brandContrastProblems(pale).map((p) => p.pair).sort()).toEqual(["--destructive on --background", "--destructive-foreground on --destructive"]);
  });

  it("keeps the shape check in ./brand free of contrast unless asked", () => {
    const brand: CanonicalBrand = { ...clean, text: { DEFAULT: "#f2f2f2" } };
    expect(validateBrandShape(brand)).toEqual({ ok: true, errors: [] });
    expect(validateBrandShape(brand, { contrast: brandContrastProblems }).ok).toBe(false);
  });

  it("runs no contrast check on a brand of the wrong shape", () => {
    expect(validateBrand({ name: "x" }).warnings).toEqual([]);
  });
});
