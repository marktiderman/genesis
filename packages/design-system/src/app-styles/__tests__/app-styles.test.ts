/**
 * @feat:app-themes
 * App brands (colours, typefaces) and app styles (tokens, parts, css), defined, rendered and
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
  STARTER_STYLES,
  THEME_PARTS,
  THEME_ROLES,
  appBrandContrastProblems,
  appBrandCss,
  appBrandVariables,
  appStyleCss,
  appStyleVariables,
  arenaStyle,
  componentTokenProblem,
  defineAppBrand,
  defineAppStyle,
  getStarterBrand,
  getStarterStyle,
  parsePartSelector,
  pressBrand,
  renderAppStylesCss,
  trackerBrand,
  trackerStyle,
  validateAppBrand,
  validateAppStyle,
  type AppBrandInput,
  type AppStyleInput,
} from "../index";

const brandInput: AppBrandInput = { name: "acme", label: "Acme", description: "A test brand.", brand: { ...genesisBrand, name: "acme" } };
const styleInput: AppStyleInput = { name: "acme", label: "Acme", description: "A test style.", feel: "test apps", suits: ["tests"] };
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

  // @feat:org-brands
  it("carries the app's name, a logo and a square mark, checked", () => {
    const brand = defineAppBrand({
      ...brandInput,
      appName: "Acme Studio",
      logo: { src: "https://cdn.example.com/acme.svg", alt: "Acme Studio", darkSrc: "/brand/acme-dark.svg" },
      mark: { src: "data:image/png;base64,iVBORw0KGgo=", alt: "" },
    });
    expect(brand.appName).toBe("Acme Studio");
    expect(Object.isFrozen(brand.logo)).toBe(true);
    const errors = validateAppBrand({
      ...brandInput,
      appName: " ",
      logo: { src: "javascript:alert(1)", alt: "x" },
      mark: { src: "//evil.example/x.png", alt: 3 as never, darkSrc: "data:text/html;base64,AA==" },
    });
    for (const f of ["appBrand.appName", "appBrand.logo.src", "appBrand.mark.src", "appBrand.mark.alt", "appBrand.mark.darkSrc"]) has(errors, f);
  });
});

describe("defineAppStyle", () => {
  it("returns the style frozen, with its name as its id", () => {
    const style = defineAppStyle(styleInput);
    expect(style.id).toBe("acme");
    expect(Object.isFrozen(style)).toBe(true);
  });

  it("lists every problem at once", () => {
    const errors = validateAppStyle({
      ...styleInput,
      name: "Bad Name",
      suits: [],
      pairsWith: "Not An Id",
      tokens: { "control-height": "tall", "no-such-token": "1rem", "card-shadow": "0 0 red; } x {" },
      parts: { carrd: { color: "hsl(var(--primary))" }, card: { Color: "red", padding: "1rem; }" } },
      css: "[data-slot=card] { color: red; } }",
      shell: { density: "compact" },
    } as never);
    for (const f of [
      "appStyle.name",
      "appStyle.suits",
      "appStyle.pairsWith",
      "--control-height: a length",
      "--no-such-token: not a component token",
      "--card-shadow: a box-shadow",
      '"carrd": not a Genesis part',
      '["card"].Color',
      '["card"].padding',
      "appStyle.css: braces don't balance",
      "appStyle.shell: a layout is an app theme's",
    ])
      has(errors, f);
  });

  it("leaves colours and fonts to the brand", () => {
    const errors = validateAppStyle({ ...styleInput, brand: genesisBrand, roles: {}, fonts: {} } as never);
    for (const f of ["appStyle.brand", "appStyle.roles", "appStyle.fonts"]) has(errors, f);
  });

  it("takes colours in parts from roles only, so they follow the brand", () => {
    for (const value of ["#ff0000", "rgb(255 0 0)", "hsl(0 100% 50%)", "1px solid #000", "oklch(0.6 0.2 30)"])
      has(validateAppStyle({ ...styleInput, parts: { card: { "border-color": value } } }), "a colour from a role");
    expect(validateAppStyle({ ...styleInput, parts: { card: { color: "hsl(var(--primary))", border: "1px solid hsl(var(--foreground) / 0.15)" } } })).toEqual([]);
    // A shadow is elevation, not a colour: literal shadow colours are fine.
    expect(validateAppStyle({ ...styleInput, parts: { card: { "box-shadow": "0 1px 2px rgb(0 0 0 / 0.2)" } } })).toEqual([]);
  });

  it("refuses CSS that would leave the style's scope or fetch", () => {
    expect(validateAppStyle({ ...styleInput, css: "@import url(x.css);" })).toContain("appStyle.css: no @import and no </");
    expect(validateAppStyle({ ...styleInput, css: "} body { color: red; } x {" })).toContain("appStyle.css: braces don't balance");
    expect(validateAppStyle({ ...styleInput, css: '[data-slot="card"]::after { content: "}"; }' })).toEqual([]);
    expect(validateAppStyle({ ...styleInput, css: "/* unclosed" })).toContain("appStyle.css: braces don't balance");
    expect(validateAppStyle({ ...styleInput, css: 'a { content: "unclosed }' })).toContain("appStyle.css: braces don't balance");
  });

  it("checks raw CSS in linear time, whatever it holds", () => {
    const start = performance.now();
    validateAppStyle({ ...styleInput, css: "/*" + "a/*".repeat(200_000) });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("accepts an app's own parts, prefixed app-", () => {
    expect(validateAppStyle({ ...styleInput, parts: { "app-zone-switcher": { gap: "0" } } })).toEqual([]);
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

describe("the starter brands and styles", () => {
  it("come in matching pairs, found by id", () => {
    expect(STARTER_BRANDS.map((b) => b.id)).toEqual(STARTER_STYLES.map((t) => t.id));
    for (const style of STARTER_STYLES) {
      expect(getStarterStyle(style.id)).toBe(style);
      expect(getStarterBrand(style.pairsWith!)?.id).toBe(style.id);
    }
    expect(getStarterBrand("nope")).toBeUndefined();
  });

  it.each(STARTER_BRANDS.map((b) => [b.id, b] as const))("brand %s reaches every contrast minimum, light and dark", (_id, brand) => {
    expect(appBrandContrastProblems(brand)).toEqual([]);
    expect(brandContrastProblems(brand.brand)).toEqual([]);
  });

  it.each(STARTER_STYLES.map((t) => [t.id, t] as const))("style %s uses tokens and parts, and no colours", (_id, style) => {
    expect(Object.keys(style.tokens ?? {}).length).toBeGreaterThan(5);
    expect(Object.keys(style.parts ?? {}).length).toBeGreaterThan(0);
    const vars = appStyleVariables(style);
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

  it("a brand leaves corners to the style unless it names a radius", () => {
    expect(appBrandVariables(trackerBrand).light["--radius"]).toBeUndefined();
    const own = defineAppBrand({ ...brandInput, brand: { ...genesisBrand, name: "acme", radius: { lg: "1rem" } } });
    expect(appBrandVariables(own).light["--radius"]).toBe("1rem");
  });

  it("a style: tokens, dark tokens over light in dark mode", () => {
    const vars = appStyleVariables(trackerStyle);
    expect(vars.light["--control-height"]).toBe("2rem");
    expect(vars.light["--radius"]).toBe("0.375rem");
    expect(vars.light["--card-shadow"]).toBe("0 0 #0000"); // "none", composable with rings
    expect(vars.dark["--popover-shadow"]).toContain("rgb(0 0 0 / 0.6)");
    expect(vars.light["--popover-shadow"]).not.toContain("0.6)");
  });

  it("a style that sets the radius declares the tokens computed from it again, in its own scope", () => {
    const vars = appStyleVariables(defineAppStyle({ ...styleInput, tokens: { radius: "0" } }));
    expect(vars.light["--card-radius"]).toBe("calc(var(--radius) * 1.4)");
    expect(appStyleVariables(defineAppStyle(styleInput)).light).toEqual({});
  });
});

describe("CSS", () => {
  it("scopes a brand to data-app-brand, light and .dark", () => {
    const css = appBrandCss(trackerBrand);
    expect(css).toContain(':root[data-app-brand="tracker"],\n[data-app-brand="tracker"] {\n  color-scheme: light;');
    expect(css).toContain(':root.dark[data-app-brand="tracker"],\n.dark[data-app-brand="tracker"],\n.dark [data-app-brand="tracker"] {\n  color-scheme: dark;');
    expect(css).not.toContain("data-slot");
  });

  it("scopes a style to data-app-style, with its part styles", () => {
    const css = appStyleCss(trackerStyle);
    expect(css).toMatch(/:root\[data-app-style="tracker"\],\n\[data-app-style="tracker"\] \{\n[^}]*--radius: 0\.375rem;/);
    expect(css).toContain('[data-app-style="tracker"] [data-slot="button"][data-variant="default"] {\n  box-shadow:');
    expect(css).not.toContain("--primary:");
    const nested = appStyleCss(defineAppStyle({ ...styleInput, parts: { "shell-sidebar shell-nav-item:hover": { gap: "0" }, "root[density=compact]": { gap: "0" } } }));
    expect(nested).toContain('[data-app-style="acme"] [data-slot="shell-sidebar"] [data-slot="shell-nav-item"]:hover {');
    expect(nested).toContain('[data-app-style="acme"][data-density="compact"] {');
  });

  it("renders dark part styles under .dark, and raw CSS nested in the scope", () => {
    const out = appStyleCss(defineAppStyle({ ...styleInput, darkParts: { card: { "border-width": "0" } } }));
    expect(out).toContain('.dark[data-app-style="acme"] [data-slot="card"],\n.dark [data-app-style="acme"] [data-slot="card"] {');
    expect(appStyleCss(arenaStyle)).toMatch(/\[data-app-style="arena"\] \{\n {2}\[data-slot="button"\]:active:not\(:disabled\) \{/);
  });

  it("takes another attribute name", () => {
    expect(appStyleCss(trackerStyle, { attribute: "data-look" })).toContain('[data-look="tracker"] [data-slot="button"]');
    expect(appBrandCss(trackerBrand, { attribute: "data-palette" })).toContain('[data-palette="tracker"]');
  });

  it("renders every brand, then every style, in one stylesheet", () => {
    const all = renderAppStylesCss(STARTER_BRANDS, STARTER_STYLES);
    for (const b of STARTER_BRANDS) expect(all).toContain(`[data-app-brand="${b.id}"]`);
    for (const t of STARTER_STYLES) expect(all).toContain(`[data-app-style="${t.id}"]`);
    // Styles come after brands, so a style's corners win where both are on one element.
    expect(all.lastIndexOf("data-app-brand=")).toBeLessThan(all.indexOf('[data-app-style="tracker"]'));
    expect(all).not.toMatch(/undefined|NaN/);
  });
});
