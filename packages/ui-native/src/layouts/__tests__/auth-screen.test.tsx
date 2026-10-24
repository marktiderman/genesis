// @feat:native-components
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { AuthScreen, type AuthScreenSlotMap } from "../auth-screen";

const form = { onSubmit: vi.fn() };

describe("AuthScreen", () => {
  it("assembles branding, providers, the form, forgot password and a footer", () => {
    const onForgot = vi.fn();
    render(
      <AuthScreen
        branding={{ headline: "Welcome back" }}
        providers={[{ id: "apple", label: "Continue with Apple", onPress: () => {} }]}
        form={form}
        onForgotPassword={onForgot}
        footer={<Text>Terms</Text>}
      />,
    );
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByText("Continue with Apple")).toBeTruthy();
    expect(screen.getByTestId("auth-screen-form")).toBeTruthy();
    expect(screen.getByText("Terms")).toBeTruthy();
    fireEvent.click(screen.getByTestId("auth-forgot-password"));
    expect(onForgot).toHaveBeenCalled();
  });

  it("leaves out what isn't given, and forgot password in magic-link mode", () => {
    render(<AuthScreen form={{ ...form, mode: "magic-link" }} onForgotPassword={() => {}} />);
    expect(screen.queryByTestId("auth-screen-social")).toBeNull();
    expect(screen.queryByTestId("auth-forgot-password")).toBeNull();
    expect(screen.getByTestId("auth-screen-form")).toBeTruthy();
  });

  it("replaces or drops a part through slots", () => {
    const Social = ({ providers }: AuthScreenSlotMap["social"]) => <Text>{`${providers.length} custom`}</Text>;
    render(
      <AuthScreen
        branding={{ headline: "Hi" }}
        providers={[{ id: "g", label: "Google", onPress: () => {} }]}
        form={form}
        slots={{ social: Social, branding: null }}
      />,
    );
    expect(screen.getByText("1 custom")).toBeTruthy();
    expect(screen.queryByText("Hi")).toBeNull();
  });
});

describe("AuthScreen review fixes", () => {
  it("moves focus to the password field when return is pressed on email", () => {
    render(<AuthScreen form={form} />);
    fireEvent.keyDown(screen.getByTestId("auth-screen-form-email"), { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByTestId("auth-screen-form-password"));
  });

  it("warns once on iOS when a third-party provider has no Sign in with Apple beside it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const github = [{ id: "github", label: "GitHub", onPress: () => {} }];
    render(<AuthScreen form={form} providers={github} />);
    render(<AuthScreen form={form} providers={github} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("4.8");
    warn.mockRestore();
  });

  it("stays above the keyboard", () => {
    render(<AuthScreen form={form} />);
    expect(screen.getByTestId("auth-screen-kav")).toBeTruthy();
  });
});
