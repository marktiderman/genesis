/**
 * A brand's theme role variables: what the role classes (`bg-primary` is
 * `hsl(var(--primary))`) read, so a brand passed to the native app shell or
 * the NativeWind preset is the color on screen, not Genesis purple.
 */
import { describe, expect, it } from "vitest";
import { brandRoleVariables } from "../brand-roles";
import { themeFromBrand } from "../from-brand";
import { genesisBrand } from "../../presets/brand-genesis";
import { GENESIS_THEME_BRAND, themeVariables } from "../../tokens/theme-css";
import type { CanonicalBrand } from "../../schema/brand";

const teal: CanonicalBrand = {
  ...genesisBrand,
  name: "teal",
  surface: { DEFAULT: "#fbfaf7", light: "#fbfaf7", dark: "#101418" },
  text: { DEFAULT: "#1d232a", light: "#1d232a", dark: "#f2efe8" },
  accent: { DEFAULT: "#0f766e", light: "#0f766e", dark: "#5eead4" },
  status: { ...genesisBrand.status, error: { DEFAULT: "#b91c1c", dark: "#f87171" } },
};

describe("brandRoleVariables", () => {
  it("declares every role variable genesis.css does, in both modes", () => {
    const genesis = themeVariables(GENESIS_THEME_BRAND);
    const roles = brandRoleVariables(teal);
    expect(Object.keys(roles.light).sort()).toEqual(Object.keys(genesis.light).sort());
    expect(Object.keys(roles.dark).sort()).toEqual(Object.keys(genesis.dark).sort());
  });

  it("takes the primary, page and text from the brand, per mode", () => {
    const { light, dark } = brandRoleVariables(teal);
    expect(light["--primary"]).toBe("175.3 77.4% 26.1%");
    expect(light["--sidebar-primary"]).toBe(light["--primary"]);
    expect(dark["--primary"]).toBe("170.6 76.9% 64.3%");
    expect(light["--background"]).toBe("45 33.3% 97.6%");
    expect(light["--card"]).toBe(light["--background"]);
    expect(dark["--foreground"]).toBe("42 27.8% 92.9%");
    expect(light["--destructive"]).toBe("0 73.7% 41.8%");
    expect(dark["--destructive"]).toBe("0 90.6% 70.8%");
  });

  it("picks a readable foreground for the primary: white on a dark one, the darkest neutral on a light one", () => {
    const { light, dark } = brandRoleVariables(teal);
    expect(light["--primary-foreground"]).toBe("0 0% 100%");
    expect(dark["--primary-foreground"]).toBe("240 5.9% 10%"); // neutral 900, #18181b
  });

  it("matches genesis.css for the Genesis brand's light mode (to rounding), so the default look doesn't move", () => {
    const genesis = themeVariables(GENESIS_THEME_BRAND).light;
    const roles = brandRoleVariables(genesisBrand).light;
    const hsl = (value: string) => value.split(" ").map((part) => parseFloat(part));
    for (const name of ["--background", "--foreground", "--primary", "--primary-foreground", "--muted", "--muted-foreground", "--border", "--input", "--ring", "--destructive"]) {
      const [h, s, l] = hsl(roles[name]!);
      const [gh, gs, gl] = hsl(genesis[name]!);
      expect(Math.abs(h! - gh!), name).toBeLessThanOrEqual(0.6);
      expect(Math.abs(s! - gs!), name).toBeLessThanOrEqual(0.6);
      expect(Math.abs(l! - gl!), name).toBeLessThanOrEqual(0.6);
    }
  });

  it("leaves a color that isn't hex at the Genesis value", () => {
    const roles = brandRoleVariables({ ...teal, accent: { DEFAULT: "oklch(0.6 0.1 180)" } });
    expect(roles.light["--primary"]).toBe(themeVariables(GENESIS_THEME_BRAND).light["--primary"]);
  });

  it("applies the brand's native overrides first, so it agrees with themeFromBrand; web overrides with platform: web", () => {
    const overridden: CanonicalBrand = {
      ...teal,
      platformOverrides: { native: { accent: { DEFAULT: "#b45309", light: "#b45309" } }, web: { accent: { DEFAULT: "#1d4ed8", light: "#1d4ed8" } } },
    };
    const roles = brandRoleVariables(overridden);
    expect(roles.light["--primary"]).toBe("26 90.5% 37.1%"); // #b45309
    expect(themeFromBrand(overridden).variables.light["--primary"]).toBe(roles.light["--primary"]);
    expect(brandRoleVariables(overridden, { platform: "web" }).light["--primary"]).toBe("224.3 76.3% 48%"); // #1d4ed8
  });

  it("is part of themeFromBrand's variables, beside the --color-* scales", () => {
    const native = themeFromBrand(teal);
    expect(native.variables.light["--primary"]).toBe("175.3 77.4% 26.1%");
    expect(native.variables.dark["--primary"]).toBe("170.6 76.9% 64.3%");
    expect(native.variables.light["--color-accent"]).toBe("#0f766e");
  });
});
