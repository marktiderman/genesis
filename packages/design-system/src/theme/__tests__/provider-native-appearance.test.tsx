// @vitest-environment happy-dom
// @feat:design-tokens
import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const setColorScheme = vi.fn();
vi.mock("react-native", () => ({
  Appearance: { setColorScheme: (s: unknown) => setColorScheme(s) },
  useColorScheme: () => "light",
}));

const { GenesisThemeProvider } = await import("../provider.native");
const { genesisBrand } = await import("../../presets/brand-genesis");

function render(mode: "system" | "light" | "dark") {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(GenesisThemeProvider, { brand: genesisBrand, mode, children: null })));
  return root;
}

describe("native GenesisThemeProvider", () => {
  it("pushes a forced mode to the platform and releases it for system", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    render("dark");
    expect(setColorScheme).toHaveBeenLastCalledWith("dark");
    render("system");
    expect(setColorScheme).toHaveBeenLastCalledWith("unspecified");
  });
});
