#!/usr/bin/env -S npx tsx
/**
 * figma-brand-modes: the Brand modes of the Genesis Figma library, generated from brand files.
 *
 *   npx tsx scripts/figma-brand-modes.mts <brand-module>... > brand-modes.json
 *
 * Each argument is a module (TS or JS) exporting a `CanonicalBrand` (the first export with
 * `name`, `neutral` and `accent`). The output is one entry per brand with the theme role
 * variables `brandRoleVariables` works out, as hex, per mode, plus the brand's radius and font
 * family: exactly the values the library's Brand collection holds for that brand's mode, so the
 * mode is derived from the brand file the same way the theme CSS is (docs/DESIGN-LIBRARY.md,
 * "Brands: one mode per consumer app").
 *
 * Output shape:
 *   [{ name, light: { background: "#fafafa", … }, dark: { … }, radius: 10, fontSans: "Inter",
 *      fontDisplay: "Inter", fontMono: "…" }]
 *
 * Role names drop the `--` prefix (`--primary` → `primary`). `--radius` is converted to px
 * (16px per rem). Fonts come from `typography.fontFamily` (head of each stack), defaulting to
 * the Genesis families. Nothing here names a consumer app: the brands are whatever files are
 * passed in.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { brandRoleVariables, type CanonicalBrand } from "../packages/design-system/dist/index.js";

const GENESIS_FONTS = { sans: "Inter", display: "Inter", mono: "JetBrains Mono" };

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
  light: Record<string, string>;
  dark: Record<string, string>;
  radius: number;
  fontSans: string;
  fontDisplay: string;
  fontMono: string;
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
  const families = (brand.typography as { fontFamily?: Record<string, unknown> } | undefined)?.fontFamily ?? {};
  return {
    name: brand.name,
    light: colors(roles.light),
    dark: colors(roles.dark),
    radius: lengthToPx(roles.light["--radius"]) ?? 10,
    fontSans: head(families.sans) ?? GENESIS_FONTS.sans,
    fontDisplay: head(families.display) ?? head(families.sans) ?? GENESIS_FONTS.display,
    fontMono: head(families.mono) ?? GENESIS_FONTS.mono,
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
