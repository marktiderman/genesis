import { describe, expect, it } from "vitest";
import { THEME_ROLES, resolveThemeRoles } from "../roles";
import { nativeThemeDark, nativeThemeLight } from "../native-themes";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

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

  it("keeps destructive text readable in dark mode (at least 4.5:1 on the background)", () => {
    const dark = resolveThemeRoles({ target: "android", scheme: "dark" });
    expect(contrast(dark.destructive as string, dark.background as string)).toBeGreaterThanOrEqual(4.5);
  });

  it("raises dark-mode cells above the grouped page, like iOS", () => {
    const dark = resolveThemeRoles({ target: "android", scheme: "dark" });
    expect(luminance(dark.surface as string)).toBeGreaterThan(luminance(dark.groupedBackground as string));
    const light = resolveThemeRoles({ target: "android", scheme: "light" });
    expect(luminance(light.surface as string)).toBeGreaterThan(luminance(light.groupedBackground as string));
  });

  it("uses Material You colors on Android 12+ when asked", () => {
    const dyn = resolveThemeRoles({ target: "android", scheme: "dark", androidDynamic: true, platformColor: (n) => ({ n }) });
    expect(dyn.background).toEqual({ n: "@android:color/system_neutral1_900" });
    expect(dyn.tint).toEqual({ n: "@android:color/system_accent1_200" });
    expect(typeof dyn.destructive).toBe("string");
    expect(resolveThemeRoles({ target: "android", androidDynamic: true }).background).toBe(nativeThemeLight.background);
  });

  it("lets a brand set the tint on native", () => {
    expect(resolveThemeRoles({ target: "android", tint: "#123456" }).tint).toBe("#123456");
    expect(resolveThemeRoles({ target: "ios" }).tint).toBe("#4f46e5");
    expect(resolveThemeRoles({ target: "android", scheme: "dark" }).tint).toBe("#7b75eb");
  });
});

describe("default tint contrast", () => {
  it("is readable on the background in both schemes", () => {
    const light = resolveThemeRoles({ target: "android", scheme: "light" });
    const dark = resolveThemeRoles({ target: "android", scheme: "dark" });
    expect(contrast(light.tint as string, light.background as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark.tint as string, dark.background as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#09090b", dark.tint as string)).toBeGreaterThanOrEqual(4.5);
  });
});
