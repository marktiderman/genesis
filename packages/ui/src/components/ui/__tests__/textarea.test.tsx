import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "../textarea";

describe("Textarea", () => {
  // With field-sizing-content, an unbroken run (a URL, a pasted token) would otherwise set the
  // textarea's minimum width and push a dialog wider than the screen.
  it("wraps a long unbroken run instead of widening its container", () => {
    render(<Textarea data-testid="t" />);
    expect(screen.getByTestId("t").className).toContain("[overflow-wrap:anywhere]");
  });
});
