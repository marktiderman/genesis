// @feat:native-components
/**
 * NativeTierBadge and NativeButton's gradient variant read the brand from the
 * nearest GenesisThemeProvider (`accents`, `gradients.primary`) and fall back
 * to the Genesis roles without one.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenesisThemeProvider, genesisBrand, type CanonicalBrand } from "@marktiderman/genesis-design-system";
import { NativeTierBadge } from "../tier-badge";
import { NativeButton, buttonVariants, buttonTextVariants } from "../button";

const acme: CanonicalBrand = {
  ...genesisBrand,
  name: "acme",
  accents: { gold: "#d4a017" },
  gradients: { primary: { from: "#0f766e", to: "#2563eb" } },
};

const styleOf = (el: HTMLElement) => JSON.parse(el.dataset.style ?? "null") as Record<string, unknown> | null;

describe("NativeTierBadge", () => {
  it("takes its tone from the brand's accents", () => {
    render(
      <GenesisThemeProvider brand={acme} mode="light">
        <NativeTierBadge testID="t" label="Gold" tone="gold" />
      </GenesisThemeProvider>,
    );
    const badge = screen.getByTestId("t");
    expect(badge.getAttribute("aria-label")).toBe("Gold");
    expect(styleOf(badge)).toEqual({ borderColor: "#d4a017", backgroundColor: "#d4a01726" });
  });

  it("is the secondary chip without a provider or a matching accent", () => {
    render(<NativeTierBadge testID="t2" label="Silver" tone="silver" />);
    expect(styleOf(screen.getByTestId("t2"))).toBeNull();
    expect(screen.getByText("Silver")).toBeTruthy();
  });
});

describe("NativeButton variant=gradient", () => {
  it("sits on the primary, so a brand without a gradient gets the default look", () => {
    expect(buttonVariants({ variant: "gradient" })).toContain("bg-primary");
    expect(buttonTextVariants({ variant: "gradient" })).toContain("text-primary-foreground");
  });

  it("paints the brand's gradient inside a provider, and nothing extra outside one", () => {
    render(
      <GenesisThemeProvider brand={acme} mode="light">
        <NativeButton testID="g" variant="gradient">Start</NativeButton>
      </GenesisThemeProvider>,
    );
    render(<NativeButton testID="plain" variant="gradient">Start</NativeButton>);
    expect(styleOf(screen.getByTestId("g"))).toEqual({ experimental_backgroundImage: "linear-gradient(135deg, #0f766e, #2563eb)" });
    expect(styleOf(screen.getByTestId("plain"))).toBeNull();
  });
});
