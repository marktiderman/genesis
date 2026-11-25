// @vitest-environment happy-dom
// @feat:chat
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatComposer, micOffset } from "../composer";
import { ChatNativeProvider } from "../context";
import type { ChatNativeModules } from "../modules";
import { useChatComposer } from "../use-composer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness() {
  const composer = useChatComposer("c1", null, "u1");
  return <ChatComposer composer={composer} canPost disabledReason={null} role="member" onSend={vi.fn()} testID="cmp" />;
}

describe("the composer's + button", () => {
  it("opens the + list (Camera, then Photos), and the picker opens as soon as the list has gone, with no fixed wait", async () => {
    vi.useFakeTimers();
    const launchImageLibraryAsync = vi.fn(async () => ({ canceled: true, assets: null }));
    const launchCameraAsync = vi.fn(async () => ({ canceled: true, assets: null }));
    render(
      <ChatNativeProvider modules={{ imagePicker: { launchImageLibraryAsync, launchCameraAsync } } as unknown as ChatNativeModules}>
        <Harness />
      </ChatNativeProvider>,
    );
    await act(async () => fireEvent.click(screen.getByTestId("cmp-attach")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    const items = screen.getAllByRole("menuitem").map((e) => e.getAttribute("data-testid"));
    expect(items).toEqual(["cmp-plus-camera", "cmp-plus-photos"]);
    expect(screen.getByTestId("cmp-plus-dismiss")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("cmp-plus-photos")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it("takes the app's own items, and lets it remove or reorder the defaults", async () => {
    vi.useFakeTimers();
    const mine = vi.fn();
    const launchImageLibraryAsync = vi.fn(async () => ({ canceled: true, assets: null }));
    const launchCameraAsync = vi.fn(async () => ({ canceled: true, assets: null }));
    function Own() {
      const composer = useChatComposer("c1", null, "u1");
      return (
        <ChatComposer
          composer={composer}
          canPost
          disabledReason={null}
          role="member"
          onSend={vi.fn()}
          plusItems={(defaults) => [{ id: "sample", label: "Sample tool", icon: "star", color: "transparent", onPress: mine }, ...defaults.filter((d) => d.id !== "camera")]}
          testID="cmp"
        />
      );
    }
    render(
      <ChatNativeProvider modules={{ imagePicker: { launchImageLibraryAsync, launchCameraAsync } } as unknown as ChatNativeModules}>
        <Own />
      </ChatNativeProvider>,
    );
    await act(async () => fireEvent.click(screen.getByTestId("cmp-attach")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(screen.getAllByRole("menuitem").map((e) => e.getAttribute("data-testid"))).toEqual(["cmp-plus-sample", "cmp-plus-photos"]);
    await act(async () => fireEvent.click(screen.getByTestId("cmp-plus-sample")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(mine).toHaveBeenCalledTimes(1);
  });
});

describe("the mic while held", () => {
  it("follows the finger left toward cancel and up toward the lock, within bounds, never right or down", () => {
    expect(micOffset(-40, -20)).toEqual({ x: -40, y: -20 });
    expect(micOffset(30, 25)).toEqual({ x: 0, y: 0 });
    expect(micOffset(-500, -500)).toEqual({ x: -120, y: -72 });
  });
});
