/**
 * @feat:app-themes
 * App themes: a brand, a style and a layout, each optional, defined, checked and applied.
 */
import { describe, expect, it } from "vitest";
import { STARTER_STYLES, getStarterBrand, getStarterStyle } from "@marktiderman/genesis-design-system/app-styles";
import { STARTER_THEMES, appThemeAttributes, defineAppTheme, getStarterTheme, validateAppTheme, withPairedBrand } from "..";

const base = { name: "acme", label: "Acme", description: "A test theme." };

describe("defineAppTheme", () => {
  it("bundles a brand, a style and a layout, frozen, with its name as its id", () => {
    const theme = defineAppTheme({ ...base, brand: getStarterBrand("tracker")!, style: getStarterStyle("notebook")!, layout: { density: "compact" } });
    expect(theme.id).toBe("acme");
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.layout)).toBe(true);
  });

  it("takes every piece as optional, so the app's own stands", () => {
    expect(validateAppTheme(base)).toEqual([]);
    expect(appThemeAttributes(defineAppTheme(base))).toEqual({});
  });

  it("sends tokens and parts to a style, colours and fonts to a brand, and checks the layout", () => {
    const errors = validateAppTheme({ ...base, tokens: {}, roles: {}, widgets: [], layout: { density: "roomy", width: 3 } } as never);
    for (const f of ["appTheme.tokens: belongs to an app style", "appTheme.roles: belongs to an app brand", "appTheme.widgets: not a theme piece", "appTheme.layout.density", "appTheme.layout.width"])
      expect(errors.some((e) => e.includes(f)), `${f} in ${errors.join(" | ")}`).toBe(true);
    expect(validateAppTheme({ ...base, style: "tracker" } as never)).toContain("appTheme.style: expected an app style (defineAppStyle)");
    expect(validateAppTheme({ ...base, layout: { navigation: "drawer", frame: "floating" } } as never)).toEqual([
      "appTheme.layout.navigation: one of sidebar, rail, top-tabs, bottom-bar, page-tree",
      "appTheme.layout.frame: one of flush, inset",
    ]);
    expect(validateAppTheme({ ...base, layout: { navigation: "top-tabs", frame: "inset", density: "spacious" } })).toEqual([]);
  });
});

describe("appThemeAttributes", () => {
  it("names the brand and the style it carries", () => {
    expect(appThemeAttributes(withPairedBrand(getStarterTheme("press")!))).toEqual({ "data-app-brand": "press", "data-app-style": "press" });
    expect(appThemeAttributes(getStarterTheme("press"))).toEqual({ "data-app-style": "press" });
    expect(appThemeAttributes(undefined)).toEqual({});
  });
});

describe("the starter themes", () => {
  it("are one per starter style, in its order, with a layout and no brand", () => {
    expect(STARTER_THEMES.map((t) => t.id)).toEqual(STARTER_STYLES.map((s) => s.id));
    for (const theme of STARTER_THEMES) {
      expect(theme.style).toBe(getStarterStyle(theme.id));
      expect(theme.brand).toBeUndefined();
      expect(theme.layout?.density).toBeDefined();
      expect(getStarterTheme(theme.id)).toBe(theme);
    }
  });

  it("name a navigation style and a frame (ADR 0022)", () => {
    expect(getStarterTheme("tracker")?.layout).toMatchObject({ navigation: "sidebar", frame: "inset" });
    expect(getStarterTheme("notebook")?.layout).toMatchObject({ navigation: "page-tree", frame: "flush" });
    for (const theme of STARTER_THEMES) {
      expect(theme.layout?.navigation).toBeDefined();
      expect(theme.layout?.frame).toBeDefined();
    }
  });

  it("can be worn in the brand each was designed with", () => {
    for (const theme of STARTER_THEMES) expect(withPairedBrand(theme).brand?.id).toBe(theme.style?.pairsWith);
  });
});
