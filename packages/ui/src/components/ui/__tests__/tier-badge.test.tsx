// @feat:ui-primitives
/**
 * TierBadge and Button's gradient variant: both read opt-in brand variables
 * (`--brand-accent-<tone>`, `--brand-gradient-primary`) and fall back to the
 * Genesis roles when the brand doesn't set them.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../button";
import { TierBadge } from "../tier-badge";

describe("TierBadge", () => {
  it("tints from the brand accent named by tone, falling back to the secondary role", () => {
    render(<TierBadge testID="t" label="Gold" tone="gold" icon={<svg data-testid="i" />} />);
    const badge = screen.getByTestId("t");
    expect(badge.textContent).toBe("Gold");
    expect(badge.getAttribute("data-tone")).toBe("gold");
    expect(badge.style.borderColor).toContain("--brand-accent-gold");
    // Regression: a tone the brand does not define must still be the secondary chip underneath.
    expect(badge.className).toContain("bg-secondary");
    expect(screen.getByTestId("i").parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is the secondary chip without a tone", () => {
    render(<TierBadge testID="t2" label="Level 3" size="sm" />);
    const badge = screen.getByTestId("t2");
    expect(badge.className).toContain("bg-secondary");
    expect(badge.className).toContain("text-xs");
    expect(badge.getAttribute("style")).toBeNull();
  });
});

describe("Button variant=gradient", () => {
  it("paints the brand gradient over the primary", () => {
    render(<Button testID="b" variant="gradient">Start</Button>);
    const cls = screen.getByTestId("b").className;
    expect(cls).toContain("bg-primary");
    expect(cls).toContain("bg-[image:var(--brand-gradient-primary)]");
    expect(cls).toContain("text-primary-foreground");
  });
});
