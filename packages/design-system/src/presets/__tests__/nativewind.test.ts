/**
 * The NativeWind v4 preset: the role colors the ui-native components use are
 * generated, and their variables carry genesis.css's values in both modes.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { genesisNativewindPreset } from "../nativewind";
import { GENESIS_THEME_BRAND, fontFamiliesFromDtcg, renderThemeCss } from "../../tokens/theme-css";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fonts = fontFamiliesFromDtcg(JSON.parse(readFileSync(join(pkgRoot, "tokens", "dtcg", "typography.json"), "utf-8")));

/** `--name: value;` pairs of one block of genesis.css, fonts left out. */
function block(css: string, selector: string): Record<string, string> {
  const body = css.split(`${selector} {`)[1]!.split("}")[0]!;
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].filter(([, name]) => !name!.startsWith("--font-")).map(([, name, value]) => [name, value]),
  );
}

function base() {
  const added: Record<string, unknown>[] = [];
  for (const plugin of genesisNativewindPreset.plugins) plugin({ addBase: (b) => added.push(b) });
  return added[0] as { ":root": Record<string, string>; "@media (prefers-color-scheme: dark)": { ":root": Record<string, string> } };
}

describe("genesisNativewindPreset", () => {
  const colors = genesisNativewindPreset.theme.extend.colors as Record<string, unknown>;

  it("has the role colors the ui-native components use, from the theme variables", () => {
    for (const key of ["primary", "primary-foreground", "background", "foreground", "input", "border", "destructive", "muted-foreground", "card", "ring"]) {
      expect(colors[key], key).toBe(`hsl(var(--${key}))`);
    }
    expect(colors.sidebar).toBe("hsl(var(--sidebar-background))");
  });

  it("keeps a status color's scale and takes the variable as its default", () => {
    expect(colors.success).toMatchObject({ DEFAULT: "hsl(var(--success))", light: expect.any(String), dark: expect.any(String) });
    expect(colors.neutral).toBeTypeOf("object");
  });

  it("declares genesis.css's values, light on :root and dark under prefers-color-scheme", () => {
    const css = renderThemeCss(GENESIS_THEME_BRAND, fonts);
    const added = base();
    expect(added[":root"]).toEqual(block(css, ":root"));
    expect(added["@media (prefers-color-scheme: dark)"][":root"]).toEqual(block(css, ".dark"));
    expect(added[":root"]["--radius"]).toBe("0.625rem");
  });
});
