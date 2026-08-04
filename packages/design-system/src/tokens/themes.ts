/**
 * Theme generation utilities.
 * Produces CSS variable maps compatible with Shadcn/UI.
 */

export interface ThemeConfig {
  primary: { h: number; s: number; l: number };
  radius: string;
}

/** Generate a full set of Shadcn-compatible CSS variables for light mode. */
export function generateLightTheme(config: ThemeConfig): Record<string, string> {
  const { h, s, l } = config.primary;
  return {
    "--background": "0 0% 100%",
    "--foreground": "240 10% 3.9%",
    "--card": "0 0% 100%",
    "--card-foreground": "240 10% 3.9%",
    "--popover": "0 0% 100%",
    "--popover-foreground": "240 10% 3.9%",
    "--primary": `${h} ${s}% ${l}%`,
    "--primary-foreground": "0 0% 100%",
    "--secondary": "240 4.8% 95.9%",
    "--secondary-foreground": "240 5.9% 10%",
    "--muted": "240 4.8% 95.9%",
    "--muted-foreground": "240 3.8% 46.1%",
    "--accent": "240 4.8% 95.9%",
    "--accent-foreground": "240 5.9% 10%",
    "--destructive": "0 84.2% 60.2%",
    "--destructive-foreground": "0 0% 98%",
    "--border": "240 5.9% 90%",
    "--input": "240 5.9% 90%",
    "--ring": `${h} ${s}% ${l}%`,
    "--radius": config.radius,
    "--chart-1": "12 76% 61%",
    "--chart-2": "173 58% 39%",
    "--chart-3": "197 37% 24%",
    "--chart-4": "43 74% 66%",
    "--chart-5": "27 87% 67%",
  };
}

/** Generate a full set of Shadcn-compatible CSS variables for dark mode. */
export function generateDarkTheme(config: ThemeConfig): Record<string, string> {
  const { h, s, l } = config.primary;
  // Lighten the primary slightly for dark backgrounds
  const darkL = Math.min(l + 10, 80);
  return {
    "--background": "240 10% 3.9%",
    "--foreground": "0 0% 98%",
    "--card": "240 10% 3.9%",
    "--card-foreground": "0 0% 98%",
    "--popover": "240 10% 3.9%",
    "--popover-foreground": "0 0% 98%",
    "--primary": `${h} ${s}% ${darkL}%`,
    "--primary-foreground": "240 10% 3.9%",
    "--secondary": "240 3.7% 15.9%",
    "--secondary-foreground": "0 0% 98%",
    "--muted": "240 3.7% 15.9%",
    "--muted-foreground": "240 5% 64.9%",
    "--accent": "240 3.7% 15.9%",
    "--accent-foreground": "0 0% 98%",
    "--destructive": "0 62.8% 30.6%",
    "--destructive-foreground": "0 0% 98%",
    "--border": "240 3.7% 15.9%",
    "--input": "240 3.7% 15.9%",
    "--ring": `${h} ${s}% ${darkL}%`,
    "--radius": config.radius,
    "--chart-1": "220 70% 50%",
    "--chart-2": "160 60% 45%",
    "--chart-3": "30 80% 55%",
    "--chart-4": "280 65% 60%",
    "--chart-5": "340 75% 55%",
  };
}

/** Convert a theme variable map to a CSS string block. */
export function themeToCss(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
}
