/**
 * NativeSheet: the native Modal unless the app opts into @gorhom/bottom-sheet
 * through NativeSheetProvider. Being installed is never enough: the library
 * throws on open without its BottomSheetModalProvider.
 */
/// <reference types="vite/client" />
import sheetSource from "../sheet.tsx?raw";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessibilityInfo, Platform } from "react-native";
import { NativeSheet, NativeSheetProvider, NativeSheetScrollView } from "../sheet";

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  vi.restoreAllMocks();
});

function fakeLibrary() {
  const present = vi.fn();
  const dismiss = vi.fn();
  const providerMounted = vi.fn();
  const modalProps = vi.fn();
  const library = {
    BottomSheetModalProvider: ({ children }: { children: ReactNode }) => {
      providerMounted();
      return <div data-testid="gorhom-provider">{children}</div>;
    },
    BottomSheetModal: forwardRef<unknown, { children: ReactNode; onDismiss: () => void }>(function Modal(props, ref) {
      useImperativeHandle(ref, () => ({ present, dismiss }), []);
      modalProps(props);
      return (
        <div data-testid="gorhom-modal" onClick={props.onDismiss}>
          {props.children}
        </div>
      );
    }),
    BottomSheetView: ({ children, testID }: { children: ReactNode; testID?: string }) => <div data-testid={testID}>{children}</div>,
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: ({ children }: { children: ReactNode }) => <div data-testid="gorhom-scroll">{children}</div>,
  };
  return { library, present, dismiss, providerMounted, modalProps };
}

const sheet = (props: Partial<Parameters<typeof NativeSheet>[0]> = {}) => (
  <NativeSheet open onOpenChange={() => {}} {...props}>
    <span>body</span>
  </NativeSheet>
);

