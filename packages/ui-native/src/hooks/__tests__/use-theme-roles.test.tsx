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
