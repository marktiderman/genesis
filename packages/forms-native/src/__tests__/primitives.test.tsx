// @feat:forms-native
import { createRef, type ComponentRef } from "react";
import type { View } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button, DefaultProgress, FormThemeProvider } from "../index";

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
  });

  it("DefaultProgress draws a NativeProgress inside one labelled progress bar", () => {
    render(
      <FormThemeProvider>
        <DefaultProgress step={2} total={4} />
      </FormThemeProvider>,
    );
    const bar = screen.getByTestId("form-progress");
    expect(bar.textContent).toContain("Question 2 of 4");
    expect(bar.querySelectorAll("[role=progressbar]").length).toBeGreaterThanOrEqual(1);
  });
});
