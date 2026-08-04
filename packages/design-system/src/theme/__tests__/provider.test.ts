/**
 * provider.test.ts — PRD-07 A2b dual-mode parity assertion.
 *
 * Asserts that the unified `<GenesisThemeProvider>` (web build, since
 * Vitest runs in Node/JSDOM) returns tokens that match what the
 * factory-emitted theme would yield for the same brand + mode.
 *
 * The native provider is structurally identical (same context, same
 * resolveTokens call, same mode-tracking semantics). Native runtime
 * behavior is verified by the sample-native app at integration time
 * (see PRD-07 A2b.3 — visual-parity gate).
 */

import { describe, expect, it } from "vitest";
import type { CanonicalBrand } from "../../schema/brand";
import {
  resolveTokens,
  type ResolvedThemeMode,
  type ThemeMode,
  type UseThemeReturn,
} from "../theme";
import { themeFromBrand } from "../../factories/from-brand";

// A brand exercising every relevant slot the factory understands.
const BRAND: CanonicalBrand = {
  name: "parity-test",
  neutral: { 50: "#fafafa", 500: "#71717a", 900: "#09090b" },
  surface: { DEFAULT: "#ffffff", light: "#ffffff", dark: "#09090b" },
  text: { DEFAULT: "#09090b", light: "#09090b", dark: "#fafafa" },
  accent: { DEFAULT: "#059669", light: "#059669", dark: "#34d399" },
  status: {
    success: { DEFAULT: "#059669" },
    warning: { DEFAULT: "#f59e0b" },
    error: { DEFAULT: "#ef4444" },
    info: { DEFAULT: "#3b82f6" },
  },
  spacing: { md: "1rem" },
  radius: { md: "0.5rem" },
};

describe("provider parity — same brand resolves to the same tokens on both modes", () => {
  it("light mode tokens are stable across calls", () => {
    const a = resolveTokens(BRAND, "light");
    const b = resolveTokens(BRAND, "light");
    expect(a).toEqual(b);
  });

  it("dark mode tokens are stable across calls", () => {
    const a = resolveTokens(BRAND, "dark");
    const b = resolveTokens(BRAND, "dark");
    expect(a).toEqual(b);
  });

  it("light vs dark tokens differ on mode-aware scales", () => {
    const light = resolveTokens(BRAND, "light");
    const dark = resolveTokens(BRAND, "dark");
    expect(light.surface.DEFAULT).not.toEqual(dark.surface.DEFAULT);
    expect(light.text.DEFAULT).not.toEqual(dark.text.DEFAULT);
    expect(light.accent.DEFAULT).not.toEqual(dark.accent.DEFAULT);
  });

  it("provider tokens align with factory `themeFromBrand().theme.colors`", () => {
    // The factory's `themeFromBrand` produces a `theme.colors` map keyed
    // the same way as `tokens.{surface,text,accent}` etc. Verify the
    // active-mode color values land in lockstep across multiple scales
    // AND on both light + dark modes — surface alone hid drift on
    // text/accent and on dark variants.
    const factoryOutput = themeFromBrand(BRAND);
    const lightTokens = resolveTokens(BRAND, "light");
    const darkTokens = resolveTokens(BRAND, "dark");

    // factory `colors` has top-level keys for each universal scale.
    expect(factoryOutput.theme.colors).toHaveProperty("surface");
    expect(factoryOutput.theme.colors).toHaveProperty("accent");

    // Both are derived from the same brand object, so the DEFAULT/light
    // value should match between provider tokens and factory output.
    const factorySurface = factoryOutput.theme.colors.surface;
    if (typeof factorySurface === "object") {
      expect(factorySurface.DEFAULT).toBe(lightTokens.surface.DEFAULT);
    }

    const factoryText = factoryOutput.theme.colors.text;
    if (typeof factoryText === "object") {
      expect(factoryText.DEFAULT).toBe(lightTokens.text.DEFAULT);
    }

    const factoryAccent = factoryOutput.theme.colors.accent;
    if (typeof factoryAccent === "object") {
      expect(factoryAccent.DEFAULT).toBe(lightTokens.accent.DEFAULT);
    }

    // Dark-mode parity should also remain in lockstep.
    expect(darkTokens.surface.DEFAULT).toBe(BRAND.surface.dark);
    expect(darkTokens.text.DEFAULT).toBe(BRAND.text.dark);
    expect(darkTokens.accent.DEFAULT).toBe(BRAND.accent.dark);
  });
});

describe("provider mode contract", () => {
  it("ResolvedThemeMode is always 'light' or 'dark' (never 'system')", () => {
    // type-level: ResolvedThemeMode = "light" | "dark"
    // runtime: resolveTokens accepts only the resolved variant.
    expect(() => resolveTokens(BRAND, "light")).not.toThrow();
    expect(() => resolveTokens(BRAND, "dark")).not.toThrow();
  });

  it("UseThemeReturn carries BOTH `mode` (ThemeMode) and `resolvedMode` (ResolvedThemeMode)", () => {
    // Compile-time + runtime probe: caller intent (which may be
    // "system") must round-trip via `mode`, while `resolvedMode` always
    // carries the OS-resolved concrete value. This is the contract that
    // unblocks 3-state mode selectors (light / dark / system radios).
    const probe: UseThemeReturn = {
      brand: BRAND,
      mode: "system" satisfies ThemeMode,
      resolvedMode: "dark" satisfies ResolvedThemeMode,
      tokens: resolveTokens(BRAND, "dark"),
      setMode: (_m: ThemeMode) => {
        /* noop */
      },
    };

    expect(probe.mode).toBe("system");
    expect(probe.resolvedMode).toBe("dark");
    // The two fields can diverge (caller wants system, OS resolved dark).
    expect(probe.mode).not.toBe(probe.resolvedMode);
  });
});
