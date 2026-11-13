/**
 * @feat:app-themes
 * App brands (colours, fonts) and app themes (tokens, parts, css, shell), defined, rendered and
 * checked, and the starter set of each.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { genesisBrand } from "../../presets/brand-genesis";
import { brandContrastProblems } from "../../schema/brand-contrast";
import { GENESIS_THEME_BRAND, fontFamiliesFromDtcg, renderThemeCss } from "../../tokens/theme-css";
import {
  COMPONENT_TOKENS,
  STARTER_BRANDS,
  STARTER_THEMES,
  THEME_PARTS,
  THEME_ROLES,
  appBrandContrastProblems,
  appBrandCss,
  appBrandVariables,
  appThemeCss,
  appThemeVariables,
  arenaTheme,
  componentTokenProblem,
  defineAppBrand,
  defineAppTheme,
  getStarterBrand,
  getStarterTheme,
  parsePartSelector,
  pressBrand,
  renderAppThemesCss,
  trackerBrand,
  trackerTheme,
  validateAppBrand,
  validateAppTheme,
  type AppBrandInput,
  type AppThemeInput,
} from "../index";

const brandInput: AppBrandInput = { name: "acme", label: "Acme", description: "A test brand.", brand: { ...genesisBrand, name: "acme" } };
const themeInput: AppThemeInput = { name: "acme", label: "Acme", description: "A test theme.", feel: "test apps", suits: ["tests"] };
const has = (errors: string[], fragment: string) => expect(errors.some((e) => e.includes(fragment)), `${fragment} in\n${errors.join("\n")}`).toBe(true);

describe("defineAppBrand", () => {
  it("returns the brand frozen, with its name as its id", () => {
    const brand = defineAppBrand(brandInput);
    expect(brand.id).toBe("acme");
    expect(Object.isFrozen(brand.brand)).toBe(true);
  });

  it("lists every problem at once", () => {
    const errors = validateAppBrand({
      ...brandInput,
      name: "Bad Name",
      brand: { name: "x" } as never,
      roles: { light: { "not-a-role": "#fff", background: "red" } },
      fonts: { sans: "Inter; } body { color: red", serif: "Lora" } as never,
    });
    for (const f of ["appBrand.name", "appBrand.brand", "roles.light.not-a-role", "roles.light.background", "fonts.sans", "fonts.serif"]) has(errors, f);
    expect(() => defineAppBrand({ ...brandInput, name: "Bad Name" })).toThrow(/isn't valid/);
  });
});

describe("defineAppTheme", () => {
  it("returns the theme frozen, with its name as its id", () => {
    const theme = defineAppTheme(themeInput);
    expect(theme.id).toBe("acme");
    expect(Object.isFrozen(theme)).toBe(true);
  });

  it("lists every problem at once", () => {
    const errors = validateAppTheme({
      ...themeInput,
      name: "Bad Name",
      suits: [],
      pairsWith: "Not An Id",
      tokens: { "control-height": "tall", "no-such-token": "1rem", "card-shadow": "0 0 red; } x {" },
      parts: { carrd: { color: "hsl(var(--primary))" }, card: { Color: "red", padding: "1rem; }" } },
      css: "[data-slot=card] { color: red; } }",
      shell: { density: "roomy" as never, width: 3 } as never,
    });
    for (const f of [
      "appTheme.name",
      "appTheme.suits",
      "appTheme.pairsWith",
      "--control-height: a length",
      "--no-such-token: not a component token",
      "--card-shadow: a box-shadow",
      '"carrd": not a Genesis part',
      '["card"].Color',
      '["card"].padding',
      "appTheme.css: braces don't balance",
      "shell.density",
      "shell.width",
    ])
      has(errors, f);
  });

  it("leaves colours and fonts to the brand", () => {
    const errors = validateAppTheme({ ...themeInput, brand: genesisBrand, roles: {}, fonts: {} } as never);
    for (const f of ["appTheme.brand", "appTheme.roles", "appTheme.fonts"]) has(errors, f);
  });

  it("takes colours in parts from roles only, so they follow the brand", () => {
    for (const value of ["#ff0000", "rgb(255 0 0)", "hsl(0 100% 50%)", "1px solid #000", "oklch(0.6 0.2 30)"])
      has(validateAppTheme({ ...themeInput, parts: { card: { "border-color": value } } }), "a colour from a role");
    expect(validateAppTheme({ ...themeInput, parts: { card: { color: "hsl(var(--primary))", border: "1px solid hsl(var(--foreground) / 0.15)" } } })).toEqual([]);
    // A shadow is elevation, not a colour: literal shadow colours are fine.
    expect(validateAppTheme({ ...themeInput, parts: { card: { "box-shadow": "0 1px 2px rgb(0 0 0 / 0.2)" } } })).toEqual([]);
  });

  it("refuses CSS that would leave the theme's scope or fetch", () => {
    expect(validateAppTheme({ ...themeInput, css: "@import url(x.css);" })).toContain("appTheme.css: no @import and no </");
    expect(validateAppTheme({ ...themeInput, css: "} body { color: red; } x {" })).toContain("appTheme.css: braces don't balance");
    expect(validateAppTheme({ ...themeInput, css: '[data-slot="card"]::after { content: "}"; }' })).toEqual([]);
    expect(validateAppTheme({ ...themeInput, css: "/* unclosed" })).toContain("appTheme.css: braces don't balance");
    expect(validateAppTheme({ ...themeInput, css: 'a { content: "unclosed }' })).toContain("appTheme.css: braces don't balance");
  });

  it("checks raw CSS in linear time, whatever it holds", () => {
    const start = performance.now();
    validateAppTheme({ ...themeInput, css: "/*" + "a/*".repeat(200_000) });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("accepts an app's own parts, prefixed app-", () => {
    expect(validateAppTheme({ ...themeInput, parts: { "app-zone-switcher": { gap: "0" } } })).toEqual([]);
  });
});

describe("component tokens", () => {
  it("have unique names and sound defaults", () => {
    const names = COMPONENT_TOKENS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const token of COMPONENT_TOKENS) expect(componentTokenProblem(token.name, token.default), token.name).toBeNull();
  });

  it("name only real parts", () => {
    const parts = new Set(THEME_PARTS.map((p) => p.name));
    for (const token of COMPONENT_TOKENS) for (const part of token.parts) expect(parts.has(part), `${token.name} → ${part}`).toBe(true);
  });

  it("are declared at their defaults in genesis.css", () => {
    const fonts = fontFamiliesFromDtcg(JSON.parse(readFileSync(new URL("../../../tokens/dtcg/typography.json", import.meta.url), "utf-8")));
    const css = renderThemeCss(GENESIS_THEME_BRAND, fonts);
    for (const token of COMPONENT_TOKENS) expect(css).toContain(`--${token.name}: ${token.default};`);
  });

  it("refuse values that could break out of a declaration", () => {
    expect(componentTokenProblem("control-height", "calc(var(--radius) * 2)")).toBeNull();
    expect(componentTokenProblem("control-height", "2rem; color: red")).not.toBeNull();
    expect(componentTokenProblem("card-shadow", "0 0 0 1px url(x)")).not.toBeNull();
    expect(componentTokenProblem("control-font-weight", "bold")).not.toBeNull();
  });
});

describe("part selectors", () => {
  it("parse names, filters, a state and nesting", () => {
    expect(parsePartSelector("button[variant=outline][size=sm]:hover")).toEqual({
      parts: [{ name: "button", filters: [["variant", "outline"], ["size", "sm"]], state: "hover" }],
    });
    expect(parsePartSelector("shell-sidebar shell-nav-item[active]")).toMatchObject({ parts: [{ name: "shell-sidebar" }, { name: "shell-nav-item" }] });
    expect(parsePartSelector("card > button")).toHaveProperty("problem");
    expect(parsePartSelector("card:nth-child(2)")).toHaveProperty("problem");
    expect(parsePartSelector("card root")).toHaveProperty("problem");
  });
});

describe("the starter brands and themes", () => {
  it("come in matching pairs, found by id", () => {
    expect(STARTER_BRANDS.map((b) => b.id)).toEqual(STARTER_THEMES.map((t) => t.id));
    for (const theme of STARTER_THEMES) {
      expect(getStarterTheme(theme.id)).toBe(theme);
      expect(getStarterBrand(theme.pairsWith!)?.id).toBe(theme.id);
    }
    expect(getStarterBrand("nope")).toBeUndefined();
  });

  it.each(STARTER_BRANDS.map((b) => [b.id, b] as const))("brand %s reaches every contrast minimum, light and dark", (_id, brand) => {
    expect(appBrandContrastProblems(brand)).toEqual([]);
    expect(brandContrastProblems(brand.brand)).toEqual([]);
  });

  it.each(STARTER_THEMES.map((t) => [t.id, t] as const))("theme %s uses tokens, parts and the shell, and no colours", (_id, theme) => {
    expect(Object.keys(theme.tokens ?? {}).length).toBeGreaterThan(5);
    expect(Object.keys(theme.parts ?? {}).length).toBeGreaterThan(0);
    expect(theme.shell?.density).toBeDefined();
    const vars = appThemeVariables(theme);
    expect(Object.keys(vars.light).filter((v) => THEME_ROLES.includes(v.slice(2)) || v.startsWith("--font-"))).toEqual([]);
  });

  it("set every colour role in both modes", () => {
    for (const brand of STARTER_BRANDS) {
      const vars = appBrandVariables(brand);
      for (const role of THEME_ROLES) {
        expect(vars.light[`--${role}`], `${brand.id} light --${role}`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
        expect(vars.dark[`--${role}`], `${brand.id} dark --${role}`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
      }
    }
  });
});

describe("variables", () => {
  it("a brand: roles by hand over the brand's, and fonts", () => {
    const vars = appBrandVariables(pressBrand);
    expect(vars.light["--sidebar-background"]).toBe("204 14.7% 13.3%"); // #1d2327
    expect(vars.light["--card"]).toBe("0 0% 100%");
    expect(appBrandVariables(trackerBrand).light["--font-sans"]).toMatch(/^Inter, ui-sans-serif/);
  });

  it("a brand leaves corners to the theme unless it names a radius", () => {
    expect(appBrandVariables(trackerBrand).light["--radius"]).toBeUndefined();
    const own = defineAppBrand({ ...brandInput, brand: { ...genesisBrand, name: "acme", radius: { lg: "1rem" } } });
    expect(appBrandVariables(own).light["--radius"]).toBe("1rem");
  });

  it("a theme: tokens, dark tokens over light in dark mode", () => {
    const vars = appThemeVariables(trackerTheme);
    expect(vars.light["--control-height"]).toBe("2rem");
    expect(vars.light["--radius"]).toBe("0.375rem");
    expect(vars.light["--card-shadow"]).toBe("0 0 #0000"); // "none", composable with rings
    expect(vars.dark["--popover-shadow"]).toContain("rgb(0 0 0 / 0.6)");
    expect(vars.light["--popover-shadow"]).not.toContain("0.6)");
  });

  it("a theme that sets the radius declares the tokens computed from it again, in its own scope", () => {
    const vars = appThemeVariables(defineAppTheme({ ...themeInput, tokens: { radius: "0" } }));
    expect(vars.light["--card-radius"]).toBe("calc(var(--radius) * 1.4)");
    expect(appThemeVariables(defineAppTheme(themeInput)).light).toEqual({});
  });
});

describe("CSS", () => {
  it("scopes a brand to data-app-brand, light and .dark", () => {
    const css = appBrandCss(trackerBrand);
    expect(css).toContain(':root[data-app-brand="tracker"],\n[data-app-brand="tracker"] {\n  color-scheme: light;');
    expect(css).toContain(':root.dark[data-app-brand="tracker"],\n.dark[data-app-brand="tracker"],\n.dark [data-app-brand="tracker"] {\n  color-scheme: dark;');
    expect(css).not.toContain("data-slot");
  });

  it("scopes a theme to data-app-theme, with its part styles", () => {
    const css = appThemeCss(trackerTheme);
    expect(css).toMatch(/:root\[data-app-theme="tracker"\],\n\[data-app-theme="tracker"\] \{\n[^}]*--radius: 0\.375rem;/);
    expect(css).toContain('[data-app-theme="tracker"] [data-slot="button"][data-variant="default"] {\n  box-shadow:');
    expect(css).not.toContain("--primary:");
    const nested = appThemeCss(defineAppTheme({ ...themeInput, parts: { "shell-sidebar shell-nav-item:hover": { gap: "0" }, "root[density=compact]": { gap: "0" } } }));
    expect(nested).toContain('[data-app-theme="acme"] [data-slot="shell-sidebar"] [data-slot="shell-nav-item"]:hover {');
    expect(nested).toContain('[data-app-theme="acme"][data-density="compact"] {');
  });

  it("renders dark part styles under .dark, and raw CSS nested in the scope", () => {
    const out = appThemeCss(defineAppTheme({ ...themeInput, darkParts: { card: { "border-width": "0" } } }));
    expect(out).toContain('.dark[data-app-theme="acme"] [data-slot="card"],\n.dark [data-app-theme="acme"] [data-slot="card"] {');
    expect(appThemeCss(arenaTheme)).toMatch(/\[data-app-theme="arena"\] \{\n {2}\[data-slot="button"\]:active:not\(:disabled\) \{/);
  });

  it("takes another attribute name", () => {
    expect(appThemeCss(trackerTheme, { attribute: "data-look" })).toContain('[data-look="tracker"] [data-slot="button"]');
    expect(appBrandCss(trackerBrand, { attribute: "data-palette" })).toContain('[data-palette="tracker"]');
  });

  it("renders every brand, then every theme, in one stylesheet", () => {
    const all = renderAppThemesCss(STARTER_BRANDS, STARTER_THEMES);
    for (const b of STARTER_BRANDS) expect(all).toContain(`[data-app-brand="${b.id}"]`);
    for (const t of STARTER_THEMES) expect(all).toContain(`[data-app-theme="${t.id}"]`);
    // Themes come after brands, so a theme's corners win where both are on one element.
    expect(all.lastIndexOf("data-app-brand=")).toBeLessThan(all.indexOf('[data-app-theme="tracker"]'));
    expect(all).not.toMatch(/undefined|NaN/);
  });
});
