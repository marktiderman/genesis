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
