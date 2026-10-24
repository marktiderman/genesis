// @vitest-environment happy-dom
// @feat:design-tokens
import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const setColorScheme = vi.fn();
vi.mock("react-native", () => ({
  Appearance: { setColorScheme: (s: unknown) => setColorScheme(s) },
  Platform: { constants: { reactNativeVersion: { minor: 88 } } },
  useColorScheme: () => "light",
}));

const { GenesisThemeProvider } = await import("../provider.native");
const { genesisBrand } = await import("../../presets/brand-genesis");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tree = (mode: "system" | "light" | "dark", sync = true) =>
  createElement(GenesisThemeProvider, { brand: genesisBrand, mode, syncNativeAppearance: sync, children: null });

describe("native GenesisThemeProvider syncNativeAppearance", () => {
  it("pushes a forced mode, releases it for system and on unmount", () => {
    setColorScheme.mockClear();
    const root = createRoot(document.createElement("div"));
    act(() => root.render(tree("dark")));
    expect(setColorScheme).toHaveBeenLastCalledWith("dark");
    act(() => root.render(tree("system")));
    expect(setColorScheme).toHaveBeenLastCalledWith("auto");
    act(() => root.render(tree("light")));
    expect(setColorScheme).toHaveBeenLastCalledWith("light");
    act(() => root.unmount());
    expect(setColorScheme).toHaveBeenLastCalledWith("auto");
  });

  it("leaves the platform alone unless asked", () => {
    setColorScheme.mockClear();
    const root = createRoot(document.createElement("div"));
    act(() => root.render(tree("dark", false)));
    act(() => root.unmount());
    expect(setColorScheme).not.toHaveBeenCalled();
  });
});
