// @feat:account
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthScreen } from "../auth-screen";
import { googleProvider } from "../google-sign-in";

const form = { onSubmit: vi.fn() };

describe("googleProvider", () => {
  it("is a provider with Google's wording that AuthScreen draws and presses", () => {
    const onPress = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<AuthScreen form={form} providers={[googleProvider({ onPress, icon: <span>G</span> })]} />);
    const button = screen.getByTestId("auth-screen-social-google");
    expect(button.textContent).toContain("Continue with Google");
    expect(button.textContent).toContain("G");
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("is null when switched off, so the list takes it as is", () => {
    expect(googleProvider({ onPress: () => {}, enabled: false })).toBeNull();
    expect(googleProvider({ onPress: () => {}, label: "Sign in with Google" })?.label).toBe("Sign in with Google");
  });
});
