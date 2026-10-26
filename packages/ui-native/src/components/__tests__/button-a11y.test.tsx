import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeButton } from "../button";

describe("NativeButton accessibility", () => {
  it("takes a label and a state, keeping its own disabled", () => {
    render(
      <NativeButton testID="b" accessibilityLabel="Remove your vote for Dark mode" accessibilityState={{ selected: true }} disabled>
        Voted
      </NativeButton>,
    );
    const button = screen.getByTestId("b");
    expect(button.getAttribute("aria-label")).toBe("Remove your vote for Dark mode");
    expect(button.getAttribute("aria-selected")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });
});
