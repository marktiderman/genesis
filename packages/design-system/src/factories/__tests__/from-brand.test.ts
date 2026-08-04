/**
 * Cross-platform factory divergence tests — PRD-07 Phase A4.0 spike.
 *
 * For each divergence axis identified in the spike mandate, this file
 * holds a test asserting the platform-correct emission shape. PASS for
 * an axis = the single-config promise holds for that axis. SKIP =
 * fundamental divergence the factory can't bridge cleanly (data point
 * for the verdict — see research/a4-0-cross-platform-factory-spike.md).
 *
 * Brand fixture is modeled on real Gamify mobile tokens (navy/gold/
 * Oswald), pulled from /home/user/gamify-platform/apps/mobile/src/global.css
 * and src/theme/colors.ts as of 2026-05-03 (see spike doc §1).
 */

import { describe, expect, it } from "vitest";
import type { CanonicalBrand } from "../../schema/brand";
import {
  debugBrandPreset,
  tailwindFromBrand,
  themeFromBrand,
  wrapAsAtTheme,
} from "../from-brand";

// ---------------------------------------------------------------------------
// Real-shape Gamify-style fixture (color-only — matches today's schema).
// ---------------------------------------------------------------------------

const gamifyColorOnly: CanonicalBrand = {
  name: "gamify",
  neutral: {
    "50": "#FAFAFA",
    "100": "#F5F5F5",
    "200": "#E5E5E5",
    "300": "#D4D4D4",
    "400": "#A3A3A3",
    "500": "#737373",
    "600": "#525252",
  },
  surface: {
    DEFAULT: "#02166C", // navy
    light: "#0A2078",
    dark: "#020B33",
  },
  text: {
    DEFAULT: "#FAFAFA",
    light: "#A3A3A3",
    dark: "#02166C",
  },
  accent: {
    DEFAULT: "#FFC402", // gold
    light: "#F9C525",
    dark: "#D4A017",
  },
  status: {
    success: { DEFAULT: "#4CAF50" },
    warning: { DEFAULT: "#FF9800" },
    error: { DEFAULT: "#D32F2F" },
    info: { DEFAULT: "#2196F3" },
  },
  extensions: {
    rank: {
      DEFAULT: "#FFD700",
      gold: "#FFD700",
      silver: "#C0C0C0",
      bronze: "#CD7F32",
    },
    gameMode: {
      DEFAULT: "#4CAF50",
      solo: "#4CAF50",
      battle: "#FF5722",
      multiplayer: "#2196F3",
      championship: "#FFC107",
    },
  },
};

