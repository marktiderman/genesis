import { describe, expect, it } from "vitest";
import { THEME_ROLES, resolveThemeRoles } from "../roles";
import { nativeThemeDark, nativeThemeLight } from "../native-themes";

describe("resolveThemeRoles", () => {
  it("gives every role a value on every target", () => {
    for (const target of ["web", "ios", "android"] as const) {
      const colors = resolveThemeRoles({ target });
      expect(Object.keys(colors).sort()).toEqual([...THEME_ROLES].sort());
    }
  });

  it("uses the theme's CSS variables on web", () => {
    const web = resolveThemeRoles({ target: "web" });
    expect(web.secondaryLabel).toBe("hsl(var(--muted-foreground))");
    expect(web.tint).toBe("hsl(var(--primary))");
  });

  it("uses iOS system colors when PlatformColor is given", () => {
    const ios = resolveThemeRoles({ target: "ios", platformColor: (name) => ({ semantic: [name] }) });
    expect(ios.background).toEqual({ semantic: ["systemBackground"] });
    expect(ios.separator).toEqual({ semantic: ["separator"] });
  });

  it("follows the color scheme on Android, so dark mode works", () => {
    expect(resolveThemeRoles({ target: "android", scheme: "light" }).background).toBe(nativeThemeLight.background);
    expect(resolveThemeRoles({ target: "android", scheme: "dark" }).background).toBe(nativeThemeDark.background);
    expect(resolveThemeRoles({ target: "android", scheme: "dark" }).label).toBe(nativeThemeDark.foreground);
  });

  it("lets a brand set the tint on native", () => {
    expect(resolveThemeRoles({ target: "android", tint: "#123456" }).tint).toBe("#123456");
    expect(resolveThemeRoles({ target: "ios" }).tint).toBe("#10b981");
  });
});
