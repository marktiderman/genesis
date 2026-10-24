import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useThemeRoles } from "../use-theme-roles";

describe("useThemeRoles", () => {
  it("resolves neutral roles to iOS system colors and keeps the brand tint", () => {
    const { result } = renderHook(() => useThemeRoles({ tint: "#123456" }));
    expect(result.current.background).toEqual({ semantic: ["systemBackground"] });
    expect(result.current.secondaryLabel).toEqual({ semantic: ["secondaryLabel"] });
    expect(result.current.tint).toBe("#123456");
  });
});
