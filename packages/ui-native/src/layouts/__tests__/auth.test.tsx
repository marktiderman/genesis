import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AuthBranding,
  AuthForm,
  ForgotPasswordLink,
  SocialAuthRow,
} from "../auth";

describe("AuthBranding", () => {
  it("renders logo, headline, and subhead slots", () => {
    render(
      <AuthBranding
        testID="brand"
        logo={<span data-testid="brand-logo-content">L</span>}
        headline="Welcome to Genesis"
        subhead="Sign in to continue"
      />,
    );
    expect(screen.getByTestId("brand-logo")).toBeTruthy();
    expect(screen.getByTestId("brand-headline").textContent).toBe(
      "Welcome to Genesis",
    );
    expect(screen.getByTestId("brand-subhead").textContent).toBe(
      "Sign in to continue",
    );
  });

  it("omits slots when not provided", () => {
    render(<AuthBranding testID="brand" headline="Just a title" />);
    expect(screen.queryByTestId("brand-logo")).toBeNull();
    expect(screen.queryByTestId("brand-subhead")).toBeNull();
    expect(screen.getByTestId("brand-headline")).toBeTruthy();
  });
});

describe("SocialAuthRow", () => {
  it("renders one button per provider and dispatches onPress", () => {
    const apple = vi.fn();
    const google = vi.fn();
    render(
      <SocialAuthRow
        testID="social"
        providers={[
          { id: "apple", label: "Continue with Apple", onPress: apple },
          { id: "google", label: "Continue with Google", onPress: google },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("social-apple"));
    expect(apple).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("social-google"));
    expect(google).toHaveBeenCalled();
    expect(screen.getByTestId("social-separator")).toBeTruthy();
  });

  it("hides separator when separator=null", () => {
    render(
      <SocialAuthRow
        testID="social"
        separator={null}
        providers={[
          { id: "apple", label: "Continue", onPress: () => {} },
        ]}
      />,
    );
    expect(screen.queryByTestId("social-separator")).toBeNull();
  });

  it("renders nothing when providers list is empty", () => {
    render(<SocialAuthRow testID="social" providers={[]} />);
    expect(screen.queryByTestId("social")).toBeNull();
  });
});

describe("AuthForm", () => {
  it("submits values when form is valid", () => {
    const onSubmit = vi.fn();
    render(<AuthForm testID="auth" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId("auth-email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByTestId("auth-password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByTestId("auth-submit"));
    expect(onSubmit).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret",
    });
  });

  it("blocks submission when email missing and shows error", () => {
    const onSubmit = vi.fn();
    render(<AuthForm testID="auth" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId("auth-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-error").textContent).toMatch(/email/i);
  });

  it("hides password field in magic-link mode", () => {
    render(
      <AuthForm
        testID="auth"
        mode="magic-link"
        onSubmit={() => {}}
      />,
    );
    expect(screen.queryByTestId("auth-password")).toBeNull();
    expect(screen.getByTestId("auth-submit").textContent).toMatch(
      /magic link/i,
    );
  });

  it("shows server-supplied errorMessage above submit", () => {
    render(
      <AuthForm
        testID="auth"
        onSubmit={() => {}}
        errorMessage="Invalid credentials"
      />,
    );
    expect(screen.getByTestId("auth-error").textContent).toBe(
      "Invalid credentials",
    );
  });

  it("uses custom validate hook when provided", () => {
    const validate = vi.fn(() => "Bad input");
    render(<AuthForm testID="auth" onSubmit={() => {}} validate={validate} />);
    fireEvent.change(screen.getByTestId("auth-email"), {
      target: { value: "x@y.z" },
    });
    fireEvent.change(screen.getByTestId("auth-password"), {
      target: { value: "p" },
    });
    fireEvent.click(screen.getByTestId("auth-submit"));
    expect(validate).toHaveBeenCalled();
    expect(screen.getByTestId("auth-error").textContent).toBe("Bad input");
  });
});

describe("ForgotPasswordLink", () => {
  it("calls onPress when tapped", () => {
    const onPress = vi.fn();
    render(<ForgotPasswordLink onPress={onPress} testID="forgot" />);
    fireEvent.click(screen.getByTestId("forgot"));
    expect(onPress).toHaveBeenCalled();
  });
});
