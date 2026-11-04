#!/usr/bin/env -S npx tsx
/**
 * figma-brand-modes: the Brand modes of the Genesis Figma library, generated from brand files.
 *
 *   npx tsx scripts/figma-brand-modes.mts <brand-module>... > brand-modes.json
 *
 * Each argument is a module (TS or JS) exporting a `CanonicalBrand` (the first export with
 * `name`, `neutral` and `accent`). The output is one entry per brand: `brand` is the value of
 * each variable in the library's Brand collection for that brand's mode, worked out by
 * `brandRoleVariables` (so the mode is derived from the brand file the same way the theme CSS
 * is; docs/DESIGN-LIBRARY.md, "Brands: one mode per consumer app"), and `roles` is the full
 * light and dark role map for reference.
 *
 * Output shape:
 *   [{ name, radius: 10,
 *      brand: { "brand/primary": "#4f46e5", "brand/primary-foreground": "#ffffff",
 *               "brand/primary-dark": "#7b75eb", "brand/font-sans": "Inter",
 *               "brand/font-display": "Inter",
 *               "brand/signal": "#4f46e5", "brand/signal-foreground": "#ffffff",
 *               "brand/link": "#4f46e5", "brand/sent-bubble": "#4f46e5",
 *               "brand/sent-bubble-foreground": "#ffffff", "brand/unread": "#4f46e5",
 *               "brand/background-dark": "#09090b", "brand/foreground-dark": "#fafafa",
 *               "brand/primary-foreground-dark": "#ffffff", "brand/signal-dark": "#7b75eb",
 *               "brand/signal-foreground-dark": "#ffffff", "brand/font-display-weight": 700,
 *               "brand/font-display-numeric": "proportional", "brand/gradient-from": "#4f46e5",
 *               "brand/gradient-to": "#4f46e5", "brand/gradient-angle": 135 },
 *      roles: { light: { background: "#ffffff", … }, dark: { … } } }]
 *
 * `brand/primary-dark` is the primary in dark mode: the accent when it reads at 4.5:1 on the
 * dark background, else the Genesis dark primary (what `brandRoleVariables` does), or the brand's
 * own `dark.accent`. The other `-dark` variables are the dark theme's background, foreground,
 * text on the primary and signal: the Genesis dark values unless the brand sets `dark` (opt-in),
 * so the Color collection's dark modes alias them and a brand without `dark` looks as before.
 * `brand/signal` is `brand.signal`, else the primary; the link, bubble and unread roles have no
 * CanonicalBrand field and follow the primary. The display face is `typography.display.family`
 * (else `fontFamily.display`, else the sans face), with its weight (FLOAT, default 700) and
 * numerals ("tabular" / "proportional"). `brand/gradient-*` is `gradients.primary` (what the
 * Button's gradient variant paints), defaulting to the primary at 135 degrees. Every
 * other Color role stays on the Genesis neutrals, which is why they are under `roles`, not
 * `brand`. Role names drop the `--` prefix; `--radius` is converted to px (16px per rem).
 * Fonts are the head of each `typography.fontFamily` stack after the brand's native
 * `platformOverrides` are applied (what the native theme uses), defaulting to the Genesis
 * families. Nothing here names a consumer app: the brands are whatever files are passed in.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { brandRoleVariables, type CanonicalBrand } from "../packages/design-system/dist/index.js";

const GENESIS_FONTS = { sans: "Inter", display: "Inter" };

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** White or black, whichever reads better on `hex` (`#rrggbb`). */
function readableOn(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const l = luminance(hex);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.05) ? "#ffffff" : "#000000";
}

function isBrand(value: unknown): value is CanonicalBrand {
  return !!value && typeof value === "object" && "name" in value && "neutral" in value && "accent" in value;
}

/** `"243 75% 59%"` (the theme CSS triple) to `#rrggbb`. */
export function hslTripleToHex(triple: string): string | undefined {
  const m = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(triple);
  if (!m) return undefined;
  const h = ((Number(m[1]) % 360) + 360) % 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function lengthToPx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^([\d.]+)(px|rem)?$/.exec(value.trim());
  if (!m) return undefined;
  return m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16;
}

