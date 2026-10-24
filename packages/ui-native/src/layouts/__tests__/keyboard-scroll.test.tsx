// @feat:native-layouts
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import { AuthScreen } from "../auth-screen";
import { SettingsSubPage } from "../settings-sub-page";
import { KeyboardScrollProvider, type KeyboardScrollProps } from "../keyboard";

const Aware = ({ children, testID }: KeyboardScrollProps) => <View testID={testID}>{children}</View>;

describe("KeyboardScrollProvider", () => {
  it("puts AuthScreen in the app's keyboard-aware scroll view", () => {
    render(
      <KeyboardScrollProvider component={Aware}>
        <AuthScreen form={{ onSubmit: vi.fn() }} />
      </KeyboardScrollProvider>,
    );
    expect(screen.getByTestId("auth-screen-keyboard")).toBeTruthy();
    expect(screen.queryByTestId("auth-screen-kav")).toBeNull();
    expect(screen.getByTestId("auth-screen-form")).toBeTruthy();
  });

  it("puts SettingsSubPage in it too, and falls back without a provider", () => {
    const { unmount } = render(
      <KeyboardScrollProvider component={Aware}>
        <SettingsSubPage testID="sub">{null}</SettingsSubPage>
      </KeyboardScrollProvider>,
    );
    expect(screen.getByTestId("sub-keyboard")).toBeTruthy();
    unmount();
    render(<SettingsSubPage testID="sub">{null}</SettingsSubPage>);
    expect(screen.getByTestId("sub-kav")).toBeTruthy();
  });
});
