/**
 * @feat:starter-themes
 * defineStarterTheme, the shipped themes, their variables, scoped CSS and contrast.
 */
import { describe, expect, it } from "vitest";
import { genesisBrand } from "../../presets/brand-genesis";
import { brandContrastProblems } from "../../schema/brand-contrast";
import {
  STARTER_THEMES,
  THEME_ROLES,
  defineStarterTheme,
  getStarterTheme,
  pressTheme,
  renderStarterThemesCss,
  starterThemeContrastProblems,
  starterThemeCss,
  starterThemeVariables,
  trackerTheme,
  validateStarterTheme,
  type StarterThemeInput,
} from "../index";

const minimal: StarterThemeInput = {
  name: "acme",
  label: "Acme",
  description: "A test theme.",
  feel: "test apps",
  suits: ["tests"],
  brand: { ...genesisBrand, name: "acme" },
};

describe("defineStarterTheme", () => {
  it("returns the theme frozen, with its name as its id", () => {
    const theme = defineStarterTheme(minimal);
    expect(theme.id).toBe("acme");
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.brand)).toBe(true);
  });

  it("lists every problem at once", () => {
    const errors = validateStarterTheme({
      ...minimal,
      name: "Bad Name",
      suits: [],
      roles: { light: { "not-a-role": "#fff", background: "red" } },
      fonts: { sans: "Inter; } body { color: red", serif: "Lora" } as never,
      shell: { density: "roomy" as never },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("starterTheme.name"),
        expect.stringContaining("starterTheme.suits"),
        expect.stringContaining("roles.light.not-a-role"),
        expect.stringContaining("roles.light.background"),
        expect.stringContaining("fonts.sans"),
        expect.stringContaining("fonts.serif"),
        expect.stringContaining("shell.density"),
      ]),
    );
    expect(() => defineStarterTheme({ ...minimal, name: "Bad Name" })).toThrow(/isn't valid/);
  });

  it("checks the brand with validateBrand", () => {
    expect(validateStarterTheme({ ...minimal, brand: { name: "x" } as never }).some((e) => e.startsWith("starterTheme.brand"))).toBe(true);
  });
});

describe("the shipped themes", () => {
  it("have unique ids and are found by id", () => {
    const ids = STARTER_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getStarterTheme(id)?.id).toBe(id);
    expect(getStarterTheme("nope")).toBeUndefined();
  });

  it.each(STARTER_THEMES.map((t) => [t.id, t] as const))("%s reaches every contrast minimum, light and dark", (_id, theme) => {
    expect(starterThemeContrastProblems(theme)).toEqual([]);
  });

  it.each(STARTER_THEMES.map((t) => [t.id, t] as const))("%s's brand passes the brand contrast check", (_id, theme) => {
    // Status fills and marks, the primary as a fill on the page: what validateBrand warns about.
    expect(brandContrastProblems(theme.brand)).toEqual([]);
  });

  it("set every theme role in both modes", () => {
    for (const theme of STARTER_THEMES) {
      const vars = starterThemeVariables(theme);
      for (const role of THEME_ROLES) {
        expect(vars.light[`--${role}`], `${theme.id} light --${role}`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
        expect(vars.dark[`--${role}`], `${theme.id} dark --${role}`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
      }
    }
  });
});

describe("starterThemeVariables", () => {
  it("applies hand-set roles over the brand's, as HSL triplets", () => {
    const vars = starterThemeVariables(pressTheme);
    expect(vars.light["--sidebar-background"]).toBe("204 14.7% 13.3%"); // #1d2327
    expect(vars.light["--card"]).toBe("0 0% 100%");
    expect(vars.light["--background"]).not.toBe(vars.light["--card"]);
  });

  it("emits font stacks, quoting multi-word families", () => {
    const vars = starterThemeVariables(trackerTheme);
    expect(vars.light["--font-sans"]).toMatch(/^Inter, ui-sans-serif/);
    expect(vars.dark["--font-mono"]).toMatch(/^"JetBrains Mono"/);
  });

  it("leaves fonts alone when a theme sets none", () => {
    const vars = starterThemeVariables(defineStarterTheme(minimal));
    expect(vars.light["--font-sans"]).toBeUndefined();
  });
});

describe("starterThemeCss", () => {
  const css = starterThemeCss(trackerTheme);

  it("scopes light to the attribute, outranking a plain :root", () => {
    expect(css).toContain(':root[data-theme="tracker"],\n[data-theme="tracker"] {\n  color-scheme: light;');
  });

  it("scopes dark to .dark on the element or an ancestor", () => {
    expect(css).toContain(':root.dark[data-theme="tracker"],\n.dark[data-theme="tracker"],\n.dark [data-theme="tracker"] {\n  color-scheme: dark;');
  });

  it("takes another attribute name", () => {
    expect(starterThemeCss(trackerTheme, { attribute: "data-look" })).toContain('[data-look="tracker"]');
  });

  it("renders every theme into one stylesheet", () => {
    const all = renderStarterThemesCss(STARTER_THEMES);
    for (const theme of STARTER_THEMES) expect(all).toContain(`[data-theme="${theme.id}"]`);
    expect(all).not.toMatch(/undefined|NaN/);
  });
});
