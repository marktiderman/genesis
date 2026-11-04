// @feat:forms-native
import { createRef, type ComponentRef } from "react";
import type { View } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button, DefaultEnding, DefaultHeader, DefaultProgress, FormThemeProvider } from "../index";

/** The shim keeps RN styles as JSON on `data-style`; arrays are flattened. */
function styleOf(el: Element): Record<string, unknown> {
  const raw: unknown = JSON.parse((el as HTMLElement).dataset["style"] ?? "{}");
  const parts = (Array.isArray(raw) ? raw.flat(Infinity) : [raw]) as Record<string, unknown>[];
  return Object.assign({}, ...parts.filter(Boolean));
}

/** The form's parts draw with genesis-ui-native's primitives and keep their own contract. */
describe("forms on ui-native primitives", () => {
  it("Button is a NativeButton: it presses, forwards its ref, and says when it's busy", () => {
    const onPress = vi.fn();
    const ref = createRef<ComponentRef<typeof View>>();
    const { rerender } = render(
      <FormThemeProvider>
        <Button ref={ref} testID="b" onPress={onPress}>
          Next
        </Button>
      </FormThemeProvider>,
    );
    const b = screen.getByTestId("b");
    expect(b.getAttribute("aria-label")).toBe("Next");
    expect(ref.current).not.toBeNull();
    act(() => {
      fireEvent.click(b);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(
      <FormThemeProvider>
        <Button testID="b" onPress={onPress} busy>
          Next
        </Button>
      </FormThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("b"));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("b").getAttribute("aria-busy")).toBe("true");
  });

  it("DefaultProgress draws a NativeProgress inside one labelled progress bar", () => {
    render(
      <FormThemeProvider>
        <DefaultProgress step={2} total={4} />
      </FormThemeProvider>,
    );
    const bar = screen.getByTestId("form-progress");
    expect(bar.textContent).toContain("Question 2 of 4");
    // The inner NativeProgress is hidden: a screen reader hears one progress bar, not two.
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByRole("progressbar")).toBe(bar);
  });

  it("DefaultProgress colors the bar from the form theme, so a host tint reaches it", () => {
    render(
      <FormThemeProvider theme={{ tint: "#ff0000", fill: "#00ff00" }}>
        <DefaultProgress step={3} total={4} />
      </FormThemeProvider>,
    );
    const track = screen.getByTestId("form-progress-bar");
    const indicator = track.firstElementChild as HTMLElement;
    expect(styleOf(track).backgroundColor).toBe("#00ff00");
    expect(styleOf(indicator)).toMatchObject({ backgroundColor: "#ff0000", width: "50%" });
  });

  it("text parts set their own line height, and the required mark inherits the note's size", () => {
    render(
      <FormThemeProvider>
        <DefaultHeader title="T" showTitle={false} requiredNote="Required" />
        <DefaultEnding title="Done" focusRef={() => {}} />
      </FormThemeProvider>,
    );
    expect(styleOf(screen.getByText("✓"))).toMatchObject({ fontSize: 30, lineHeight: 36 });
    // A plain Text, so it inherits the note's 13pt instead of NativeText's text-base.
    const star = screen.getByText("*", { exact: false });
    expect(star.className ?? "").not.toMatch(/text-base|leading-6/);
  });
});
