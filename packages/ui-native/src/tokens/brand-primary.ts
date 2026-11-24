/**
 * The brand's primary and the text on it, as the app's own `bg-primary` and
 * `text-primary-foreground` draw them on the phone: `brandRoleVariables(brand,
 * { platform: "native" })` for the resolved mode, so the native overrides, the
 * brand's `dark` colors and the contrast-checked foreground all apply. The
 * values are `hsl(h, s%, l%)` strings, which React Native's style colors parse.
 *
 * @stability Beta
 */
import { brandRoleVariables, type CanonicalBrand } from "@marktiderman/genesis-design-system";

export interface NativeBrandPrimary {
  /** `--primary`, as an `hsl()` color. */
  primary: string;
  /** `--primary-foreground`, as an `hsl()` color. */
  onPrimary: string;
}

/** `243.4 75.4% 58.6%` → `hsl(243.4, 75.4%, 58.6%)`; anything else → undefined. */
export function tripletToHsl(triplet: string | undefined): string | undefined {
  const m = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(triplet ?? "");
  return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : undefined;
}

/** The brand's native primary and its foreground in `mode`, or undefined when either isn't an HSL triplet. */
export function nativeBrandPrimary(brand: CanonicalBrand, mode: "light" | "dark"): NativeBrandPrimary | undefined {
  const vars = brandRoleVariables(brand, { platform: "native" })[mode];
  const primary = tripletToHsl(vars["--primary"]);
  const onPrimary = tripletToHsl(vars["--primary-foreground"]);
  return primary && onPrimary ? { primary, onPrimary } : undefined;
}
