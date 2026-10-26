/** NativeFullScreenModal: the whole screen, faded in, black for media, closed by back and escape. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeText } from "../text";
import { FULL_SCREEN_DARK, NativeFullScreenModal } from "../full-screen-modal";

describe("NativeFullScreenModal", () => {
  it("covers the whole screen (not a page sheet), faded in, on black by default", () => {
    render(
      <NativeFullScreenModal open onOpenChange={() => undefined} testID="fs">
        <NativeText>Inside</NativeText>
      </NativeFullScreenModal>,
    );
    const modal = screen.getByTestId("fs");
    expect(modal.getAttribute("data-presentation-style")).toBe("overFullScreen");
    expect(modal.getAttribute("data-animation-type")).toBe("fade");
    expect(modal.getAttribute("data-transparent")).toBe("true");
    expect(modal.getAttribute("data-status-bar-translucent")).toBe("true");
    expect(JSON.parse((screen.getByTestId("fs-body") as HTMLElement).dataset.style!).backgroundColor).toBe("#000000");
    expect(FULL_SCREEN_DARK).toBe("#000000");
    expect(screen.getByText("Inside")).toBeTruthy();
  });

  it("draws no backdrop with tone none, for content that draws its own", () => {
    render(
      <NativeFullScreenModal open tone="none" onOpenChange={() => undefined} testID="fs">
        <NativeText>Inside</NativeText>
      </NativeFullScreenModal>,
    );
    expect(JSON.parse((screen.getByTestId("fs-body") as HTMLElement).dataset.style!).backgroundColor).toBe("transparent");
  });

  it("renders nothing while closed", () => {
    render(
      <NativeFullScreenModal open={false} onOpenChange={() => undefined} testID="fs">
        <NativeText>Inside</NativeText>
      </NativeFullScreenModal>,
    );
    expect(screen.queryByTestId("fs")).toBeNull();
  });

  it("asks to close on Android back (onRequestClose)", () => {
    const onOpenChange = vi.fn();
    render(
      <NativeFullScreenModal open onOpenChange={onOpenChange} testID="fs">
        <NativeText>Inside</NativeText>
      </NativeFullScreenModal>,
    );
    fireEvent.keyDown(screen.getByTestId("fs"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
