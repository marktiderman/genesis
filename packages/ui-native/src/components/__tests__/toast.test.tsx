import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StyleSheet } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { NativeToastProvider, useToast } from "../toast";

function TestHarness() {
  const toast = useToast();
  return (
    <button
      type="button"
      data-testid="trigger"
      onClick={() =>
        toast.show({ title: "Saved", description: "All good." })
      }
    >
      show
    </button>
  );
}

describe("NativeToast", () => {
  it("puts a top toast below the safe area's top (the status bar, the Dynamic Island)", () => {
    render(
      <SafeAreaInsetsContext.Provider value={{ top: 62, bottom: 34, left: 0, right: 0 }}>
        <NativeToastProvider position="top" disableAnimation>
          <TestHarness />
        </NativeToastProvider>
      </SafeAreaInsetsContext.Provider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    const region = screen.getByLabelText("Saved. All good.");
    expect(StyleSheet.flatten(JSON.parse(region.dataset.style ?? "null"))).toMatchObject({ top: 70 });
  });

  it("queues + renders a toast on show()", () => {
    render(
      <NativeToastProvider disableAnimation>
        <TestHarness />
      </NativeToastProvider>
    );
    expect(screen.queryByTestId("native-toast")).toBeNull();
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("native-toast")).toBeTruthy();
    // Outer alert region carries the joined label so screen readers announce
    // both the title and description in one polite-live-region utterance.
    expect(screen.getByLabelText("Saved. All good.")).toBeTruthy();
  });

  it("dismisses on press", () => {
    render(
      <NativeToastProvider disableAnimation>
        <TestHarness />
      </NativeToastProvider>
    );
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("native-toast"));
    expect(screen.queryByTestId("native-toast")).toBeNull();
  });

  it("throws if useToast is called without provider", () => {
    function Bare() {
      useToast();
      return null;
    }
    // jsdom logs an error to console; suppress it for the test.
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect(() => render(<Bare />)).toThrow(/NativeToastProvider/);
    } finally {
      // Always restore — otherwise an assertion failure here would leak the
      // console.error spy into subsequent tests.
      errSpy.mockRestore();
    }
  });
});
