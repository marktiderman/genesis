import { fireEvent, render, screen } from "@testing-library/react";
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
});
