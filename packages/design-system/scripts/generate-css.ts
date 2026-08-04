/**
 * Generates CSS theme files from brand presets.
 *
 * Run: npx tsx scripts/generate-css.ts
 *
 * Outputs one CSS file per brand into dist/themes/.
 * Each file contains :root (light) and .dark variable blocks
 * compatible with Shadcn/UI + Tailwind v4.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateLightTheme, generateDarkTheme, themeToCss } from "../src/tokens/themes";
import { fontFamily } from "../src/tokens/typography";
import { genesisTheme } from "../src/presets/brand-genesis";
import type { ThemeConfig } from "../src/tokens/themes";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "dist", "themes");

/** Semantic status colors (HSL component format, no wrapper). */
const semanticVars = `
  /* Semantic status colors */
  --success: 160 84.1% 39.4%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92.1% 50.2%;
  --warning-foreground: 0 0% 100%;
  --info: 217 91.2% 59.8%;
  --info-foreground: 0 0% 100%;`;

const darkSemanticVars = `
  /* Semantic status colors (dark) */
  --success: 160 84.1% 49%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92.1% 50.2%;
  --warning-foreground: 0 0% 100%;
  --info: 217 91.2% 59.8%;
  --info-foreground: 0 0% 100%;`;

function sidebarVarsLight(config: ThemeConfig): string {
  const { h, s, l } = config.primary;
  return `
  /* Sidebar */
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 240 5.3% 26.1%;
  --sidebar-primary: ${h} ${s}% ${l}%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 240 4.8% 95.9%;
  --sidebar-accent-foreground: 240 5.9% 10%;
  --sidebar-border: 220 13% 91%;
  --sidebar-ring: ${h} ${s}% ${l}%;`;
}

function sidebarVarsDark(config: ThemeConfig): string {
  const { h, s, l } = config.primary;
  const darkL = Math.min(l + 10, 80);
  return `
  /* Sidebar */
  --sidebar-background: 240 5.9% 10%;
  --sidebar-foreground: 240 4.8% 95.9%;
  --sidebar-primary: ${h} ${s}% ${darkL}%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 240 3.7% 15.9%;
  --sidebar-accent-foreground: 240 4.8% 95.9%;
  --sidebar-border: 240 3.7% 15.9%;
  --sidebar-ring: ${h} ${s}% ${darkL}%;`;
}

function generateBrandCss(name: string, config: ThemeConfig): string {
  const light = generateLightTheme(config);
  const dark = generateDarkTheme(config);

  return `/**
 * ${name} theme — generated from brand preset.
 * Do not edit by hand. Run: npx tsx scripts/generate-css.ts
 */

:root {
${themeToCss(light)}
${semanticVars}
${sidebarVarsLight(config)}

  /* Typography */
  --font-display: ${fontFamily.display};
}

.dark {
${themeToCss(dark)}
${darkSemanticVars}
${sidebarVarsDark(config)}

  /* Typography */
  --font-display: ${fontFamily.display};
}
`;
}

// v0.2.0: only the brand-genesis OOTB fallback ships from Genesis.
// Other brand presets live in their consumer's `@<consumer>/brand` package.
const brands: [string, ThemeConfig][] = [
  ["genesis", genesisTheme],
];

mkdirSync(outDir, { recursive: true });

for (const [name, config] of brands) {
  const css = generateBrandCss(name, config);
  const outPath = join(outDir, `${name}.css`);
  writeFileSync(outPath, css, "utf-8");
  console.log(`  wrote ${outPath}`);
}

console.log("\nDone — generated", brands.length, "theme files.");
