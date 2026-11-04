/**
 * The opt-in brand roles: `dark`, `signal`, `accents`, `gradients.primary`
 * and `typography.display`. A brand that sets none of them themes exactly as
 * before; one that does gets them on web, native and in the runtime tokens.
 */
import { describe, expect, it } from "vitest";
import { brandExtraVariables, brandGradientCss, brandRoleVariables } from "../brand-roles";
import { tailwindFromBrand, themeFromBrand } from "../from-brand";
import { genesisBrand } from "../../presets/brand-genesis";
import { createGenesisNativewindPreset } from "../../presets/nativewind";
import { resolveTokens } from "../../theme/theme";
import { validateBrand, type CanonicalBrand } from "../../schema/brand";

const acme: CanonicalBrand = {
  ...genesisBrand,
  name: "acme",
  accent: { DEFAULT: "#0f766e" },
  signal: "#e11d48",
  dark: {
    surface: { DEFAULT: "#0b1120" },
    text: { DEFAULT: "#f8fafc" },
    accent: { DEFAULT: "#2dd4bf" },
    primaryForeground: "#042f2e",
    neutral: { "800": "#1e293b", "400": "#94a3b8", "700": "#334155" },
    status: { error: { DEFAULT: "#f87171" } },
    signal: "#fb7185",
  },
  accents: { gold: "#d4a017", trail: "#0d9488" },
  gradients: { primary: { from: "#0f766e", to: "#2563eb", angle: 90 } },
  typography: { ...genesisBrand.typography, display: { family: ["Space Grotesk", "sans-serif"], weight: "700", numeric: "tabular" } },
};

const triplet = (hex: string) => {
  // Compare through the same conversion the module uses.
  const roles = brandRoleVariables({ ...genesisBrand, name: "probe", surface: { DEFAULT: hex } });
  return roles.light["--background"];
};

describe("opt-in brand roles", () => {
  it("leave a brand without them unchanged", () => {
    expect(brandExtraVariables(genesisBrand)).toEqual({ light: {}, dark: {} });
    const before = themeFromBrand(genesisBrand);
    expect(before.theme.accents).toEqual({});
    expect(before.theme.display).toBeUndefined();
    expect(before.theme.buttonGradient).toBeUndefined();
    expect(Object.keys(before.variables.dark).some((k) => k.startsWith("--brand-"))).toBe(false);
    expect(tailwindFromBrand(genesisBrand).css).not.toContain("--brand-");
  });

  it("resolve the dark theme's roles from brand.dark", () => {
    const { dark, light } = brandRoleVariables(acme);
    expect(dark["--background"]).toBe(triplet("#0b1120"));
    expect(dark["--card"]).toBe(triplet("#0b1120"));
    expect(dark["--foreground"]).toBe(triplet("#f8fafc"));
    expect(dark["--primary"]).toBe(triplet("#2dd4bf"));
    expect(dark["--primary-foreground"]).toBe(triplet("#042f2e"));
    expect(dark["--muted"]).toBe(triplet("#1e293b"));
    expect(dark["--muted-foreground"]).toBe(triplet("#94a3b8"));
    expect(dark["--border"]).toBe(triplet("#334155"));
    expect(dark["--destructive"]).toBe(triplet("#f87171"));
    // Light mode is untouched by the dark block.
    expect(light["--primary"]).toBe(brandRoleVariables({ ...acme, dark: undefined }).light["--primary"]);
  });

  it("keep the Genesis dark value for a role brand.dark leaves out", () => {
    const partial = brandRoleVariables({ ...genesisBrand, name: "partial", dark: { surface: { DEFAULT: "#101010" } } });
    const genesis = brandRoleVariables(genesisBrand);
    expect(partial.dark["--foreground"]).toBe(genesis.dark["--foreground"]);
    expect(partial.dark["--background"]).toBe(triplet("#101010"));
  });

  it("emit accents, the primary gradient, display type and signal as variables", () => {
    const extra = brandExtraVariables(acme);
    expect(extra.light["--brand-accent-gold"]).toBe("#d4a017");
    expect(extra.dark["--brand-accent-trail"]).toBe("#0d9488");
    expect(extra.light["--brand-gradient-primary"]).toBe("linear-gradient(90deg, #0f766e, #2563eb)");
    expect(extra.light["--font-display"]).toBe('"Space Grotesk", sans-serif');
    expect(extra.light["--font-weight-display"]).toBe("700");
    expect(extra.light["--font-numeric-display"]).toBe("tabular-nums");
    expect(extra.light["--brand-signal"]).toBe("#e11d48");
    expect(extra.dark["--brand-signal"]).toBe("#fb7185");
    expect(brandGradientCss({ ...acme, gradients: { primary: { from: "#000000", to: "#ffffff" } } })).toBe("linear-gradient(135deg, #000000, #ffffff)");
  });

  it("reach the web CSS, the native theme and the NativeWind preset", () => {
    expect(tailwindFromBrand(acme).css).toContain("--brand-accent-gold: #d4a017");
    const native = themeFromBrand(acme);
    expect(native.theme.accents).toEqual({ gold: "#d4a017", trail: "#0d9488" });
    expect(native.theme.display).toEqual({ fontFamily: "Space Grotesk", fontWeight: "700", fontVariant: ["tabular-nums"] });
    expect(native.theme.buttonGradient?.colors).toEqual(["#0f766e", "#2563eb"]);
    expect(native.theme.buttonGradient?.start).toEqual({ x: 0, y: 0.5 });
    expect(native.theme.buttonGradient?.end).toEqual({ x: 1, y: 0.5 });
    expect(native.variables.dark["--background"]).toBe(triplet("#0b1120"));
    expect(native.variables.light["--brand-accent-gold"]).toBe("#d4a017");
    const preset = createGenesisNativewindPreset({ brand: acme });
    let base: Record<string, unknown> = {};
    preset.plugins[0]!({ addBase: (b: Record<string, unknown>) => (base = b) } as never);
    expect((base[":root"] as Record<string, string>)["--brand-accent-gold"]).toBe("#d4a017");
  });

  it("resolve dark tokens, accents, gradient and display at runtime", () => {
    const dark = resolveTokens(acme, "dark");
    expect(dark.surface.DEFAULT).toBe("#0b1120");
    expect(dark.accent.DEFAULT).toBe("#2dd4bf");
    expect(dark.accents).toEqual({ gold: "#d4a017", trail: "#0d9488" });
    expect(dark.gradients?.primary?.to).toBe("#2563eb");
    expect(dark.display?.weight).toBe("700");
    expect(resolveTokens(acme, "light").surface.DEFAULT).toBe(genesisBrand.surface.DEFAULT);
  });

  it("validate", () => {
    expect(validateBrand(acme).errors).toEqual([]);
    const bad = validateBrand({
      ...acme,
      dark: { surface: "#000", extra: 1 },
      accents: { Gold: 3 },
      gradients: { primary: { from: "#000" }, hover: {} },
      typography: { display: { weight: "bold", numeric: "mono" } },
    });
    expect(bad.errors).toEqual(
      expect.arrayContaining([
        "brand.dark.surface: expected ColorScale",
        "brand.dark.extra: unknown property",
        expect.stringContaining("brand.accents.Gold"),
        "brand.gradients.primary: expected { from, to, angle? }",
        'brand.gradients.hover: unknown property (only "primary")',
        expect.stringContaining("brand.typography.display.weight"),
        expect.stringContaining("brand.typography.display.numeric"),
      ]),
    );
  });
});
