// @feat:native-layouts
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import { AuthScreen } from "../auth-screen";
import { SettingsSubPage } from "../settings-sub-page";
import { KEYBOARD_TOOLBAR_HEIGHT, KeyboardScrollProvider, useKeyboardToolbar, type KeyboardScrollProps } from "../keyboard";

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

describe("KeyboardScrollProvider toolbar", () => {
  const Toolbar = () => <View testID="toolbar" />;
  const Spy = vi.fn(({ children, testID, bottomOffset }: KeyboardScrollProps) => (
    <View testID={testID} accessibilityLabel={`offset ${bottomOffset}`}>
      {children}
    </View>
  ));

  it("adds the previous / next / done bar to AuthScreen and SettingsSubPage, and keeps the focused field clear of it", () => {
    render(
      <KeyboardScrollProvider component={Spy} toolbar={Toolbar}>
        <AuthScreen form={{ onSubmit: vi.fn() }} />
        <SettingsSubPage testID="sub">{null}</SettingsSubPage>
      </KeyboardScrollProvider>,
    );
    // One bar each, beside (not inside) the scroll view.
    expect(screen.getAllByTestId("toolbar")).toHaveLength(2);
    expect(screen.getByTestId("auth-screen-keyboard").querySelector("[data-testid=toolbar]")).toBeNull();
    expect(screen.getByTestId("auth-screen").querySelector("[data-testid=toolbar]")).not.toBeNull();
    expect(screen.getByTestId("auth-screen-keyboard").getAttribute("aria-label")).toBe(`offset ${24 + KEYBOARD_TOOLBAR_HEIGHT}`);
  });

  it("draws no bar without one", () => {
    render(
      <KeyboardScrollProvider component={Spy}>
        <AuthScreen form={{ onSubmit: vi.fn() }} />
      </KeyboardScrollProvider>,
    );
    expect(screen.queryByTestId("toolbar")).toBeNull();
    expect(screen.getByTestId("auth-screen-keyboard").getAttribute("aria-label")).toBe("offset 24");
  });

  it("reports no toolbar outside a provider", () => {
    function Probe() {
      return <span data-testid="probe">{String(useKeyboardToolbar())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("null");
  });
});
