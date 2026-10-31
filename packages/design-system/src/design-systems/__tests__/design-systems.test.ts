/**
 * @feat:design-systems
 * defineDesignSystem, the registry, the OKLCH colour engine and themeFromBrand with a design system.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { genesisBrand } from "../../presets/brand-genesis";
import { themeFromBrand } from "../../factories/from-brand";
import { clampBounds, validateBrand } from "../../schema/brand";
import { FONT_CHOICES, fontForStack } from "../../fonts";
import {
  DEFAULT_RAMP,
  GROUNDS,
  NEUTRAL_DESIGN_SYSTEMS,
  classicDesignSystem,
  contrast,
  crispDesignSystem,
  defineDesignSystem,
  designSystemTheme,
  fluid,
  getDesignSystem,
  hexToOklch,
  oklchToHex,
  palette,
  ramp,
  registerDesignSystem,
  rolePairs,
  softDesignSystem,
  unregisterDesignSystem,
  validateDesignSystemChoice,
} from "../index";

afterEach(() => vi.restoreAllMocks());

describe("fluid sizes", () => {
  it("clamps each step between a 360px and a 1440px viewport", () => {
    // The display step from the design review: 48px → 112px.
    expect(fluid({ min: 3, max: 7 })).toBe("clamp(3rem, 1.6667rem + 5.9259vw, 7rem)");
    expect(fluid({ min: 1, max: 1.125 })).toBe("clamp(1rem, 0.9583rem + 0.1852vw, 1.125rem)");
    expect(fluid({ min: 2, max: 2 })).toBe("2rem");
  });

  it("is a length the brand schema accepts, and native reads its minimum", () => {
    const size = fluid(DEFAULT_RAMP.display);
    expect(clampBounds(size)).toEqual({ min: 3, max: 7 });
    const brand = { ...genesisBrand, typography: { fontSize: { display: size } }, spacing: { section: fluid({ min: 4, max: 7.5 }) } };
    expect(validateBrand(brand)).toEqual({ ok: true, errors: [] });
    const native = themeFromBrand(brand);
    expect(native.theme.fontSize.display).toBe(48);
    expect(native.theme.spacing.section).toBe(64);
  });

  it("accepts only a clamp of rems and one vw term", () => {
    const sizes = (v: string) => validateBrand({ ...genesisBrand, typography: { fontSize: { x: v } } }).ok;
    expect(sizes("clamp(1rem, -0.5rem + 2vw, 3rem)")).toBe(true);
    expect(sizes("clamp(12px, 1vw, 20px)")).toBe(false);
    expect(sizes("clamp(1rem, 1rem + 2vw, 3rem); color: red")).toBe(false);
    expect(sizes("calc(1rem + 2vw)")).toBe(false);
    expect(sizes("min(1rem, 2vw)")).toBe(false);
    // A clamp whose min is above its max never applies its middle term.
    expect(sizes("clamp(3rem, 1rem + 2vw, 1rem)")).toBe(false);
  });
});

describe("the colour engine", () => {
  it("round-trips sRGB through OKLCH", () => {
    for (const hex of ["#4f46e5", "#c6ff00", "#e10600", "#1e2a4a", "#ffffff", "#000000"]) expect(oklchToHex(hexToOklch(hex))).toBe(hex);
  });

  it("keeps the brand's own colour on its nearest ramp step", () => {
    const r = ramp("#e10600");
    expect(Object.values(r)).toContain("#e10600");
    expect(Object.keys(r)).toHaveLength(11);
  });

  it("keeps neon as a fill and solves a darker text form for it", () => {
    const { light } = palette({ primary: "#c6ff00", ground: "paper" });
    expect(light.accentFill).toBe("#c6ff00");
    expect(contrast(light.accentFill, light.ground)).toBeLessThan(3);
    expect(contrast(light.accentText, light.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.onAccent, light.accentFill)).toBeGreaterThanOrEqual(4.5);
    // The fill is too faint to edge itself on the page, so its edge is the text form.
    expect(light.accentEdge).toBe(light.accentText);
  });

  it("never prints pure white or pure black as the ground or ink, except `pure`'s near-white", () => {
    for (const ground of GROUNDS) {
      const { light, dark } = palette({ primary: "#4f46e5", ground });
      for (const roles of [light, dark]) {
        expect(roles.ground).not.toBe("#ffffff");
        expect(roles.ink).not.toBe("#000000");
      }
    }
  });

  it("tints the neutrals warm on paper and cool on chalk", () => {
    const warm = hexToOklch(palette({ primary: "#4f46e5", ground: "paper" }).light.ground);
    const cool = hexToOklch(palette({ primary: "#4f46e5", ground: "chalk" }).light.ground);
    expect(warm.h).toBeGreaterThan(40);
    expect(warm.h).toBeLessThan(110);
    expect(cool.h).toBeGreaterThan(200);
    expect(cool.h).toBeLessThan(280);
  });

  // A sweep: 24 hues × 5 lightnesses × 3 chromas × every ground, light and dark, with a secondary.
  it("passes every pair it promises, for any brand colour", () => {
    const failures: string[] = [];
    for (let h = 0; h < 360; h += 15)
      for (const l of [0.15, 0.35, 0.55, 0.75, 0.95])
        for (const c of [0.02, 0.12, 0.3]) {
          const primary = oklchToHex({ l, c, h });
          const secondary = oklchToHex({ l: 1 - l, c, h: (h + 150) % 360 });
          for (const ground of GROUNDS) {
            const p = palette({ primary, secondary, ground });
            for (const [mode, roles] of [["light", p.light], ["dark", p.dark]] as const) {
              for (const pair of rolePairs(roles)) {
                const ratio = contrast(pair.foreground, pair.background);
                if (ratio < pair.minimum) failures.push(`${primary} ${ground} ${mode}: ${pair.name} ${ratio.toFixed(2)}`);
              }
            }
          }
        }
    expect(failures).toEqual([]);
  });

  it("refuses a colour that isn't hex", () => {
    expect(() => palette({ primary: "red;}", ground: "paper" })).toThrow(/not a #rgb/);
  });
});

describe("defineDesignSystem", () => {
  it("returns it frozen, with its id", () => {
    expect(crispDesignSystem.id).toBe("crisp@1");
    expect(Object.isFrozen(crispDesignSystem)).toBe(true);
    expect(Object.isFrozen(crispDesignSystem.type!.ramp.display)).toBe(true);
  });

  it("says every problem at once", () => {
    expect(() =>
      defineDesignSystem({
        name: "Bad Name",
        version: 0,
        label: "",
        space: { density: "roomy" as never },
        type: { ramp: { ...DEFAULT_RAMP, display: { min: 8, max: 3 } } },
        extra: true,
      } as never),
    ).toThrow(/extra: unknown property[\s\S]*name[\s\S]*version[\s\S]*label[\s\S]*display: min is larger than max[\s\S]*density/);
  });

  it("ships three neutral design systems, classic first", () => {
    expect(NEUTRAL_DESIGN_SYSTEMS.map((d) => d.id)).toEqual(["classic@1", "crisp@1", "soft@1"]);
  });
});

describe("the registry", () => {
  const custom = defineDesignSystem({ name: "test-quiet", version: 1, label: "Quiet", motion: { level: "none" } });
  afterEach(() => unregisterDesignSystem(custom.id));

  it("resolves built-in and registered design systems by id", () => {
    expect(getDesignSystem("crisp@1")).toBe(crispDesignSystem);
    expect(getDesignSystem(custom.id)).toBeUndefined();
    registerDesignSystem(custom);
    expect(getDesignSystem(custom.id)).toBe(custom);
  });

  it("refuses a different look under an id that exists: that's a new version", () => {
    registerDesignSystem(custom);
    const changed = defineDesignSystem({ name: "test-quiet", version: 1, label: "Quiet", motion: { level: "bold" } });
    expect(() => registerDesignSystem(changed)).toThrow(/new version \(test-quiet@2\)/);
    expect(() => registerDesignSystem(defineDesignSystem({ name: "crisp", version: 1, label: "Not crisp" }))).toThrow(/already registered/);
  });
});

describe("themeFromBrand with a design system", () => {
  it("adds nothing for classic@1, today's look", () => {
    const plain = themeFromBrand(genesisBrand);
    const classic = themeFromBrand({ ...genesisBrand, designSystem: { id: "classic@1" } });
    expect(classic.variables).toEqual(plain.variables);
    expect(classic.designSystem?.id).toBe("classic@1");
    expect(classic.designSystem?.pairs).toEqual([]);
  });

  it("adds the tokens and the colour roles, from the brand's id or an option", () => {
    const viaBrand = themeFromBrand({ ...genesisBrand, designSystem: { id: "soft@1" } });
    const viaOption = themeFromBrand(genesisBrand, { designSystem: softDesignSystem });
    expect(viaBrand.variables).toEqual(viaOption.variables);
    const v = viaBrand.variables.light;
    expect(v["--ds-text-display"]).toBe(fluid({ min: 2.75, max: 5.5 }));
    expect(v["--ds-section-y-md"]).toBe(fluid({ min: 5, max: 11 }));
    expect(v["--ds-reveal"]).toBe("ds-rise");
    expect(v["--ds-image-filter"]).toBe("saturate(0.92) contrast(1.04) sepia(0.06)");
    expect(v["--background"]).toMatch(/^\d/);
    expect(viaBrand.variables.dark["--ds-shadow-2"]).toBe("none");
  });

  it("applies the brand's choices over the design system's defaults", () => {
    const t = themeFromBrand({ ...genesisBrand, designSystem: { id: "soft@1", density: "compact", corners: "square", motion: "none" } });
    expect(t.designSystem?.choices).toEqual({ density: "compact", corners: "square", motion: "none" });
    expect(t.variables.light["--ds-section-y-md"]).toBe(fluid({ min: 3, max: 5 }));
    expect(t.variables.light["--ds-radius-button"]).toBe("0px");
    expect(t.variables.light["--ds-reveal"]).toBe("none");
  });

  it("sets headings by the brand's font class", () => {
    const condensed = { ...genesisBrand, designSystem: { id: "crisp@1" }, typography: { fontFamily: { display: ["Bebas Neue", "Impact"], body: ["Inter"] } } };
    expect(fontForStack(condensed.typography.fontFamily.display)).toBe(FONT_CHOICES["bebas-neue"]);
    const v = themeFromBrand(condensed).variables.light;
    expect(v["--ds-display-case"]).toBe("uppercase");
    expect(v["--ds-leading-display"]).toBe("0.88");
  });

  it("reports an id it can't find, and themes without it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = themeFromBrand({ ...genesisBrand, designSystem: { id: "nowhere@1" } });
    expect(t.designSystem).toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"nowhere@1"'));
  });

  it("validates the brand's choice", () => {
    expect(validateBrand({ ...genesisBrand, designSystem: { id: "crisp@1", density: "generous" } }).ok).toBe(true);
    expect(validateBrand({ ...genesisBrand, designSystem: { id: "crisp", corners: "pointy", extra: 1 } }).errors).toEqual([
      "brand.designSystem.extra: unknown property",
      'brand.designSystem.id: expected "name@version", e.g. "crisp@1"',
      "brand.designSystem.corners: one of square, crisp, soft, round, friendly",
    ]);
    expect(validateDesignSystemChoice("crisp@1")).toEqual(["designSystem: expected object"]);
  });

  it("keeps every engine pair at AA for every neutral design system", () => {
    for (const ds of NEUTRAL_DESIGN_SYSTEMS) {
      const t = designSystemTheme(ds, { choices: { density: "normal", corners: "soft", motion: "calm" }, colors: { primary: "#c6ff00" } });
      for (const pair of t.pairs) expect(contrast(pair.foreground, pair.background), `${ds.id} ${pair.mode} ${pair.name}`).toBeGreaterThanOrEqual(pair.minimum);
    }
    expect(designSystemTheme(classicDesignSystem, { choices: { density: "normal", corners: "soft", motion: "none" } }).variables).toEqual({ light: {}, dark: {} });
  });
});
