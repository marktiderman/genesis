// @feat:native-layouts
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Text, View } from "react-native";
import { AuthScreen } from "../auth-screen";
import { SettingsSubPage } from "../settings-sub-page";
import { KEYBOARD_TOOLBAR_HEIGHT, KeyboardScrollProvider, useKeyboardToolbar, type KeyboardScrollProps, type KeyboardStickyProps } from "../keyboard";
import { FormPage } from "../pages";

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

describe("FormPage and the keyboard", () => {
  const Sticky = vi.fn(({ children, offset }: KeyboardStickyProps) => (
    <View testID="sticky" accessibilityLabel={`opened ${offset?.opened}`}>
      {children}
    </View>
  ));
  const page = (
    <FormPage title="New class" contentClassName="px-8" actions={<Text>Save</Text>}>
      <Text>fields</Text>
    </FormPage>
  );

  it("without a provider, keeps Save above the keyboard in a KeyboardAvoidingView (padding on iOS)", () => {
    render(page);
    const kav = screen.getByTestId("form-page-kav");
    expect(kav.querySelector("[data-testid=form-page-actions]")).not.toBeNull();
    expect(kav.querySelector("[data-testid=form-page-scroll]")).not.toBeNull();
  });

  it("puts the form in the app's keyboard-aware scroll view, and Save in its sticky view, over a toolbar", () => {
    const Spy = vi.fn(({ children, testID, bottomOffset }: KeyboardScrollProps) => (
      <View testID={testID} accessibilityLabel={`offset ${bottomOffset}`}>
        {children}
      </View>
    ));
    render(
      <KeyboardScrollProvider component={Spy} toolbar={() => <View testID="toolbar" />} sticky={Sticky}>
        {page}
      </KeyboardScrollProvider>,
    );
    expect(screen.queryByTestId("form-page-kav")).toBeNull();
    const scroll = screen.getByTestId("form-page-scroll");
    expect(scroll.textContent).toContain("fields");
    // The focused field stays clear of the toolbar and the bar.
    expect(scroll.getAttribute("aria-label")).toBe(`offset ${24 + KEYBOARD_TOOLBAR_HEIGHT + 64}`);
    expect(screen.getByTestId("sticky").querySelector("[data-testid=form-page-actions]")).not.toBeNull();
    expect(screen.getByTestId("sticky").getAttribute("aria-label")).toBe(`opened ${0 - KEYBOARD_TOOLBAR_HEIGHT}`);
    expect(screen.getByTestId("toolbar")).toBeTruthy();
  });

  it("with a keyboard-aware scroll view but no sticky view, ends the form with Save, where the keyboard can't cover it", () => {
    render(<KeyboardScrollProvider component={Aware}>{page}</KeyboardScrollProvider>);
    expect(screen.getByTestId("form-page-scroll").querySelector("[data-testid=form-page-actions]")).not.toBeNull();
  });

  it("pads once and has one body testID", () => {
    render(page);
    // contentClassName is the form's padding only: ScreenContainer's body doesn't get it too.
    expect(screen.getByTestId("form-page-body").className).not.toContain("px-8");
    expect(screen.getByTestId("form-page-scroll").outerHTML).toContain("px-8");
    expect(screen.getAllByTestId("form-page-body")).toHaveLength(1);
    expect(screen.getByTestId("form-page-fields").textContent).toBe("fields");
  });
});