// Full divergence-axis fixture — color-only PLUS typography/spacing/
// radius/shadow/gradient/platformOverrides.
const gamifyFull: CanonicalBrand = {
  ...gamifyColorOnly,
  typography: {
    fontFamily: {
      // Gamify uses Oswald — web gets the stack with system fallbacks,
      // native uses just the head ("Oswald-Regular"; consumer registers
      // via expo-font in app/_layout.tsx).
      body: ["Oswald", "system-ui", "sans-serif"],
      display: ["Oswald-Bold", "system-ui", "sans-serif"],
    },
    fontSize: {
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      "2xl": "1.5rem",
    },
    lineHeight: {
      sm: "1.25rem",
      base: "1.5rem",
      lg: "1.75rem",
      "2xl": "2rem",
    },
    fontWeight: {
      normal: "400",
      medium: "500",
      bold: "700",
    },
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  radius: {
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
  },
  shadow: {
    card: { offsetX: 0, offsetY: 2, blur: 8, color: "rgba(0,0,0,0.4)" },
    cta: {
      offsetX: 0,
      offsetY: 4,
      blur: 16,
      color: "rgba(0,0,0,0.5)",
      elevation: 6,
    },
  },
  gradient: {
    navyBg: {
      direction: "to bottom",
      stops: [
        { color: "#020B33", position: 0 },
        { color: "#021150", position: 0.5 },
        { color: "#02166C", position: 1 },
      ],
    },
    goldButton: {
      direction: "to right",
      stops: [
        { color: "#F9C525", position: 0 },
        { color: "#FFC402", position: 0.5 },
        { color: "#D4A017", position: 1 },
      ],
    },
  },
  platformOverrides: {
    native: {
      // Native expo-font registers the explicit family name.
      typography: {
        fontFamily: {
          body: ["Oswald-Regular"],
          display: ["Oswald-Bold"],
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Sanity — color-only brand still works (today's contract).
// ---------------------------------------------------------------------------

describe("color-only brand (today's contract)", () => {
  it("tailwindFromBrand emits @theme entries for all color scales", () => {
    const out = tailwindFromBrand(gamifyColorOnly);
    expect(out.css).toContain("--color-surface: #02166C");
    expect(out.css).toContain("--color-accent: #FFC402");
    expect(out.css).toContain("--color-success: #4CAF50");
    expect(out.css).toContain("--color-rank-gold: #FFD700");
    // Schema mandates camelCase extension keys; factory kebab-cases for CSS
    // emission so utility classes read naturally (`bg-game-mode-solo`, not
    // `bg-gameMode-solo`). Matches Gamify's existing global.css convention.
    expect(out.css).toContain("--color-game-mode-solo");
    expect(out.css).toContain("--color-neutral-500: #737373");
  });

  it("preset.theme.extend.colors keeps the ColorScale shape", () => {
    const out = tailwindFromBrand(gamifyColorOnly);
    expect(out.preset.theme.extend.colors.accent).toEqual({
      DEFAULT: "#FFC402",
      light: "#F9C525",
      dark: "#D4A017",
    });
    expect(out.preset.theme.extend.colors.rank).toEqual({
      DEFAULT: "#FFD700",
      gold: "#FFD700",
      silver: "#C0C0C0",
      bronze: "#CD7F32",
    });
  });

  it("themeFromBrand emits the same CSS as tailwindFromBrand", () => {
    const tw = tailwindFromBrand(gamifyColorOnly);
    const native = themeFromBrand(gamifyColorOnly);
    expect(native.css).toBe(tw.css);
  });

  it("themeFromBrand variables.light contains DEFAULTs and emphasis variants", () => {
    const native = themeFromBrand(gamifyColorOnly);
    expect(native.variables.light["--color-accent"]).toBe("#F9C525"); // light variant
    expect(native.variables.dark["--color-accent"]).toBe("#D4A017"); // dark variant
    expect(native.variables.light["--color-accent-light"]).toBe("#F9C525");
  });

  it("debugBrandPreset bundles both views + override-presence flags", () => {
    const debug = debugBrandPreset(gamifyColorOnly);
    expect(debug.brand).toBe("gamify");
    expect(debug.tailwind.css).toContain("--color-accent");
    expect(debug.nativewind.css).toBe(debug.tailwind.css);
    expect(debug.hasPlatformOverrides).toEqual({ web: false, native: false });
  });
});

// ---------------------------------------------------------------------------
// Divergence axis 1: length units (rem ↔ px).
// ---------------------------------------------------------------------------

describe("axis: length units (rem ↔ px)", () => {
  it("tailwindFromBrand keeps rem strings as-is in CSS + preset", () => {
    const out = tailwindFromBrand(gamifyFull);
    expect(out.css).toContain("--spacing-md: 1rem");
    expect(out.css).toContain("--spacing-xl: 2rem");
    expect(out.preset.theme.extend.spacing).toEqual({
      xs: "0.25rem",
      sm: "0.5rem",
      md: "1rem",
      lg: "1.5rem",
      xl: "2rem",
    });
  });

  it("themeFromBrand converts rem → px numbers (default 16)", () => {
    const native = themeFromBrand(gamifyFull);
    expect(native.theme.spacing).toEqual({
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    });
  });

  it("themeFromBrand honors a custom remRoot", () => {
    const native = themeFromBrand(gamifyFull, { remRoot: 18 });
    expect(native.theme.spacing.md).toBe(18); // 1rem * 18
    expect(native.theme.spacing.lg).toBe(27); // 1.5rem * 18
  });

  it("radius emits both rem strings (web) and px numbers (native)", () => {
    const web = tailwindFromBrand(gamifyFull);
    const native = themeFromBrand(gamifyFull);
    expect(web.css).toContain("--radius-md: 0.5rem");
    expect(native.theme.radius.md).toBe(8);
    expect(native.theme.radius.lg).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Divergence axis 2: gradients (CSS string ↔ stops array).
// ---------------------------------------------------------------------------

describe("axis: gradients (CSS supports; RN doesn't)", () => {
  it("tailwindFromBrand emits a linear-gradient CSS variable", () => {
    const out = tailwindFromBrand(gamifyFull);
    expect(out.css).toContain(
      "--background-image-navyBg: linear-gradient(to bottom, #020B33 0%, #021150 50%, #02166C 100%)"
    );
    expect(out.preset.theme.extend.backgroundImage?.goldButton).toBe(
      "linear-gradient(to right, #F9C525 0%, #FFC402 50%, #D4A017 100%)"
    );
  });

  it("themeFromBrand emits stops + locations for expo-linear-gradient", () => {
    const native = themeFromBrand(gamifyFull);
    expect(native.theme.gradient.navyBg.colors).toEqual([
      "#020B33",
      "#021150",
      "#02166C",
    ]);
    expect(native.theme.gradient.navyBg.locations).toEqual([0, 0.5, 1]);
    // "to bottom" → vertical start/end vectors.
    expect(native.theme.gradient.navyBg.start).toEqual({ x: 0.5, y: 0 });
    expect(native.theme.gradient.navyBg.end).toEqual({ x: 0.5, y: 1 });
  });

  it("themeFromBrand handles 'to right' direction → horizontal vectors", () => {
    const native = themeFromBrand(gamifyFull);
    expect(native.theme.gradient.goldButton.start).toEqual({ x: 0, y: 0.5 });
    expect(native.theme.gradient.goldButton.end).toEqual({ x: 1, y: 0.5 });
  });
});

// ---------------------------------------------------------------------------
// Divergence axis 3: font weight (string ↔ numeric).
// ---------------------------------------------------------------------------

describe("axis: font weight (string-numeric)", () => {
  it("web emits the string", () => {
    const out = tailwindFromBrand(gamifyFull);
    expect(out.css).toContain("--font-weight-bold: 700");
    expect(out.preset.theme.extend.fontWeight?.bold).toBe("700");
  });

  it("native exposes the same string (RN accepts both)", () => {
    const native = themeFromBrand(gamifyFull);
    expect(native.theme.fontWeight.bold).toBe("700");
    expect(native.theme.fontWeight.normal).toBe("400");
  });
});

// ---------------------------------------------------------------------------
// Divergence axis 4: font family (CSS stack ↔ single name).
// ---------------------------------------------------------------------------

describe("axis: font family (stack ↔ single name)", () => {
  it("web joins the array into a CSS font stack with quoting", () => {
    const out = tailwindFromBrand(gamifyFull);
    // Universal value (no platformOverrides.web) — gets the system stack.
    expect(out.css).toContain(
      "--font-body: Oswald, system-ui, sans-serif"
    );
  });

  it("native uses ONLY the head — and platformOverrides.native swaps it", () => {
    const native = themeFromBrand(gamifyFull);
    // gamifyFull declares native.typography.fontFamily.body = ["Oswald-Regular"]
    expect(native.theme.fontFamily.body).toBe("Oswald-Regular");
    expect(native.theme.fontFamily.display).toBe("Oswald-Bold");
  });

  it("without platformOverrides.native, native uses the head of the universal stack", () => {
    const noOverride: CanonicalBrand = { ...gamifyFull, platformOverrides: {} };
    const native = themeFromBrand(noOverride);
    expect(native.theme.fontFamily.body).toBe("Oswald");
  });

  it("multi-word family names are quoted in the web stack", () => {
    const brand: CanonicalBrand = {
      ...gamifyColorOnly,
      typography: {
        fontFamily: {
          display: ["Space Grotesk", "system-ui", "sans-serif"],
        },
      },
    };
    const out = tailwindFromBrand(brand);
    expect(out.css).toContain(
      `--font-display: "Space Grotesk", system-ui, sans-serif`
    );
  });
});

// ---------------------------------------------------------------------------
// Divergence axis 5: shadow (box-shadow ↔ shadowColor/Offset/Radius/Elevation).
// ---------------------------------------------------------------------------

describe("axis: shadow (CSS string ↔ RN style + Android elevation)", () => {
  it("web composes a box-shadow CSS string", () => {
    const out = tailwindFromBrand(gamifyFull);
    expect(out.css).toContain("--shadow-card: 0px 2px 8px rgba(0,0,0,0.4)");
    expect(out.preset.theme.extend.boxShadow?.cta).toBe(
      "0px 4px 16px rgba(0,0,0,0.5)"
    );
  });

  it("native emits RN-shaped shadow with parsed alpha + elevation", () => {
    const native = themeFromBrand(gamifyFull);
    expect(native.theme.shadow.card).toEqual({
      shadowColor: "rgb(0, 0, 0)",
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      shadowOpacity: 0.4,
      // No explicit elevation on `card` — derived as Math.max(1, blur/2) = 4.
      elevation: 4,
    });
  });

  it("native honors explicit elevation when provided", () => {
    const native = themeFromBrand(gamifyFull);
    expect(native.theme.shadow.cta.elevation).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Divergence axis 6: color (trivially universal).
// ---------------------------------------------------------------------------

describe("axis: color (trivial)", () => {
  it("hex strings round-trip identically on both platforms", () => {
    const web = tailwindFromBrand(gamifyColorOnly);
    const native = themeFromBrand(gamifyColorOnly);
    expect(web.preset.theme.extend.colors.accent).toEqual({
      DEFAULT: "#FFC402",
      light: "#F9C525",
      dark: "#D4A017",
    });
    // theme.colors mirrors the preset structure.
    expect(native.theme.colors.accent).toEqual({
      DEFAULT: "#FFC402",
      light: "#F9C525",
      dark: "#D4A017",
    });
  });
});

// ---------------------------------------------------------------------------
// Divergence axis 7: OS-specific font (Oswald native vs Geist web etc.).
// ---------------------------------------------------------------------------

describe("axis: OS-specific font (expo-font registration on native)", () => {
  it("web declares the Google-Fonts stack; native loads the registered head", () => {
    // platformOverrides.native overrides body → "Oswald-Regular"
    // Universal body stack (web sees) → ["Oswald", "system-ui", "sans-serif"]
    const web = tailwindFromBrand(gamifyFull);
    const native = themeFromBrand(gamifyFull);

    // Web sees the universal value because no platformOverrides.web.
    expect(web.css).toContain("--font-body: Oswald, system-ui, sans-serif");

    // Native sees the override.
    expect(native.theme.fontFamily.body).toBe("Oswald-Regular");
  });

  it("does not blow up if a brand declares no typography", () => {
    expect(() => tailwindFromBrand(gamifyColorOnly)).not.toThrow();
    expect(() => themeFromBrand(gamifyColorOnly)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Schema interaction — additive optional fields don't break existing fixtures.
// ---------------------------------------------------------------------------

describe("schema additivity", () => {
  it("color-only brand passes validateBrand (today's contract)", async () => {
    // Lazy import so the test stays unaffected by tree-shaking.
    const { validateBrand } = await import("../../schema/brand");
    expect(validateBrand(gamifyColorOnly)).toEqual({ ok: true, errors: [] });
  });

  it("full divergence-axis brand also passes validateBrand", async () => {
    const { validateBrand } = await import("../../schema/brand");
    const result = validateBrand(gamifyFull);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("debugBrandPreset surfaces platformOverrides flags", () => {
    const debug = debugBrandPreset(gamifyFull);
    expect(debug.hasPlatformOverrides).toEqual({ web: false, native: true });
  });
});

// ---------------------------------------------------------------------------
// Wrap-as-@theme convenience.
// ---------------------------------------------------------------------------

describe("wrapAsAtTheme", () => {
  it("wraps the css body with @theme { ... } braces", () => {
    const wrapped = wrapAsAtTheme("  --color-x: red;");
    expect(wrapped).toBe("@theme {\n  --color-x: red;\n}");
  });
});