function head(stack: unknown): string | undefined {
  if (Array.isArray(stack)) return typeof stack[0] === "string" ? stack[0] : undefined;
  if (typeof stack === "string") return stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return undefined;
}

export interface BrandMode {
  name: string;
  radius: number;
  /** One entry per variable of the library's Brand collection (numbers are FLOAT variables). */
  brand: Record<string, string | number>;
  /** The full theme role maps, as hex, for reference. */
  roles: { light: Record<string, string>; dark: Record<string, string> };
}

/** The brand's font stacks as the native theme sees them: native `platformOverrides` first. */
function fontFamilies(brand: CanonicalBrand): Record<string, unknown> {
  const overrides = (brand as { platformOverrides?: { native?: { typography?: { fontFamily?: Record<string, unknown> } } } }).platformOverrides?.native?.typography?.fontFamily;
  const base = (brand.typography as { fontFamily?: Record<string, unknown> } | undefined)?.fontFamily ?? {};
  return { ...base, ...(overrides ?? {}) };
}

export function brandMode(brand: CanonicalBrand): BrandMode {
  const roles = brandRoleVariables(brand);
  const colors = (mode: Record<string, string>) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(mode)) {
      if (key === "--radius") continue;
      const hex = hslTripleToHex(value);
      if (hex) out[key.replace(/^--/, "")] = hex;
    }
    return out;
  };
  const families = fontFamilies(brand);
  const light = colors(roles.light);
  const dark = colors(roles.dark);
  const primary = light.primary;
  const onPrimary = light["primary-foreground"];
  const fontSans = head(families.sans) ?? GENESIS_FONTS.sans;
  const display = brand.typography?.display;
  const signal = brand.signal ?? primary;
  // Same fallback as brandExtraVariables: dark.signal, then signal, then the dark primary.
  const signalDark = brand.dark?.signal ?? brand.signal ?? dark.primary;
  const gradient = brand.gradients?.primary;
  return {
    name: brand.name,
    radius: lengthToPx(roles.light["--radius"]) ?? 10,
    brand: {
      "brand/primary": primary,
      "brand/primary-foreground": onPrimary,
      "brand/primary-dark": dark.primary,
      "brand/font-sans": fontSans,
      "brand/font-display": head(display?.family) ?? head(families.display) ?? fontSans,
      "brand/signal": signal,
      "brand/signal-foreground": brand.signal ? readableOn(signal) : onPrimary,
      "brand/link": primary,
      "brand/sent-bubble": primary,
      "brand/sent-bubble-foreground": onPrimary,
      "brand/unread": primary,
      "brand/background-dark": dark.background,
      "brand/foreground-dark": dark.foreground,
      "brand/primary-foreground-dark": dark["primary-foreground"],
      "brand/signal-dark": signalDark,
      "brand/signal-foreground-dark": brand.dark?.signal || brand.signal ? readableOn(signalDark) : dark["primary-foreground"],
      "brand/font-display-weight": Number(display?.weight ?? 700),
      "brand/font-display-numeric": display?.numeric ?? "proportional",
      "brand/gradient-from": gradient?.from ?? primary,
      "brand/gradient-to": gradient?.to ?? primary,
      "brand/gradient-angle": gradient?.angle ?? 135,
    },
    roles: { light, dark },
  };
}

async function main(files: string[]): Promise<number> {
  if (files.length === 0) {
    console.error("usage: figma-brand-modes <brand-module>...");
    return 2;
  }
  const modes: BrandMode[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(path.resolve(file)).href)) as Record<string, unknown>;
    const brand = Object.values(mod).find(isBrand);
    if (!brand) {
      console.error(`${file}: no CanonicalBrand export`);
      return 1;
    }
    modes.push(brandMode(brand));
  }
  process.stdout.write(JSON.stringify(modes, null, 2) + "\n");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
