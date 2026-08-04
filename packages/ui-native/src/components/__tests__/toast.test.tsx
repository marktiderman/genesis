import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
