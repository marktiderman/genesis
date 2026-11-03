// @feat:inbox-thread
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "../../native-modules";
import { NativeComposerBar } from "../composer-bar";
import { fakeIcon } from "../../__tests__/fake-modules";

const base = { value: "", onChangeText: vi.fn(), onSend: vi.fn() };

describe("NativeComposerBar", () => {
  it("won't send a blank message, and sends a written one", () => {
    const onSend = vi.fn();
    const { rerender } = render(<NativeComposerBar {...base} onSend={onSend} value="  " testID="c" />);
    expect(screen.getByTestId("c-send").getAttribute("aria-disabled")).toBe("true");
    rerender(<NativeComposerBar {...base} onSend={onSend} value="Hi" testID="c" />);
    fireEvent.click(screen.getByTestId("c-send"));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("spins instead of sending twice", () => {
    render(<NativeComposerBar {...base} value="Hi" sending testID="c" />);
    expect(screen.getByTestId("c-sending").getAttribute("aria-label")).toBe("Sending");
    expect(screen.queryByTestId("c-send")).toBeNull();
  });

  it("draws the arrow with an icon module, and says Send without one", () => {
    const { unmount } = render(<NativeComposerBar {...base} value="Hi" testID="c" />);
    expect(screen.getByTestId("c-send").textContent).toBe("Send");
    unmount();
    render(
      <GenesisModulesProvider modules={{ icons: { "arrow-up": fakeIcon("arrow-up") } }}>
        <NativeComposerBar {...base} value="Hi" testID="c" />
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("c-send").querySelector('[data-lucide="arrow-up"]')).toBeTruthy();
    expect(screen.getByTestId("c-send").getAttribute("aria-label")).toBe("Send");
  });

  it("shows the mode picker only with two or more modes, and switches", () => {
    const onModeChange = vi.fn();
    const { rerender } = render(<NativeComposerBar {...base} modes={[{ id: "reply", label: "Reply" }]} testID="c" />);
    expect(screen.queryByTestId("c-modes")).toBeNull();
    rerender(
      <NativeComposerBar {...base} modes={[{ id: "reply", label: "Reply" }, { id: "note", label: "Internal note", tone: "internal" }]} onModeChange={onModeChange} testID="c" />,
    );
    expect(screen.getByTestId("c-mode-reply").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("c-mode-note"));
    expect(onModeChange).toHaveBeenCalledWith("note");
  });

  it("fills its slots", () => {
    render(<NativeComposerBar {...base} leading={<i data-testid="attach" />} trailing={<i data-testid="mic" />} above={<i data-testid="reply-to" />} testID="c" />);
    for (const id of ["attach", "mic", "reply-to"]) expect(screen.getByTestId(id)).toBeTruthy();
  });
});
