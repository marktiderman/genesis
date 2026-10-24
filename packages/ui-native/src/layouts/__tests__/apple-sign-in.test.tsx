// @feat:account
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";
import { AuthScreen } from "../auth-screen";
import { appleProvider, AppleSignInButton, type AppleButtonModuleLike } from "../apple-sign-in";

function fakeApple() {
  const seen: Array<{ buttonType: number; buttonStyle: number }> = [];
  const apple: AppleButtonModuleLike = {
    AppleAuthenticationButton: ({ buttonType, buttonStyle, onPress, testID }) => {
      seen.push({ buttonType, buttonStyle });
      return (
        <button type="button" data-testid={testID} onClick={onPress}>
          apple-native-button
        </button>
      );
    },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  };
  return { apple, seen };
}

const form = { onSubmit: vi.fn() };
const google = { id: "google", label: "Continue with Google", onPress: () => {} };

afterEach(() => {
  Platform.OS = "ios";
});

describe("appleProvider", () => {
  it("adds Apple's own button to AuthScreen in one line, on iOS", () => {
    const { apple, seen } = fakeApple();
    const onPress = vi.fn();
    render(<AuthScreen form={form} providers={[appleProvider({ apple, onPress }), google]} />);
    fireEvent.click(screen.getByTestId("auth-screen-social-apple"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("apple-native-button")).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(seen[0]).toEqual({ buttonType: 1, buttonStyle: 2 });
  });

  it("is null off iOS or without the module, and AuthScreen skips it", () => {
    const { apple } = fakeApple();
    expect(appleProvider({ apple: undefined, onPress: () => {} })).toBeNull();
    Platform.OS = "android";
    const provider = appleProvider({ apple, onPress: () => {} });
    expect(provider).toBeNull();
    render(<AuthScreen form={form} providers={[provider, google]} />);
    expect(screen.queryByText("apple-native-button")).toBeNull();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
  });

  it("keeps the dev warning when Apple is missing on iOS, and stays quiet when it's there", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { apple } = fakeApple();
    const okta = { id: "okta", label: "Okta", onPress: () => {} };
    render(<AuthScreen form={form} providers={[appleProvider({ apple, onPress: () => {} }), okta]} />);
    expect(warn).not.toHaveBeenCalled();
    render(<AuthScreen form={form} providers={[appleProvider({ apple: undefined, onPress: () => {} }), okta]} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("appleProvider");
    warn.mockRestore();
  });
});

describe("AppleSignInButton", () => {
  it("maps Apple's wording and style, and ignores presses while disabled", () => {
    const { apple, seen } = fakeApple();
    const onPress = vi.fn();
    render(<AppleSignInButton apple={apple} onPress={onPress} type="sign-up" appearance="white-outline" disabled />);
    expect(seen[0]).toEqual({ buttonType: 2, buttonStyle: 1 });
    fireEvent.click(screen.getByTestId("apple-sign-in"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
