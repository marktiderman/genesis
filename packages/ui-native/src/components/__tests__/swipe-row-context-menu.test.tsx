// @feat:inbox-thread
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Platform } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "../../native-modules";
import { NativeContextMenu } from "../context-menu";
import { NativeSwipeRow } from "../swipe-row";

const haptics = () => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "s", Warning: "w", Error: "e" },
});

/** Draws both sides at once, as ReanimatedSwipeable has them behind the row. */
function fakeSwipeable(close: () => void) {
  return forwardRef<unknown, Record<string, any>>(function Swipeable(props, ref) {
    useImperativeHandle(ref, () => ({ close }));
    return (
      <div data-testid={props.testID} onClick={() => props.onSwipeableWillOpen?.()}>
        <div data-testid="left">{props.renderLeftActions?.()}</div>
        <div data-testid="right">{props.renderRightActions?.()}</div>
        {props.children as ReactNode}
      </div>
    );
  });
}

afterEach(() => vi.useRealTimers());

describe("NativeSwipeRow", () => {
  const actions = [
    { id: "pin", label: "Pin", onPress: vi.fn(), side: "leading" as const },
    { id: "delete", label: "Delete", onPress: vi.fn(), destructive: true },
  ];

  it("draws only the row without the module", () => {
    render(
      <NativeSwipeRow actions={actions} testID="s">
        <i data-testid="row" />
      </NativeSwipeRow>,
    );
    expect(screen.getByTestId("row")).toBeTruthy();
    expect(screen.queryByTestId("s")).toBeNull();
  });

  it("puts each action on its side, trailing by default", () => {
    const Swipeable = fakeSwipeable(vi.fn());
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={actions} testID="s">
          <i data-testid="row" />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("left").contains(screen.getByTestId("s-action-pin"))).toBe(true);
    expect(screen.getByTestId("right").contains(screen.getByTestId("s-action-delete"))).toBe(true);
  });

  it("closes, then runs the action", () => {
    const close = vi.fn();
    const onPress = vi.fn();
    const Swipeable = fakeSwipeable(close);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id: "a", label: "A", onPress }]} testID="s" />
      </GenesisModulesProvider>,
    );
    fireEvent.click(screen.getByTestId("s-action-a"));
    expect(close).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("taps medium when a swipe opens", () => {
    const h = haptics();
    const Swipeable = fakeSwipeable(vi.fn());
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never, haptics: h as never }}>
        <NativeSwipeRow actions={actions} testID="s" />
      </GenesisModulesProvider>,
    );
    fireEvent.click(screen.getByTestId("s"));
    expect(h.impactAsync).toHaveBeenCalledWith("medium");
  });
});

describe("NativeContextMenu", () => {
  const base = { open: true, onOpenChange: vi.fn(), testID: "m" };

  it("lists its actions with a title and Cancel, and Cancel only closes", async () => {
    const onPress = vi.fn();
    const onOpenChange = vi.fn();
    render(<NativeContextMenu {...base} onOpenChange={onOpenChange} title="Thread" actions={[{ id: "a", label: "Archive", onPress }]} />);
    await act(async () => {});
    expect(screen.getByTestId("m-title").textContent).toBe("Thread");
    expect(screen.getByTestId("m-action-a").textContent).toBe("Archive");
    fireEvent.click(screen.getByTestId("m-cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("runs an action only after closing, late enough on iOS for an alert to present", async () => {
    const os = Platform.OS;
    (Platform as { OS: string }).OS = "ios";
    const onPress = vi.fn();
    const onOpenChange = vi.fn();
    render(<NativeContextMenu {...base} onOpenChange={onOpenChange} actions={[{ id: "a", label: "Archive", onPress }]} />);
    await act(async () => {});
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("m-action-a"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(onPress).toHaveBeenCalledTimes(1);
    (Platform as { OS: string }).OS = os;
  });

  it("taps medium once as it opens", async () => {
    const h = haptics();
    const { rerender } = render(
      <GenesisModulesProvider modules={{ haptics: h as never }}>
        <NativeContextMenu {...base} open={false} actions={[]} />
      </GenesisModulesProvider>,
    );
    expect(h.impactAsync).not.toHaveBeenCalled();
    rerender(
      <GenesisModulesProvider modules={{ haptics: h as never }}>
        <NativeContextMenu {...base} open actions={[]} />
      </GenesisModulesProvider>,
    );
    rerender(
      <GenesisModulesProvider modules={{ haptics: h as never }}>
        <NativeContextMenu {...base} open actions={[]} />
      </GenesisModulesProvider>,
    );
    await act(async () => {});
    expect(h.impactAsync).toHaveBeenCalledTimes(1);
  });
});
