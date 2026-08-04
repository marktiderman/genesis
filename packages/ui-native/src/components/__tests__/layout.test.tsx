/**
 * Layout primitives WIN test (promoted from Acme incubator, PRD-46 WC-A4).
 *
 * Proves the keystone: Stack / Inline / Box / Grid compose a spaced layout
 * and pull every gap/padding from the `spaceScale` DESIGN TOKEN — never a
 * hard-coded literal. The token-driven assertions below recompute the
 * expected NativeWind class FROM `spaceScale`, so a primitive that hard-codes
 * spacing (e.g. `gap-2` for `md`) diverges from the token and fails.
 *
 * Genesis vitest convention: react-native is aliased to test-utils/rn-mock,
 * which renders <View> as a <div> carrying `className` + `data-testid`. `cn`
 * (clsx + tailwind-merge) runs for real, so we assert the merged className
 * exactly as a consumer's NativeWind scanner would see it.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Box } from "../layout/box";
import { Grid } from "../layout/grid";
import { Inline } from "../layout/inline";
import { Stack } from "../layout/stack";
import { type SpaceToken, spaceScale, spacingClass } from "../layout/spacing";

const ALL_TOKENS = Object.keys(spaceScale) as SpaceToken[];

function classOf(testID: string): string {
  return screen.getByTestId(testID).getAttribute("class") ?? "";
}

describe("layout primitives — composition", () => {
  it("all four primitives render a host View", () => {
    render(
      <>
        <Stack testID="stack" />
        <Inline testID="inline" />
        <Box testID="box" />
        <Grid testID="grid" />
      </>,
    );
    expect(screen.getByTestId("stack")).toBeTruthy();
    expect(screen.getByTestId("inline")).toBeTruthy();
    expect(screen.getByTestId("box")).toBeTruthy();
    expect(screen.getByTestId("grid")).toBeTruthy();
  });

  it("Stack composes a vertical column", () => {
    render(<Stack testID="stack" />);
    expect(classOf("stack")).toContain("flex-col");
  });

  it("Inline composes a horizontal row and can wrap", () => {
    render(<Inline testID="inline" wrap gap="sm" />);
    const cls = classOf("inline");
    expect(cls).toContain("flex-row");
    expect(cls).toContain("flex-wrap");
  });

  it("Grid composes equal-width cells across rows (3 items, 2 columns → 4 flex-1 cells)", () => {
    render(
      <Grid testID="grid" columns={2}>
        <span>a</span>
        <span>b</span>
        <span>c</span>
      </Grid>,
    );
    // 3 children + 1 padding cell so the short final row stays aligned.
    const flexCells = screen
      .getByTestId("grid")
      .querySelectorAll(".flex-1");
    expect(flexCells).toHaveLength(4);
  });
});

describe("layout primitives — spacing comes from the design token, not a literal", () => {
  it("the spacing token is the source of truth (md === 12px on the 4px grid)", () => {
    expect(spaceScale.md).toBe(12);
    expect(spacingClass("gap", "md")).toBe("gap-3"); // 12 / 4
  });

  it("Stack gap resolves THROUGH the token for every step", () => {
    for (const token of ALL_TOKENS) {
      const { unmount } = render(<Stack testID="s" gap={token} />);
      // Expected class derived from spaceScale — a hard-coded literal in
      // Stack would not match and this assertion would fail.
      expect(classOf("s")).toContain(spacingClass("gap", token));
      unmount();
    }
  });

  it("Inline gap resolves through the token", () => {
    render(<Inline testID="i" gap="lg" />);
    expect(classOf("i")).toContain(spacingClass("gap", "lg"));
  });

  it("Box maps padding + margin tokens to token-derived classes", () => {
    render(<Box testID="b" p="lg" px="sm" my="xl" />);
    const cls = classOf("b");
    expect(cls).toContain(spacingClass("p", "lg"));
    expect(cls).toContain(spacingClass("px", "sm"));
    expect(cls).toContain(spacingClass("my", "xl"));
  });

  it("Box bg maps to a semantic surface token class, never a raw hex", () => {
    render(<Box testID="b" bg="canvas" />);
    const cls = classOf("b");
    expect(cls).toContain("bg-background");
    expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