describe("NativeSheet without a provider", () => {
  it("never loads @gorhom/bottom-sheet itself", () => {
    const source = sheetSource;
    // Statements only: the docs and the error message name the module for the app to import.
    expect(source).not.toMatch(/^\s*import\b[^\n]*["']@gorhom\/bottom-sheet["']|\b(require|import)\(\s*["']@gorhom\/bottom-sheet/m);
  });

  it("is the iOS page sheet that follows a swipe down", async () => {
    Platform.OS = "ios";
    render(sheet());
    const modal = await screen.findByRole("dialog");
    expect(modal.getAttribute("data-presentation-style")).toBe("pageSheet");
    expect(modal.getAttribute("data-allow-swipe-dismissal")).toBe("true");
    expect(modal.getAttribute("data-animation-type")).toBe("slide");
    expect(modal.getAttribute("data-transparent")).toBeNull();
    expect(screen.getByTestId("native-sheet").textContent).toBe("body");
  });

  it("closes when iOS asks (onRequestClose), and stays up with dismissal disabled", async () => {
    Platform.OS = "ios";
    const onOpenChange = vi.fn();
    const { rerender } = render(sheet({ onOpenChange }));
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    rerender(sheet({ onOpenChange, disableBackdropDismiss: true }));
    const modal = screen.getByRole("dialog");
    expect(modal.getAttribute("data-allow-swipe-dismissal")).toBeNull();
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("waits for Reduce Motion before presenting, and then doesn't slide", async () => {
    Platform.OS = "ios";
    let answer!: (value: boolean) => void;
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
    render(sheet());
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => answer(true));
    expect(screen.getByRole("dialog").getAttribute("data-animation-type")).toBe("none");
  });

  it("is a transparent bottom panel with a scrim on Android, under the system bars", async () => {
    Platform.OS = "android";
    const onOpenChange = vi.fn();
    render(sheet({ onOpenChange, testID: "s" }));
    const modal = await screen.findByRole("dialog");
    expect(modal.getAttribute("data-presentation-style")).toBeNull();
    expect(modal.getAttribute("data-transparent")).toBe("true");
    expect(modal.getAttribute("data-status-bar-translucent")).toBe("true");
    expect(modal.getAttribute("data-navigation-bar-translucent")).toBe("true");
    fireEvent.click(screen.getByTestId("s-backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    fireEvent.keyDown(modal, { key: "Escape" }); // the back button
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the Android sheet up when dismissal is disabled", async () => {
    Platform.OS = "android";
    const onOpenChange = vi.fn();
    render(sheet({ onOpenChange, testID: "s", disableBackdropDismiss: true }));
    const modal = await screen.findByRole("dialog");
    fireEvent.click(screen.getByTestId("s-backdrop"));
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("fits its content on iOS with fitContent: a bottom panel over a scrim, not the page sheet", async () => {
    Platform.OS = "ios";
    const onOpenChange = vi.fn();
    render(sheet({ onOpenChange, testID: "s", fitContent: true }));
    const modal = await screen.findByRole("dialog");
    expect(modal.getAttribute("data-presentation-style")).toBeNull();
    expect(modal.getAttribute("data-transparent")).toBe("true");
    expect(screen.getByTestId("s").textContent).toBe("body");
    fireEvent.click(screen.getByTestId("s-backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders nothing while closed", async () => {
    render(sheet({ open: false }));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("NativeSheet under NativeSheetProvider", () => {
  it("uses the library the app passed in, inside its BottomSheetModalProvider", () => {
    const { library, present, dismiss, providerMounted, modalProps } = fakeLibrary();
    const onOpenChange = vi.fn();
    const tree = (open: boolean) => (
      <NativeSheetProvider bottomSheet={library}>
        <NativeSheet open={open} onOpenChange={onOpenChange} snapPoints={["25%"]}>
          <NativeSheetScrollView>
            <span>body</span>
          </NativeSheetScrollView>
        </NativeSheet>
      </NativeSheetProvider>
    );
    const { rerender } = render(tree(true));
    expect(providerMounted).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("gorhom-provider").contains(screen.getByTestId("gorhom-modal"))).toBe(true);
    expect(screen.getByTestId("gorhom-scroll").textContent).toBe("body");
    expect(present).toHaveBeenCalledTimes(1);
    // The given snap points are the sheet's only ones (v5 would add a content-height one).
    expect(modalProps).toHaveBeenLastCalledWith(expect.objectContaining({ snapPoints: ["25%"], enableDynamicSizing: false }));
    expect((modalProps.mock.calls.at(-1)![0] as { maxDynamicContentSize?: number }).maxDynamicContentSize).toBeUndefined();

    // The user closing it reports; the app closing it doesn't report back.
    fireEvent.click(screen.getByTestId("gorhom-modal"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    rerender(tree(false));
    expect(dismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("gorhom-modal"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("lets the library size a sheet that fits its content", () => {
    const { library, modalProps } = fakeLibrary();
    render(
      <NativeSheetProvider bottomSheet={library}>
        <NativeSheet open onOpenChange={() => {}} fitContent>
          <span>body</span>
        </NativeSheet>
      </NativeSheetProvider>,
    );
    expect(modalProps).toHaveBeenLastCalledWith(expect.objectContaining({ snapPoints: undefined, index: 0, enableDynamicSizing: true }));
    // Capped below the full height, so long content never runs under the status bar.
    expect((modalProps.mock.calls.at(-1)![0] as { maxDynamicContentSize?: number }).maxDynamicContentSize).toBeGreaterThan(0);
  });

  it("doesn't report a dismiss that finishes after the app reopened the sheet", () => {
    const { library } = fakeLibrary();
    const onOpenChange = vi.fn();
    const tree = (open: boolean) => (
      <NativeSheetProvider bottomSheet={library}>
        <NativeSheet open={open} onOpenChange={onOpenChange}>
          <span>body</span>
        </NativeSheet>
      </NativeSheetProvider>
    );
    const { rerender } = render(tree(true));
    rerender(tree(false));
    // The dismiss animation finishes after the app has closed the sheet: not the user.
    fireEvent.click(screen.getByTestId("gorhom-modal"));
    expect(onOpenChange).not.toHaveBeenCalled();
    rerender(tree(true));
    fireEvent.click(screen.getByTestId("gorhom-modal"));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("reports an incomplete module and falls back to the native modal", async () => {
    Platform.OS = "ios";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { library } = fakeLibrary();
    const broken = { ...library, BottomSheetModalProvider: undefined } as unknown as typeof library;
    render(
      <NativeSheetProvider bottomSheet={broken}>
        {sheet()}
      </NativeSheetProvider>,
    );
    expect((await screen.findByRole("dialog")).getAttribute("data-presentation-style")).toBe("pageSheet");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("missing BottomSheetModalProvider"));
  });
});
