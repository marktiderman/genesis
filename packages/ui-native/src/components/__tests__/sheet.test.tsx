/**
 * NativeSheet: the native Modal unless the app opts into @gorhom/bottom-sheet
 * through NativeSheetProvider. Being installed is never enough: the library
 * throws on open without its BottomSheetModalProvider.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";
import { NativeSheet, NativeSheetProvider } from "../sheet";

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  vi.restoreAllMocks();
});

function fakeLibrary() {
  const present = vi.fn();
  const dismiss = vi.fn();
  const providerMounted = vi.fn();
  const library = {
    BottomSheetModalProvider: ({ children }: { children: ReactNode }) => {
      providerMounted();
      return <div data-testid="gorhom-provider">{children}</div>;
    },
    BottomSheetModal: forwardRef<unknown, { children: ReactNode; onDismiss: () => void }>(function Modal(props, ref) {
      useImperativeHandle(ref, () => ({ present, dismiss }));
      return (
        <div data-testid="gorhom-modal" onClick={props.onDismiss}>
          {props.children}
        </div>
      );
    }),
    BottomSheetView: ({ children, testID }: { children: ReactNode; testID?: string }) => <div data-testid={testID}>{children}</div>,
    BottomSheetBackdrop: () => null,
  };
  return { library, present, dismiss, providerMounted };
}

describe("NativeSheet without a provider", () => {
  it("is an iOS page sheet, whatever is installed", () => {
    Platform.OS = "ios";
    render(
      <NativeSheet open onOpenChange={() => {}}>
        <span>body</span>
      </NativeSheet>,
    );
    const modal = screen.getByRole("dialog");
    expect(modal.getAttribute("data-presentation-style")).toBe("pageSheet");
    expect(modal.getAttribute("data-transparent")).toBeNull();
    expect(screen.getByTestId("native-sheet").textContent).toBe("body");
  });

  it("closes on the iOS swipe (onRequestClose) unless dismissal is disabled", () => {
    Platform.OS = "ios";
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <NativeSheet open onOpenChange={onOpenChange}>
        <span>body</span>
      </NativeSheet>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    rerender(
      <NativeSheet open onOpenChange={onOpenChange} disableBackdropDismiss>
        <span>body</span>
      </NativeSheet>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("is a transparent bottom panel with a scrim on Android", () => {
    Platform.OS = "android";
    const onOpenChange = vi.fn();
    render(
      <NativeSheet open onOpenChange={onOpenChange} testID="s">
        <span>body</span>
      </NativeSheet>,
    );
    const modal = screen.getByRole("dialog");
    expect(modal.getAttribute("data-presentation-style")).toBeNull();
    expect(modal.getAttribute("data-transparent")).toBe("true");
    fireEvent.click(screen.getByTestId("s-backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    fireEvent.keyDown(modal, { key: "Escape" }); // the back button
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders nothing while closed", () => {
    render(
      <NativeSheet open={false} onOpenChange={() => {}}>
        <span>body</span>
      </NativeSheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("NativeSheet under NativeSheetProvider", () => {
  it("uses the library the app passed in, inside its BottomSheetModalProvider", () => {
    const { library, present, dismiss, providerMounted } = fakeLibrary();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <NativeSheetProvider bottomSheet={library}>
        <NativeSheet open onOpenChange={onOpenChange}>
          <span>body</span>
        </NativeSheet>
      </NativeSheetProvider>,
    );
    expect(providerMounted).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("gorhom-provider").contains(screen.getByTestId("gorhom-modal"))).toBe(true);
    expect(present).toHaveBeenCalledTimes(1);

    // The user closing it reports; the app closing it doesn't report back.
    fireEvent.click(screen.getByTestId("gorhom-modal"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    rerender(
      <NativeSheetProvider bottomSheet={library}>
        <NativeSheet open={false} onOpenChange={onOpenChange}>
          <span>body</span>
        </NativeSheet>
      </NativeSheetProvider>,
    );
    expect(dismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("gorhom-modal"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("reports an incomplete module and falls back to the native modal", async () => {
    Platform.OS = "ios";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { library } = fakeLibrary();
    const broken = { ...library, BottomSheetModalProvider: undefined } as unknown as typeof library;
    await act(async () => {
      render(
        <NativeSheetProvider bottomSheet={broken}>
          <NativeSheet open onOpenChange={() => {}}>
            <span>body</span>
          </NativeSheet>
        </NativeSheetProvider>,
      );
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("missing BottomSheetModalProvider"));
    expect(screen.getByRole("dialog").getAttribute("data-presentation-style")).toBe("pageSheet");
  });
});
