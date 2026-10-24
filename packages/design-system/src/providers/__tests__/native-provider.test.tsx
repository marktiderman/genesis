// @vitest-environment happy-dom
// @feat:design-tokens
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { GENESIS_PRIMARY, GENESIS_PRIMARY_DARK, GenesisThemeProvider, useGenesisTheme } from "../native";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

function themeFor(mode: "light" | "dark") {
  let colors: { primary: string; primaryForeground: string } | undefined;
  const Probe = () => {
    colors = useGenesisTheme().colors;
    return null;
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  act(() => createRoot(document.createElement("div")).render(createElement(GenesisThemeProvider, { mode, children: createElement(Probe) })));
  return colors!;
}

describe("native GenesisThemeProvider defaults", () => {
  it("uses the lighter primary in dark mode, so its text keeps AA contrast", () => {
    const light = themeFor("light");
    const dark = themeFor("dark");
    expect(light.primary).toBe(GENESIS_PRIMARY);
    expect(dark.primary).toBe(GENESIS_PRIMARY_DARK);
    expect(contrast(light.primaryForeground, light.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark.primaryForeground, dark.primary)).toBeGreaterThanOrEqual(4.5);
  });
});
