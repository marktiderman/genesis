/**
 * @feat:app-themes
 * defineAppTheme, the starter themes, component tokens, part styles, raw CSS, the shell, and contrast.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { genesisBrand } from "../../presets/brand-genesis";
import { brandContrastProblems } from "../../schema/brand-contrast";
import { GENESIS_THEME_BRAND, fontFamiliesFromDtcg, renderThemeCss } from "../../tokens/theme-css";
import {
  COMPONENT_TOKENS,
  STARTER_THEMES,
  THEME_PARTS,
  THEME_ROLES,
  appThemeContrastProblems,
  appThemeCss,
  appThemeVariables,
  arenaTheme,
  componentTokenProblem,
  defineAppTheme,
  getStarterTheme,
  parsePartSelector,
  pressTheme,
  renderAppThemesCss,
  trackerTheme,
  validateAppTheme,
  type AppThemeInput,
} from "../index";

const minimal: AppThemeInput = {
  name: "acme",
  label: "Acme",
  description: "A test theme.",
  feel: "test apps",
  suits: ["tests"],
  brand: { ...genesisBrand, name: "acme" },
};

describe("defineAppTheme", () => {
  it("returns the theme frozen, with its name as its id", () => {
    const theme = defineAppTheme(minimal);
    expect(theme.id).toBe("acme");
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.brand)).toBe(true);
  });

  it("lists every problem at once", () => {
    const errors = validateAppTheme({
      ...minimal,
      name: "Bad Name",
      suits: [],
      roles: { light: { "not-a-role": "#fff", background: "red" } },
      fonts: { sans: "Inter; } body { color: red", serif: "Lora" } as never,
      tokens: { "control-height": "tall", "no-such-token": "1rem", "card-shadow": "0 0 red; } x {" },
      parts: { carrd: { color: "red" }, card: { Color: "red", padding: "1rem; }" } },
      css: "[data-slot=card] { color: red; } }",
      shell: { density: "roomy" as never, width: 3 } as never,
    });
    for (const fragment of [
      "appTheme.name",
      "appTheme.suits",
      "roles.light.not-a-role",
      "roles.light.background",
      "fonts.sans",
      "fonts.serif",
      "--control-height: a length",
      "--no-such-token: not a component token",
      "--card-shadow: a box-shadow",
      '["carrd"]: "carrd": not a Genesis part',
      '["card"].Color',
      '["card"].padding',
      "appTheme.css: braces don't balance",
      "shell.density",
      "shell.width",
    ])
      expect(errors.some((e) => e.includes(fragment)), fragment).toBe(true);
    expect(() => defineAppTheme({ ...minimal, name: "Bad Name" })).toThrow(/isn't valid/);
  });

  it("checks the brand with validateBrand", () => {
    expect(validateAppTheme({ ...minimal, brand: { name: "x" } as never }).some((e) => e.startsWith("appTheme.brand"))).toBe(true);
  });

  it("refuses CSS that would leave the theme's scope or fetch", () => {
    expect(validateAppTheme({ ...minimal, css: "@import url(x.css);" })).toContain("appTheme.css: no @import and no </");
    expect(validateAppTheme({ ...minimal, css: "} body { color: red; } x {" })).toContain("appTheme.css: braces don't balance");
    expect(validateAppTheme({ ...minimal, css: '[data-slot="card"]::after { content: "}"; }' })).toEqual([]);
  });

  it("accepts an app's own parts, prefixed app-", () => {
    expect(validateAppTheme({ ...minimal, parts: { "app-zone-switcher": { color: "red" } } })).toEqual([]);
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
    expect(componentTokenProblem("control-height", "2rem")).toBeNull();
    expect(componentTokenProblem("control-height", "calc(var(--radius) * 2)")).toBeNull();
    expect(componentTokenProblem("control-height", "2rem; color: red")).not.toBeNull();
    expect(componentTokenProblem("card-shadow", "0 0 0 1px url(x)")).not.toBeNull();
    expect(componentTokenProblem("control-font-weight", "bold")).not.toBeNull();
    expect(componentTokenProblem("control-text-transform", "uppercase")).toBeNull();
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

describe("the starter themes", () => {
  it("have unique ids and are found by id", () => {
    const ids = STARTER_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getStarterTheme(id)?.id).toBe(id);
    expect(getStarterTheme("nope")).toBeUndefined();
  });

  it.each(STARTER_THEMES.map((t) => [t.id, t] as const))("%s reaches every contrast minimum, light and dark", (_id, theme) => {
    expect(appThemeContrastProblems(theme)).toEqual([]);
  });

  it.each(STARTER_THEMES.map((t) => [t.id, t] as const))("%s's brand passes the brand contrast check", (_id, theme) => {
    expect(brandContrastProblems(theme.brand)).toEqual([]);
  });

  it.each(STARTER_THEMES.map((t) => [t.id, t] as const))("%s uses component tokens, part styles and the shell", (_id, theme) => {
    expect(Object.keys(theme.tokens ?? {}).length).toBeGreaterThan(5);
    expect(Object.keys(theme.parts ?? {}).length).toBeGreaterThan(0);
    expect(theme.shell?.density).toBeDefined();
  });

  it("set every theme role in both modes", () => {
    for (const theme of STARTER_THEMES) {
      const vars = appThemeVariables(theme);
      for (const role of THEME_ROLES) {
        expect(vars.light[`--${role}`], `${theme.id} light --${role}`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
        expect(vars.dark[`--${role}`], `${theme.id} dark --${role}`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
      }
    }
  });
});

describe("appThemeVariables", () => {
  it("applies hand-set roles over the brand's, as HSL triplets", () => {
    const vars = appThemeVariables(pressTheme);
    expect(vars.light["--sidebar-background"]).toBe("204 14.7% 13.3%"); // #1d2327
    expect(vars.light["--card"]).toBe("0 0% 100%");
  });

  it("emits font stacks and tokens, dark tokens over light in dark mode", () => {
    const vars = appThemeVariables(trackerTheme);
    expect(vars.light["--font-sans"]).toMatch(/^Inter, ui-sans-serif/);
    expect(vars.light["--control-height"]).toBe("2rem");
    expect(vars.dark["--control-height"]).toBe("2rem");
    expect(vars.light["--card-shadow"]).toBe("0 0 #0000"); // "none", composable with rings
    expect(vars.dark["--popover-shadow"]).toContain("rgb(0 0 0 / 0.6)");
    expect(vars.light["--popover-shadow"]).not.toContain("0.6)");
  });

  it("leaves fonts and tokens alone when a theme sets none", () => {
    const vars = appThemeVariables(defineAppTheme(minimal));
    expect(vars.light["--font-sans"]).toBeUndefined();
    expect(vars.light["--control-height"]).toBeUndefined();
  });
});

describe("appThemeCss", () => {
  const css = appThemeCss(trackerTheme);

  it("scopes light to the attribute, outranking a plain :root", () => {
    expect(css).toContain(':root[data-app-theme="tracker"],\n[data-app-theme="tracker"] {\n  color-scheme: light;');
  });

  it("scopes dark to .dark on the element or an ancestor", () => {
    expect(css).toContain(':root.dark[data-app-theme="tracker"],\n.dark[data-app-theme="tracker"],\n.dark [data-app-theme="tracker"] {\n  color-scheme: dark;');
  });

  it("renders part styles as data-slot selectors under the theme", () => {
    expect(css).toContain('[data-app-theme="tracker"] [data-slot="button"][data-variant="default"] {\n  box-shadow:');
    const repo = appThemeCss(getStarterTheme("repository")!);
    expect(repo).toContain('[data-app-theme="repository"] [data-slot="shell-nav-item"][data-active] {');
    const nested = appThemeCss(defineAppTheme({ ...minimal, parts: { "shell-sidebar shell-nav-item:hover": { color: "red" }, "root[density=compact]": { gap: "0" } } }));
    expect(nested).toContain('[data-app-theme="acme"] [data-slot="shell-sidebar"] [data-slot="shell-nav-item"]:hover {');
    expect(nested).toContain('[data-app-theme="acme"][data-density="compact"] {');
  });

  it("renders dark part styles under .dark", () => {
    const out = appThemeCss(defineAppTheme({ ...minimal, darkParts: { card: { "border-color": "transparent" } } }));
    expect(out).toContain('.dark[data-app-theme="acme"] [data-slot="card"],\n.dark [data-app-theme="acme"] [data-slot="card"] {');
  });

  it("nests raw CSS in the theme's scope", () => {
    expect(appThemeCss(arenaTheme)).toMatch(/\[data-app-theme="arena"\] \{\n {2}\[data-slot="button"\]:active:not\(:disabled\) \{/);
  });

  it("takes another attribute name", () => {
    expect(appThemeCss(trackerTheme, { attribute: "data-look" })).toContain('[data-look="tracker"] [data-slot="button"]');
  });

  it("renders every theme into one stylesheet", () => {
    const all = renderAppThemesCss(STARTER_THEMES);
    for (const theme of STARTER_THEMES) expect(all).toContain(`[data-app-theme="${theme.id}"]`);
    expect(all).not.toMatch(/undefined|NaN/);
  });
});
