/**
 * Generated theme CSS: genesis.css carries the token font stacks, and the
 * Tailwind v4 bridge maps every color variable genesis.css declares.
 *
 * Renders through the same functions style-dictionary.config.ts calls. When
 * the package has been built (CI builds before testing), also checks the
 * files on disk match, so the build wiring can't drift from what is tested.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FONT_FAMILY_KEYS,
  fontFamiliesFromDtcg,
  formatFontStack,
  renderTailwind4Bridge,
  renderThemeCss,
} from "../theme-css";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const typography = JSON.parse(
  readFileSync(join(pkgRoot, "tokens", "dtcg", "typography.json"), "utf-8")
);
const fonts = fontFamiliesFromDtcg(typography);
const genesisBrand = { name: "genesis", h: 243, s: 75, l: 59, radius: "0.625rem" };
const themeCss = renderThemeCss(genesisBrand, fonts);
const bridgeCss = renderTailwind4Bridge();

/** Declarations inside the first `selector { ... }` block. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf("}", start));
  const decls = new Map<string, string>();
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*(.+);$/gm)) decls.set(m[1], m[2]);
  return decls;
}

/** Shadcn HSL components, e.g. `160 84% 39%`. */
const HSL_COMPONENTS = /^-?\d+(\.\d+)? -?\d+(\.\d+)?% -?\d+(\.\d+)?%$/;

describe("genesis.css font families", () => {
  for (const selector of [":root", ".dark"]) {
    it(`declares --font-sans, --font-display and --font-mono in ${selector} from the typography tokens`, () => {
      const decls = block(themeCss, selector);
      for (const key of FONT_FAMILY_KEYS) {
        const token: string = typography.font.family[key].$value;
        expect(decls.get(`--font-${key}`)).toBe(formatFontStack(token));
      }
    });
  }

  it("defaults --font-sans to Inter", () => {
    expect(block(themeCss, ":root").get("--font-sans")).toMatch(/^"?Inter"?, /);
  });

  it("quotes multi-word family names only, idempotently", () => {
    const expected = '"Space Grotesk", ui-sans-serif, sans-serif';
    expect(formatFontStack("Space Grotesk, ui-sans-serif, sans-serif")).toBe(expected);
    // Style Dictionary's fontFamily/css transform single-quotes; DTCG allows arrays.
    expect(formatFontStack("'Space Grotesk', ui-sans-serif, sans-serif")).toBe(expected);
    expect(formatFontStack(["Space Grotesk", "ui-sans-serif", "sans-serif"])).toBe(expected);
    expect(formatFontStack(expected)).toBe(expected);
    expect(formatFontStack('"Inter", SF Mono')).toBe('Inter, "SF Mono"');
  });

  it("rejects a typography doc missing a family", () => {
    expect(() =>
      fontFamiliesFromDtcg({ font: { family: { sans: { $value: "Inter" } } } })
    ).toThrow(/font\.family\.display/);
  });
});

describe("genesis-tailwind4.css bridge", () => {
  it("maps every color variable in genesis.css to a --color-* key", () => {
    const colorVars = [...block(themeCss, ":root")]
      .filter(([, value]) => HSL_COMPONENTS.test(value))
      .map(([name]) => name);
    expect(colorVars.length).toBeGreaterThan(30);

    const bridge = block(bridgeCss, "@theme inline");
    const mapped = new Map(
      [...bridge]
        .filter(([key]) => key.startsWith("--color-"))
        .map(([key, value]) => [value, key])
    );
    const unmapped = colorVars.filter((name) => !mapped.has(`hsl(var(${name}))`));
    expect(unmapped).toEqual([]);
  });

  it("only references variables genesis.css declares", () => {
    const declared = new Set(block(themeCss, ":root").keys());
    const referenced = [...bridgeCss.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(referenced.filter((name) => !declared.has(name))).toEqual([]);
  });

  it("maps --color-sidebar to --sidebar-background", () => {
    expect(block(bridgeCss, "@theme inline").get("--color-sidebar")).toBe(
      "hsl(var(--sidebar-background))"
    );
  });

  it("maps radius and the three font families", () => {
    const bridge = block(bridgeCss, "@theme inline");
    expect(bridge.get("--radius-lg")).toBe("var(--radius)");
    for (const key of ["--radius-sm", "--radius-md", "--radius-xl"]) {
      expect(bridge.has(key)).toBe(true);
    }
    for (const key of FONT_FAMILY_KEYS) {
      expect(bridge.get(`--font-${key}`)).toBe(`var(--font-${key})`);
    }
  });

  it("declares the class-based dark variant", () => {
    expect(bridgeCss).toContain("@custom-variant dark (&:is(.dark *));");
  });
});

describe("built files", () => {
  const themesDir = join(pkgRoot, "dist", "themes");
  const built = existsSync(join(themesDir, "genesis-tailwind4.css"));

  it.skipIf(!built)("dist/themes/genesis.css matches the renderer", () => {
    expect(readFileSync(join(themesDir, "genesis.css"), "utf-8")).toBe(themeCss);
  });

  it.skipIf(!built)("dist/themes/genesis-tailwind4.css matches the renderer", () => {
    expect(readFileSync(join(themesDir, "genesis-tailwind4.css"), "utf-8")).toBe(bridgeCss);
  });
});
