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
