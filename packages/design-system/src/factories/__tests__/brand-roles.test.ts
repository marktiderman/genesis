/**
 * A brand's theme role variables: what the role classes (`bg-primary` is
 * `hsl(var(--primary))`) read. A brand's colors are its DEFAULTs, as the web
 * preset emits them; a scale's `light` / `dark` keys are emphasis tints and
 * never stand for light or dark mode.
 */
import { describe, expect, it } from "vitest";
import { brandRoleVariables } from "../brand-roles";
import { tailwindFromBrand, themeFromBrand } from "../from-brand";
import { genesisBrand } from "../../presets/brand-genesis";
import { GENESIS_THEME_BRAND, renderThemeCss, tailwindColorVariables, themeVariables } from "../../tokens/theme-css";
import type { CanonicalBrand } from "../../schema/brand";

// Tints that would fail if read as modes: a light taupe text tint on a white surface tint.
const espresso: CanonicalBrand = {
  ...genesisBrand,
  name: "espresso",
  surface: { DEFAULT: "#f5efe6", light: "#ffffff", dark: "#e8dccb" },
  text: { DEFAULT: "#2b1d14", light: "#8c7b6b", dark: "#1a110b" },
  accent: { DEFAULT: "#0f766e", light: "#99f6e4", dark: "#134e4a" },
  status: { ...genesisBrand.status, error: { DEFAULT: "#b91c1c", light: "#fecaca", dark: "#7f1d1d" } },
};

