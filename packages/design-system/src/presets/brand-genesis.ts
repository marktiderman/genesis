import type { ThemeConfig } from "../tokens/themes";
import type { CanonicalBrand } from "../schema/brand";

/** Genesis brand — emerald green. */
export const genesisTheme: ThemeConfig = {
  primary: { h: 160, s: 84, l: 39 },
  radius: "0.625rem",
};

export const genesisColors = {
  // emerald-500 — matches genesisTheme (160 84% 39%) and the DTCG brand primary.
  primary: "#10b981",
} as const;

/**
 * Genesis OOTB brand — the single source of truth for the full brand palette.
 *
 * Consumers (and Genesis's own `apps/sample` + `apps/sample-native`) import this
 * instead of inlining the hex ramp, so the palette lives in exactly one place —
 * the design system — and the token gate stays green on app code (WS-F / audit
 * R1.6: Genesis eats its own design-system lint).
 */
export const genesisBrand: CanonicalBrand = {
  name: "genesis",
  // Neutral ramp mirrors the canonical DTCG source (tokens/dtcg/colors.json,
  // which the generated src/tokens/native.ts also derives from) so there is
  // ONE palette. Prior drift: 300 was #d4d4d8 (Tailwind zinc-300) and 900 was
  // #09090b (zinc-950); both are corrected to the canonical #d4d8dd / #18181b.
  // (surface.dark below stays #09090b — that is a separate theme literal.)
  neutral: {
    50: "#fafafa",
    100: "#f4f4f5",
    200: "#e4e4e7",
    300: "#d4d8dd",
    400: "#a1a1aa",
    500: "#71717a",
    600: "#52525b",
    700: "#3f3f46",
    800: "#27272a",
    900: "#18181b",
  },
  surface: { DEFAULT: "#ffffff", light: "#ffffff", dark: "#09090b" },
  text: { DEFAULT: "#09090b", light: "#09090b", dark: "#fafafa" },
  // accent mirrors the DTCG brand primary (brands/genesis.json → #10b981, emerald-500).
  accent: { DEFAULT: "#10b981", light: "#10b981", dark: "#34d399" },
  status: {
    // success mirrors colors.json color.semantic.success.DEFAULT (#10b981).
    success: { DEFAULT: "#10b981" },
    warning: { DEFAULT: "#f59e0b" },
    error: { DEFAULT: "#ef4444" },
    info: { DEFAULT: "#3b82f6" },
  },
};
