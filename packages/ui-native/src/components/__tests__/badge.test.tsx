/**
 * NativeBadge status-contrast guard (WS-G / C18).
 *
 * The success/warning/info variants previously rendered same-hue text on a
 * tinted chip (`text-success` on `bg-success/15`), which measures ~1.9–3.1:1 —
 * below the WCAG AA 4.5:1 floor.
 *
 * An interim fix used the `-dark` status stop (`text-success-dark`). That
 * regressed twice: (1) `dark`/`light` stops are OPTIONAL in the brand schema
 * (only `status.*.DEFAULT` is required), so minimal brands render no color;
 * and (2) a dark shade over the dark-surface tint drops to ~1.7–2.6:1, so
 * dark-mode badges failed AA.
 *
 * The shipped fix uses the semantic Tailwind ramp (always present, brand-
 * independent, same hues as the Genesis status tokens) with an explicit
 * `dark:` stop. Measured contrast on the tint:
 *   - light /15 tint: emerald-700 4.76:1, amber-800 6.32:1, blue-700 5.64:1
 *   - dark-surface tint: emerald-300 ≥8.2:1, amber-200 ≥10.8:1, blue-300 ≥8.2:1
 * (AA in both modes, across the static preset AND the themeFromBrand()
 * runtime dark map). This test asserts against the exported cva directly (no
 * render-env dependency), so a regression fails loudly.
 */
import { describe, expect, it } from "vitest";
import { badgeTextVariants } from "../badge";

describe("NativeBadge status contrast (WCAG AA)", () => {
  it.each([
    ["success", "text-emerald-700", "dark:text-emerald-300"],
    ["warning", "text-amber-800", "dark:text-amber-200"],
    ["info", "text-blue-700", "dark:text-blue-300"],
  ] as const)(
    "%s status text pins an AA-safe light stop and a dark-mode stop",
    (variant, lightClass, darkClass) => {
      const classes = badgeTextVariants({ variant });
      expect(classes).toContain(lightClass);
      expect(classes).toContain(darkClass);
    }
  );

  it("does not regress to the AA-failing same-hue status tokens", () => {
    for (const variant of ["success", "warning", "info"] as const) {
      const classes = badgeTextVariants({ variant }).split(/\s+/);
      // The bare `text-success`/`text-warning`/`text-info` tokens are the
      // ~2:1 failures.
      expect(classes).not.toContain(`text-${variant}`);
    }
  });

  it("does not depend on the OPTIONAL `-dark`/`-light` status stops", () => {
    // `status.*.dark` and `status.*.light` are optional in the brand schema
    // (only `status.*.DEFAULT` is required); a badge that referenced them
    // would render no color for a minimal brand. Guard against reintroducing
    // that dependency.
    for (const variant of ["success", "warning", "info"] as const) {
      const classes = badgeTextVariants({ variant }).split(/\s+/);
      expect(classes).not.toContain(`text-${variant}-dark`);
      expect(classes).not.toContain(`text-${variant}-light`);
    }
  });
});
