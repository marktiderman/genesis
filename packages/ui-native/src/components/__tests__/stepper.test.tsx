import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeStepper } from "../stepper";

describe("NativeStepper", () => {
  it("renders all step dots and exposes accessibilityValue", () => {
    render(
      <NativeStepper
        testID="stp"
        steps={[
          { label: "One" },
          { label: "Two" },
          { label: "Three" },
        ]}
        current={1}
      />
    );
    expect(screen.getByTestId("stp-dot-0")).toBeTruthy();
    expect(screen.getByTestId("stp-dot-1")).toBeTruthy();
    expect(screen.getByTestId("stp-dot-2")).toBeTruthy();
    const root = screen.getByTestId("stp");
    expect(root.getAttribute("aria-valuenow")).toBe("2");
    expect(root.getAttribute("aria-valuemax")).toBe("3");
  });
});
