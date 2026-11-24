import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import { useThemeRoles } from "../use-theme-roles";

describe("useThemeRoles", () => {
  it("resolves neutral roles to iOS system colors and keeps the brand tint", () => {
    const { result } = renderHook(() => useThemeRoles({ tint: "#123456" }));
    expect(result.current.background).toEqual({ semantic: ["systemBackground"] });
    expect(result.current.secondaryLabel).toEqual({ semantic: ["secondaryLabel"] });
    expect(result.current.tint).toBe("#123456");
  });

  it("uses Material You only on Android 12+ when asked", () => {
    const os = Platform.OS;
    const version = Platform.Version;
    try {
      Platform.OS = "android";
      Platform.Version = 34;
      const { result } = renderHook(() => useThemeRoles({ materialYou: true }));
      expect(result.current.background).toEqual({ semantic: ["@android:color/system_neutral1_10"] });
      Platform.Version = 30;
      const { result: old } = renderHook(() => useThemeRoles({ materialYou: true }));
      expect(typeof old.current.background).toBe("string");
    } finally {
      Platform.OS = os;
      Platform.Version = version;
    }
  });
});

describe("useThemeRoles primary and onPrimary", () => {
  it("is the brand's native primary and foreground under a GenesisThemeProvider, else the tint with text that reads on it", async () => {
    const { GenesisThemeProvider, brandRoleVariables, genesisBrand } = await import("@marktiderman/genesis-design-system");
    const { tripletToHsl } = await import("../use-theme-roles");
    const brand = { ...genesisBrand, name: "acme-light", accent: { DEFAULT: "#FDE68A" } };
    const roles = brandRoleVariables(brand, { platform: "native" }).light;
    const inside = renderHook(() => useThemeRoles(), { wrapper: ({ children }) => <GenesisThemeProvider brand={brand} mode="light">{children}</GenesisThemeProvider> });
    expect(inside.result.current.primary).toBe(tripletToHsl(roles["--primary"]));
    expect(inside.result.current.onPrimary).toBe(tripletToHsl(roles["--primary-foreground"]));
    // An explicit tint wins over the brand.
    const tinted = renderHook(() => useThemeRoles({ tint: "#FDE68A" }), { wrapper: ({ children }) => <GenesisThemeProvider brand={brand} mode="light">{children}</GenesisThemeProvider> });
    expect(tinted.result.current.primary).toBe("#FDE68A");
    expect(tinted.result.current.onPrimary).toBe("#000000");
    const outside = renderHook(() => useThemeRoles({ tint: "#123456" }));
    expect(outside.result.current.primary).toBe("#123456");
    expect(outside.result.current.onPrimary).toBe("#FFFFFF");
  });
});

describe("readableOn", () => {
  it("reads hex, rgb()/rgba() and hsl()/hsla() tints, so an rgb or hsl tint gets text that reads on it", async () => {
    const { readableOn } = await import("../../tokens/contrast");
    // The same dark navy and pale yellow, written every way React Native takes them.
    for (const dark of ["#123456", "#123", "#123456ff", "rgb(18, 52, 86)", "rgba(18, 52, 86, 0.5)", "rgb(18 52 86 / 50%)", "rgb(7%, 20%, 34%)", "hsl(210, 65.4%, 20.4%)", "hsla(210deg, 65%, 20%, 1)", "hsl(210 65% 20%)"]) {
      expect(readableOn(dark), dark).toBe("#FFFFFF");
    }
    for (const light of ["#FDE68A", "rgb(253, 230, 138)", "rgba(253,230,138,1)", "hsl(48, 96.5%, 76.7%)", "hsl(0, 0%, 100%)"]) {
      expect(readableOn(light), light).toBe("#000000");
    }
    // What tripletToHsl emits for a brand triplet reads too.
    const { tripletToHsl } = await import("../use-theme-roles");
    expect(readableOn(tripletToHsl("243.4 75.4% 58.6%"))).toBe("#FFFFFF");
    // Anything it can't read is left to the caller's fallback.
    for (const other of [{ semantic: ["systemRed"] }, "red", "rgb(1, 2)", "hsl(10, 20, 30)", undefined]) expect(readableOn(other)).toBeUndefined();
  });

  it("gives an rgb() or hsl() tint white text when it's dark, not the theme's foreground", () => {
    expect(renderHook(() => useThemeRoles({ tint: "rgb(18, 52, 86)" })).result.current.onPrimary).toBe("#FFFFFF");
    expect(renderHook(() => useThemeRoles({ tint: "hsl(48, 96%, 77%)" })).result.current.onPrimary).toBe("#000000");
  });
});