const hex = (value: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
function hslToRgb(triplet: string): [number, number, number] {
  const [h, s, l] = triplet.split(" ").map((p) => parseFloat(p)) as [number, number, number];
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return [f(0), f(8), f(4)];
}
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = (rgb: [number, number, number]) => {
    const [r, g, bl] = rgb.map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Each component within 0.6 (rounding to one decimal). */
function sameColor(a: string, b: string): boolean {
  const [x, y] = [a, b].map((t) => t.split(" ").map((p) => parseFloat(p)));
  return x!.every((v, i) => Math.abs(v - y![i]!) <= 0.6);
}

describe("brandRoleVariables", () => {
  it("declares every role variable genesis.css does, in both modes", () => {
    const genesis = themeVariables(GENESIS_THEME_BRAND);
    const roles = brandRoleVariables(espresso);
    expect(Object.keys(roles.light).sort()).toEqual(Object.keys(genesis.light).sort());
    expect(Object.keys(roles.dark).sort()).toEqual(Object.keys(genesis.dark).sort());
  });

  it("takes the brand's colors from the same DEFAULTs the web preset emits, never a light/dark tint", () => {
    const web = tailwindFromBrand(espresso).preset.theme.extend.colors as Record<string, Record<string, string>>;
    const { light } = brandRoleVariables(espresso);
    expect(hslToRgb(light["--background"]!)).toEqual(hex(web.surface!.DEFAULT!));
    expect(hslToRgb(light["--foreground"]!)).toEqual(hex(web.text!.DEFAULT!));
    expect(hslToRgb(light["--primary"]!)).toEqual(hex(web.accent!.DEFAULT!));
    expect(hslToRgb(light["--destructive"]!)).toEqual(hex(espresso.status.error.DEFAULT));
    expect(light["--foreground"]).not.toBe(brandRoleVariables({ ...espresso, text: { DEFAULT: "#8c7b6b" } }).light["--foreground"]);
    // Body text reads: espresso on linen, not the taupe tint on the white tint.
    expect(contrast(hslToRgb(light["--foreground"]!), hslToRgb(light["--background"]!))).toBeGreaterThan(11);
  });

  it("keeps the Genesis dark theme (a brand has no dark-mode colors), with the accent as primary only where it reads", () => {
    const genesisDark = themeVariables(GENESIS_THEME_BRAND).dark;
    const dark = brandRoleVariables(espresso).dark;
    expect(dark["--background"]).toBe(genesisDark["--background"]);
    expect(dark["--foreground"]).toBe(genesisDark["--foreground"]);
    expect(dark["--destructive"]).toBe(genesisDark["--destructive"]);
    // #0f766e on the dark background is under 4.5:1: the Genesis dark primary stays.
    expect(dark["--primary"]).toBe(genesisDark["--primary"]);
    const bright = brandRoleVariables({ ...espresso, accent: { DEFAULT: "#5eead4" } }).dark;
    expect(bright["--primary"]).toBe("170.6 76.9% 64.3%");
    expect(bright["--primary-foreground"]).toBe("240 5.9% 10%"); // neutral 900, #18181b
  });

  it("keeps body text at 4.5:1 or more on the background for the default brand, in both modes", () => {
    const roles = brandRoleVariables(genesisBrand);
    for (const mode of ["light", "dark"] as const) {
      const vars = roles[mode];
      expect(contrast(hslToRgb(vars["--foreground"]!), hslToRgb(vars["--background"]!)), mode).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hslToRgb(vars["--primary-foreground"]!), hslToRgb(vars["--primary"]!)), mode).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("darkens muted text to the first neutral that reads at 4.5:1 on the page", () => {
    // A warm neutral whose 500 is 3.27:1 on its surface.
    const warm: CanonicalBrand = {
      ...espresso,
      neutral: { ...genesisBrand.neutral, "100": "#f1ebe3", "500": "#8f8275", "600": "#6f6357", "700": "#544a41", "900": "#1c1917" },
    };
    const { light } = brandRoleVariables(warm);
    const muted = hslToRgb(light["--muted-foreground"]!);
    expect(contrast(muted, hex("#f5efe6"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, hex("#6f6357"))).toBeLessThan(1.05); // neutral 600, not 500
  });

  it("also needs muted text to read at 4.5:1 on the muted fill, not just the page", () => {
    // Zinc 500 is 4.83:1 on white but 4.40:1 on zinc 100 (an unselected segment's label): 600 wins.
    // genesis.css agrees (the test above), so the default theme passes too.
    const { light } = brandRoleVariables(genesisBrand);
    const muted = hslToRgb(light["--muted-foreground"]!);
    expect(contrast(muted, hslToRgb(light["--muted"]!))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, hex("#52525b"))).toBeLessThan(1.05); // zinc 600
  });

  it("matches genesis.css for the Genesis brand (to rounding), so the default look doesn't move", () => {
    const genesis = themeVariables(GENESIS_THEME_BRAND);
    const roles = brandRoleVariables(genesisBrand);
    for (const mode of ["light", "dark"] as const) {
      for (const name of ["--background", "--foreground", "--primary", "--primary-foreground", "--muted", "--muted-foreground", "--border", "--input", "--ring", "--destructive"]) {
        expect(sameColor(roles[mode][name]!, genesis[mode][name]!), `${mode} ${name}`).toBe(true);
      }
    }
  });

  it("leaves a color that isn't hex at the Genesis value", () => {
    const roles = brandRoleVariables({ ...espresso, accent: { DEFAULT: "oklch(0.6 0.1 180)" } });
    expect(roles.light["--primary"]).toBe(themeVariables(GENESIS_THEME_BRAND).light["--primary"]);
  });

  it("applies the brand's native overrides first, so it agrees with themeFromBrand; web overrides with platform: web", () => {
    const overridden: CanonicalBrand = {
      ...espresso,
      platformOverrides: { native: { accent: { DEFAULT: "#b45309" } }, web: { accent: { DEFAULT: "#1d4ed8" } } },
    };
    const roles = brandRoleVariables(overridden);
    expect(roles.light["--primary"]).toBe("26 90.5% 37.1%"); // #b45309
    expect(themeFromBrand(overridden).variables.light["--primary"]).toBe(roles.light["--primary"]);
    expect(brandRoleVariables(overridden, { platform: "web" }).light["--primary"]).toBe("224.3 76.3% 48%"); // #1d4ed8
  });

  it("sets --radius from radius.lg, else radius.DEFAULT, in both modes", () => {
    // rounded-lg is --radius itself, so lg wins over a bare DEFAULT.
    expect(brandRoleVariables({ ...espresso, radius: { DEFAULT: "0.25rem", lg: "0.5rem" } }).light["--radius"]).toBe("0.5rem");
    expect(brandRoleVariables({ ...espresso, radius: { DEFAULT: "0" } }).light["--radius"]).toBe("0px");
    const lg = brandRoleVariables({ ...espresso, radius: { sm: "0.25rem", lg: "0.75rem" } });
    expect(lg.light["--radius"]).toBe("0.75rem");
    expect(lg.dark["--radius"]).toBe("0.75rem");
    // No base radius: the Genesis one.
    expect(brandRoleVariables({ ...espresso, radius: { md: "1rem" } }).light["--radius"]).toBe(themeVariables(GENESIS_THEME_BRAND).light["--radius"]);
  });

  it("takes a fluid radius's minimum on native, the platform's override first", () => {
    const fluid = { ...espresso, radius: { DEFAULT: "clamp(0.5rem, 0.4rem + 0.5vw, 1rem)" }, platformOverrides: { web: { radius: { DEFAULT: "0" } } } };
    expect(brandRoleVariables(fluid).light["--radius"]).toBe("0.5rem");
    expect(brandRoleVariables(fluid, { platform: "web" }).light["--radius"]).toBe("0px");
    expect(themeFromBrand({ ...espresso, radius: { DEFAULT: "0" } }).variables.light["--radius"]).toBe("0px");
  });
});

describe("--primary-text", () => {
  const gold = (surface: string): CanonicalBrand => ({ ...genesisBrand, name: "gold", accent: { DEFAULT: "#FFC402" }, surface: { DEFAULT: surface } });
  const hue = (triplet: string) => parseFloat(triplet.split(" ")[0]!);
  const lightness = (triplet: string) => parseFloat(triplet.split(" ")[2]!);

  it("is the primary for the Genesis brand, in both modes", () => {
    const genesis = themeVariables(GENESIS_THEME_BRAND);
    expect(genesis.light["--primary-text"]).toBe(genesis.light["--primary"]);
    expect(genesis.dark["--primary-text"]).toBe(genesis.dark["--primary"]);
    const roles = brandRoleVariables(genesisBrand);
    expect(roles.light["--primary-text"]).toBe(roles.light["--primary"]);
    expect(roles.dark["--primary-text"]).toBe(roles.dark["--primary"]);
  });

  it("follows --primary in the stylesheet, so an app that sets only --primary keeps its text colour", () => {
    const css = renderThemeCss(GENESIS_THEME_BRAND, { sans: "a", display: "b", mono: "c" });
    expect(css.match(/--primary-text: var\(--primary\);/g)).toHaveLength(2);
  });

  it.each(["#ffffff", "#f4f5fa"])("darkens a light gold accent until it reads at 4.5:1 on %s", (surface) => {
    const { light } = brandRoleVariables(gold(surface));
    const primary = light["--primary"]!;
    const text = light["--primary-text"]!;
    expect(contrast(hslToRgb(primary), hex(surface))).toBeLessThan(2);
    expect(contrast(hslToRgb(text), hex(surface))).toBeGreaterThanOrEqual(4.5);
    expect(hue(text)).toBe(hue(primary));
    expect(lightness(text)).toBeLessThan(lightness(primary));
    // The first step that reads: one point lighter doesn't.
    const [h, s] = text.split(" ");
    expect(contrast(hslToRgb(`${h} ${s} ${lightness(text) + 1}%`), hex(surface))).toBeLessThan(4.5);
  });

  it("keeps a primary that already reads (gold on the dark page)", () => {
    const { dark } = brandRoleVariables(gold("#ffffff"));
    expect(dark["--primary-text"]).toBe(dark["--primary"]);
  });

  it("lightens a dark primary on the dark page", () => {
    const navy = brandRoleVariables({ ...genesisBrand, name: "navy", dark: { accent: { DEFAULT: "#1e3a8a" } } }).dark;
    expect(contrast(hslToRgb(navy["--primary"]!), hslToRgb(navy["--background"]!))).toBeLessThan(4.5);
    expect(contrast(hslToRgb(navy["--primary-text"]!), hslToRgb(navy["--background"]!))).toBeGreaterThanOrEqual(4.5);
    expect(lightness(navy["--primary-text"]!)).toBeGreaterThan(lightness(navy["--primary"]!));
    expect(hue(navy["--primary-text"]!)).toBe(hue(navy["--primary"]!));
  });

  it("takes the brand's own primaryText and dark.primaryText as given", () => {
    const own = brandRoleVariables({ ...gold("#ffffff"), primaryText: "#7a5c00", dark: { primaryText: "#ffe08a" } });
    expect(hslToRgb(own.light["--primary-text"]!)).toEqual(hex("#7a5c00"));
    expect(hslToRgb(own.dark["--primary-text"]!)).toEqual(hex("#ffe08a"));
  });

  it("is a Tailwind color (text-primary-text) and in themeFromBrand's variables", () => {
    expect(tailwindColorVariables()["primary-text"]).toBe("hsl(var(--primary-text))");
    expect(themeFromBrand(gold("#ffffff")).variables.light["--primary-text"]).toBe(brandRoleVariables(gold("#ffffff")).light["--primary-text"]);
  });
});
