// @feat:native-layouts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeLoadingState } from "../loading-state";

describe("NativeLoadingState", () => {
  it("fills the screen inside every safe-area edge, announced as one loading progress bar", () => {
    render(<NativeLoadingState />);
    const root = screen.getByTestId("loading-state");
    expect(root.getAttribute("data-edges")).toBe("top,bottom,left,right");
    const content = screen.getByTestId("loading-state-content");
    expect(content.getAttribute("role")).toBe("progressbar");
    expect(content.getAttribute("aria-label")).toBe("Loading");
    expect(screen.getByTestId("loading-state-spinner")).toBeTruthy();
    expect(screen.queryByTestId("loading-state-label")).toBeNull();
  });

  it("shows a label under the spinner and announces it", () => {
    render(<NativeLoadingState label="Signing you in" testID="boot" />);
    expect(screen.getByTestId("boot-label").textContent).toBe("Signing you in");
    expect(screen.getByTestId("boot-content").getAttribute("aria-label")).toBe("Signing you in");
  });

  it("inline: no safe-area wrapper, the block is the root and takes the accessibility label", () => {
    render(<NativeLoadingState fullScreen={false} size="small" accessibilityLabel="Loading more" testID="more" />);
    const root = screen.getByTestId("more");
    expect(root.getAttribute("data-edges")).toBeNull();
    expect(root.getAttribute("role")).toBe("progressbar");
    expect(root.getAttribute("aria-label")).toBe("Loading more");
    expect(screen.queryByTestId("more-content")).toBeNull();
  });

  it("colors the spinner with the theme tint unless told otherwise", () => {
    const { unmount } = render(<NativeLoadingState testID="a" />);
    const tinted = screen.getByTestId("a-spinner").getAttribute("color");
    expect(tinted).toBeTruthy();
    unmount();
    render(<NativeLoadingState testID="b" color="#ff0000" />);
    expect(screen.getByTestId("b-spinner").getAttribute("color")).toBe("#ff0000");
  });
});
