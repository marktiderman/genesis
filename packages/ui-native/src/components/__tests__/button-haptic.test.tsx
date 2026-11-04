import { fireEvent, render, screen } from "@testing-library/react";
import { Animated } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "../../native-modules";
import { NativeButton } from "../button";

const fake = () => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
});

describe("NativeButton haptic", () => {
  it("plays its haptic, then presses", () => {
    const haptics = fake();
    const onPress = vi.fn();
    render(
      <GenesisModulesProvider modules={{ haptics }}>
        <NativeButton testID="b" haptic="success" onPress={onPress}>Save</NativeButton>
      </GenesisModulesProvider>,
    );
    fireEvent.click(screen.getByTestId("b"));
    expect(haptics.notificationAsync).toHaveBeenCalledWith("success");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("ticks select on press-in, as usePressFeedback does", () => {
    const haptics = fake();
    render(
      <GenesisModulesProvider modules={{ haptics }}>
        <NativeButton testID="b" haptic="select" onPress={() => {}}>Week</NativeButton>
      </GenesisModulesProvider>,
    );
    fireEvent.pointerDown(screen.getByTestId("b"));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("b"));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("plays none without the prop", () => {
    const haptics = fake();
    render(
      <GenesisModulesProvider modules={{ haptics }}>
        <NativeButton testID="b" onPress={() => {}}>Save</NativeButton>
      </GenesisModulesProvider>,
    );
    fireEvent.click(screen.getByTestId("b"));
    expect(haptics.impactAsync).not.toHaveBeenCalled();
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("answers a touch through usePressFeedback, and not when disabled", () => {
    const timing = vi.spyOn(Animated, "timing");
    const { rerender } = render(<NativeButton testID="b" onPress={vi.fn()}>Save</NativeButton>);
    fireEvent.pointerDown(screen.getByTestId("b"));
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0.97 }));
    timing.mockClear();
    rerender(<NativeButton testID="b" onPress={vi.fn()} disabled>Save</NativeButton>);
    fireEvent.pointerDown(screen.getByTestId("b"));
    expect(timing).not.toHaveBeenCalled();
    timing.mockRestore();
  });
});
