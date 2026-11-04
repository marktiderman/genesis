// @feat:inbox-thread
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("taps a light haptic when a message sends, and none when it can't", () => {
    const haptics = {
      impactAsync: vi.fn(() => Promise.resolve()),
      selectionAsync: vi.fn(() => Promise.resolve()),
      notificationAsync: vi.fn(() => Promise.resolve()),
      ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
      NotificationFeedbackType: { Success: "s", Warning: "w", Error: "e" },
    };
    const { rerender } = render(
      <GenesisModulesProvider modules={{ haptics }}>
        <NativeComposerBar {...base} value=" " testID="c" />
      </GenesisModulesProvider>,
    );
    fireEvent.click(screen.getByTestId("c-send"));
    expect(haptics.impactAsync).not.toHaveBeenCalled();
    rerender(
      <GenesisModulesProvider modules={{ haptics }}>
        <NativeComposerBar {...base} value="Hi" testID="c" />
      </GenesisModulesProvider>,
    );
    fireEvent.click(screen.getByTestId("c-send"));
    expect(haptics.impactAsync).toHaveBeenCalledWith("light");
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

  describe("hasContent", () => {
    it("sends with no text when it's true (attachments waiting)", () => {
      const onSend = vi.fn();
      render(<NativeComposerBar {...base} onSend={onSend} value="" hasContent testID="c" />);
      fireEvent.click(screen.getByTestId("c-send"));
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it("won't send written text when it's false", () => {
      const onSend = vi.fn();
      render(<NativeComposerBar {...base} onSend={onSend} value="Hi" hasContent={false} testID="c" />);
      expect(screen.getByTestId("c-send").getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(screen.getByTestId("c-send"));
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe("idleAction", () => {
    const mic = <i data-testid="mic" />;

    it("takes Send's place while there's nothing to send, and gives it back", () => {
      const { rerender } = render(<NativeComposerBar {...base} value="" idleAction={mic} testID="c" />);
      expect(screen.getByTestId("c-idle").contains(screen.getByTestId("mic"))).toBe(true);
      expect(screen.queryByTestId("c-send")).toBeNull();
      rerender(<NativeComposerBar {...base} value="Hi" idleAction={mic} testID="c" />);
      expect(screen.queryByTestId("mic")).toBeNull();
      expect(screen.getByTestId("c-send")).toBeTruthy();
    });

    it("follows hasContent, not the text", () => {
      const { rerender } = render(<NativeComposerBar {...base} value="" hasContent idleAction={mic} testID="c" />);
      expect(screen.queryByTestId("mic")).toBeNull();
      rerender(<NativeComposerBar {...base} value="Hi" hasContent={false} idleAction={mic} testID="c" />);
      expect(screen.getByTestId("mic")).toBeTruthy();
    });

    it("gives way to the spinner while sending", () => {
      render(<NativeComposerBar {...base} value="" sending idleAction={mic} testID="c" />);
      expect(screen.queryByTestId("mic")).toBeNull();
      expect(screen.getByTestId("c-sending")).toBeTruthy();
    });

    it("stays the same view when a recording replaces the input (a held touch keeps its responder)", () => {
      const { rerender } = render(<NativeComposerBar {...base} value="" hasContent={false} idleAction={mic} testID="c" />);
      const before = screen.getByTestId("mic");
      rerender(<NativeComposerBar {...base} value="" hasContent={false} idleAction={mic} replaceInput={<i data-testid="wave" />} testID="c" />);
      expect(screen.getByTestId("mic")).toBe(before);
    });
  });

  describe("replaceInput", () => {
    it("replaces leading and the input, and leaves trailing to the caller", () => {
      render(<NativeComposerBar {...base} leading={<i data-testid="attach" />} trailing={<i data-testid="emoji" />} replaceInput={<i data-testid="wave" />} testID="c" />);
      expect(screen.getByTestId("wave")).toBeTruthy();
      expect(screen.queryByTestId("attach")).toBeNull();
      expect(screen.queryByTestId("c-input")).toBeNull();
      expect(screen.getByTestId("emoji")).toBeTruthy();
    });
  });

  describe("sendActions", () => {
    const later = { id: "later", label: "Send later", onPress: vi.fn() };
    const silent = { id: "silent", label: "Send silently", onPress: vi.fn() };

    it("has no accessibility actions without any", () => {
      render(<NativeComposerBar {...base} value="Hi" testID="c" />);
      expect(screen.getByTestId("c-send").getAttribute("data-a11y-actions")).toBeNull();
    });

    it("runs a single action straight away on touch and hold", () => {
      const onPress = vi.fn();
      render(<NativeComposerBar {...base} value="Hi" sendActions={[{ ...later, onPress }]} testID="c" />);
      fireEvent.contextMenu(screen.getByTestId("c-send"));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("c-send-menu")).toBeNull();
    });

    it("opens a menu with a Cancel for several", async () => {
      const onPress = vi.fn();
      render(<NativeComposerBar {...base} value="Hi" sendActions={[later, { ...silent, onPress }]} sendActionsTitle="Send" testID="c" />);
      fireEvent.contextMenu(screen.getByTestId("c-send"));
      await act(async () => {});
      expect(screen.getByTestId("c-send-menu-title").textContent).toBe("Send");
      expect(screen.getByTestId("c-send-menu-action-later").textContent).toBe("Send later");
      expect(screen.getByTestId("c-send-menu-cancel")).toBeTruthy();
      fireEvent.click(screen.getByTestId("c-send-menu-action-silent"));
      await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
    });

    it("offers each as an accessibility action on Send, only while it can send", () => {
      const { rerender } = render(<NativeComposerBar {...base} value="Hi" sendActions={[later, silent]} testID="c" />);
      expect(screen.getByTestId("c-send").getAttribute("data-a11y-actions")).toBe("later,silent");
      rerender(<NativeComposerBar {...base} value="" sendActions={[later, silent]} testID="c" />);
      expect(screen.getByTestId("c-send").getAttribute("data-a11y-actions")).toBeNull();
    });
  });

  describe("editable", () => {
    it("when false, nothing sends and the input reads as disabled", () => {
      const onSend = vi.fn();
      render(<NativeComposerBar {...base} onSend={onSend} value="Hi" editable={false} testID="c" />);
      expect(screen.getByTestId("c-input").hasAttribute("disabled")).toBe(true);
      expect(screen.getByTestId("c-send").getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(screen.getByTestId("c-send"));
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  it("passes the selection through to onSelectionChange", () => {
    const onSelectionChange = vi.fn();
    render(<NativeComposerBar {...base} value="Hi" onSelectionChange={onSelectionChange} testID="c" />);
    fireEvent.select(screen.getByTestId("c-input"));
    expect(onSelectionChange).toHaveBeenCalled();
  });
});
