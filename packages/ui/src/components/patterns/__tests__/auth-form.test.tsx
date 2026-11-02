// @feat:account
/**
 * AuthForm against a mocked auth client.
 *
 * What is pinned: each mode's flow makes the client call it should and ends
 * where it should (onSuccess, a "check your email" status, the code step);
 * the code step verifies on the last digit, resends only after the
 * cooldown and starts over; providers come from the list given or from
 * `client.providers()`; errors are the catalogue's copy for the client's code,
 * announced (role="alert") and tied to the field; every field has a label and
 * the autocomplete a password manager needs.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UiMessagesProvider } from "../../../messages";
import { AuthForm, type AuthFormClient, type AuthFormProps } from "../auth-form";

function mockClient(overrides: Partial<AuthFormClient> = {}) {
  const ok = () => Promise.resolve({});
  return {
    signInWithPassword: vi.fn(ok),
    sendMagicLink: vi.fn(ok),
    sendEmailCode: vi.fn(ok),
    verifyEmailCode: vi.fn(ok),
    signUp: vi.fn(ok),
    sendPasswordReset: vi.fn(ok),
    updatePassword: vi.fn(ok),
    signInWithProvider: vi.fn(ok),
    ...overrides,
  } satisfies AuthFormClient;
}

const byId = (id: string) => screen.getByTestId(id);
const type = (id: string, value: string) => fireEvent.change(byId(id), { target: { value } });
const submit = async () => {
  await act(async () => {
    fireEvent.click(byId("auth-form-submit"));
  });
};

function setup(props: Partial<AuthFormProps> = {}) {
  const client = props.client ?? mockClient();
  const onSuccess = vi.fn();
  const view = render(<AuthForm providers={false} onSuccess={onSuccess} {...props} client={client} />);
  return { client: client as ReturnType<typeof mockClient>, onSuccess, ...view };
}

describe("AuthForm: sign-in", () => {
  it("signs in with email and password", async () => {
    const { client, onSuccess } = setup();
    type("auth-form-email", "  sam@acme.test ");
    type("auth-form-password", "hunter22");
    await submit();
    expect(client.signInWithPassword).toHaveBeenCalledWith({ email: "sam@acme.test", password: "hunter22" });
    expect(onSuccess).toHaveBeenCalledWith({ mode: "sign-in", method: "password", email: "sam@acme.test" });
  });

  it("checks the email and password before calling, and ties the error to the field", async () => {
    const { client } = setup();
    await submit();
    expect(byId("auth-form-error").textContent).toBe("Enter your email.");
    expect(byId("auth-form-email").getAttribute("aria-invalid")).toBe("true");
    expect(byId("auth-form-email").getAttribute("aria-describedby")).toBe(byId("auth-form-error").id);
    type("auth-form-email", "not-an-email");
    await submit();
    expect(byId("auth-form-error").textContent).toBe("Enter a valid email address.");
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(byId("auth-form-error").textContent).toBe("Enter your password.");
    expect(client.signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the catalogue's copy for the client's error code, else its message, and the catalogue can be reworded", async () => {
    const client = mockClient({
      signInWithPassword: vi
        .fn()
        .mockResolvedValueOnce({ error: { code: "invalid_credentials", message: "Invalid login credentials" } })
        .mockResolvedValueOnce({ error: { code: "something_new", message: "A server sentence" } }),
    });
    render(
      <UiMessagesProvider messages={{ auth: { errors: { invalid_credentials: "Wrong email or password." } } }}>
        <AuthForm client={client} providers={false} />
      </UiMessagesProvider>,
    );
    type("auth-form-email", "sam@acme.test");
    type("auth-form-password", "nope");
    await submit();
    expect(screen.getByRole("alert").textContent).toBe("Wrong email or password.");
    await submit();
    expect(screen.getByRole("alert").textContent).toBe("A server sentence");
  });

  it("reports a throwing client and shows fixed copy", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { onSuccess } = setup({ client: mockClient({ signInWithPassword: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }) });
    type("auth-form-email", "sam@acme.test");
    type("auth-form-password", "pw");
    await submit();
    expect(byId("auth-form-error").textContent).toMatch(/offline/);
    expect(onSuccess).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("sends a magic link and says to check the email", async () => {
    const { client } = setup({ methods: ["magic-link"], allowSignUp: false });
    expect(screen.queryByTestId("auth-form-password")).toBeNull();
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(client.sendMagicLink).toHaveBeenCalledWith({ email: "sam@acme.test", createUser: false });
    expect(byId("auth-form-status").textContent).toContain("We sent a sign-in link to sam@acme.test");
    fireEvent.click(byId("auth-form-start-over"));
    expect((byId("auth-form-email") as HTMLInputElement).value).toBe("sam@acme.test");
  });

  it("switches between the methods it is given", () => {
    setup({ methods: ["password", "email-code", "magic-link"] });
    expect(byId("auth-form-submit").textContent).toBe("Sign in");
    fireEvent.click(byId("auth-form-method-email-code"));
    expect(byId("auth-form-submit").textContent).toBe("Email me a code");
    expect(screen.queryByTestId("auth-form-password")).toBeNull();
    fireEvent.click(byId("auth-form-method-magic-link"));
    expect(byId("auth-form-submit").textContent).toBe("Email me a sign-in link");
  });
});

describe("AuthForm: the email code step", () => {
  async function toCodeStep(client = mockClient()) {
    const view = setup({ client, methods: ["email-code"], resendCooldown: 30 });
    type("auth-form-email", "sam@acme.test");
    await submit();
    return view;
  }

  it("uses InputOTP with one-time-code autocomplete and verifies on the last digit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { client, onSuccess } = await toCodeStep();
    expect(client.sendEmailCode).toHaveBeenCalledWith({ email: "sam@acme.test", createUser: true });
    const input = screen.getByLabelText("Code") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("maxlength")).toBe("6");
    expect(screen.getByText("We sent a 6-digit code to sam@acme.test.")).toBeTruthy();
    await act(async () => {
      fireEvent.change(input, { target: { value: "123456" } });
    });
    await waitFor(() => expect(client.verifyEmailCode).toHaveBeenCalledWith({ email: "sam@acme.test", code: "123456" }));
    expect(onSuccess).toHaveBeenCalledWith({ mode: "sign-in", method: "email-code", email: "sam@acme.test" });
    vi.useRealTimers();
  });

  it("asks for the whole code, and clears a wrong one with the error", async () => {
    const client = mockClient({ verifyEmailCode: vi.fn().mockResolvedValue({ error: { code: "otp_expired", message: "Token has expired or is invalid" } }) });
    await toCodeStep(client);
    await submit();
    expect(byId("auth-form-error").textContent).toBe("Enter the 6-digit code.");
    const input = screen.getByLabelText("Code") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "999999" } });
    });
    await waitFor(() => expect(byId("auth-form-error").textContent).toBe("That code has expired or is wrong. Ask for a new one."));
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.value).toBe("");
  });

  /** One second at a time: each tick re-renders and schedules the next. */
  const tick = async (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
  };

  it("resends only after the cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      const { client } = await toCodeStep();
      const resend = byId("auth-form-resend") as HTMLButtonElement;
      expect(resend.textContent).toBe("Resend code in 30s");
      expect(resend.disabled).toBe(true);
      await tick(10);
      expect(byId("auth-form-resend").textContent).toBe("Resend code in 20s");
      await tick(20);
      expect(byId("auth-form-resend").textContent).toBe("Resend code");
      await act(async () => {
        fireEvent.click(byId("auth-form-resend"));
      });
      expect(client.sendEmailCode).toHaveBeenCalledTimes(2);
      expect(byId("auth-form-status").textContent).toBe("We sent a new code.");
      expect(byId("auth-form-resend").textContent).toBe("Resend code in 30s");
    } finally {
      vi.useRealTimers();
    }
  });

  it("goes back to the email", async () => {
    await toCodeStep();
    fireEvent.click(byId("auth-form-start-over"));
    expect(byId("auth-form-email")).toBeTruthy();
  });
});

describe("AuthForm: sign-up, forgot and new password", () => {
  it("signs up, and says to confirm the email when there is no session yet", async () => {
    const client = mockClient({ signUp: vi.fn().mockResolvedValue({ confirmEmail: true }) });
    const { onSuccess } = setup({ client, defaultMode: "sign-up" });
    type("auth-form-email", "new@acme.test");
    type("auth-form-password", "short");
    await submit();
    expect(byId("auth-form-error").textContent).toBe("Use at least 8 characters.");
    type("auth-form-password", "long-enough");
    await submit();
    expect(client.signUp).toHaveBeenCalledWith({ email: "new@acme.test", password: "long-enough" });
    expect(byId("auth-form-status").textContent).toContain("confirm your account");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("signs up straight into a session", async () => {
    const { client, onSuccess } = setup({ defaultMode: "sign-up" });
    type("auth-form-email", "new@acme.test");
    type("auth-form-password", "long-enough");
    await submit();
    expect(client.signUp).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({ mode: "sign-up", email: "new@acme.test" });
  });

  it("moves between modes through its links, uncontrolled and controlled", () => {
    const onModeChange = vi.fn();
    const { rerender, client } = setup({ onModeChange });
    fireEvent.click(byId("auth-form-mode-forgot-password"));
    expect(onModeChange).toHaveBeenLastCalledWith("forgot-password");
    expect(byId("auth-form-submit").textContent).toBe("Send reset link");
    fireEvent.click(byId("auth-form-mode-sign-in"));
    fireEvent.click(byId("auth-form-mode-sign-up"));
    expect(byId("auth-form-submit").textContent).toBe("Create account");

    rerender(<AuthForm client={client} providers={false} mode="sign-in" onModeChange={onModeChange} />);
    fireEvent.click(byId("auth-form-mode-sign-up"));
    expect(onModeChange).toHaveBeenLastCalledWith("sign-up");
    expect(byId("auth-form-submit").textContent).toBe("Sign in");
  });

  it("sends the reset email", async () => {
    const { client } = setup({ defaultMode: "forgot-password" });
    expect(screen.queryByTestId("auth-form-password")).toBeNull();
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(client.sendPasswordReset).toHaveBeenCalledWith({ email: "sam@acme.test" });
    expect(byId("auth-form-status").textContent).toContain("If sam@acme.test has an account");
  });

  it("saves a new password once both match", async () => {
    const { client, onSuccess } = setup({ defaultMode: "new-password" });
    expect(screen.queryByTestId("auth-form-email")).toBeNull();
    type("auth-form-password", "brand-new-pw");
    type("auth-form-confirm", "brand-new-px");
    await submit();
    expect(byId("auth-form-error").textContent).toBe("The passwords don't match.");
    expect(byId("auth-form-confirm").getAttribute("aria-invalid")).toBe("true");
    type("auth-form-confirm", "brand-new-pw");
    await submit();
    expect(client.updatePassword).toHaveBeenCalledWith({ password: "brand-new-pw" });
    expect(byId("auth-form-status").textContent).toBe("Your password is changed.");
    expect(onSuccess).toHaveBeenCalledWith({ mode: "new-password" });
  });
});

describe("AuthForm: providers", () => {
  it("draws the providers it is given and starts one", async () => {
    const { client } = setup({ providers: ["google", { id: "acme-sso", label: "Continue with Acme SSO" }] });
    expect(byId("auth-form-provider-google").textContent).toBe("Continue with Google");
    expect(screen.getByRole("group", { name: "Sign in with" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(byId("auth-form-provider-acme-sso"));
    });
    expect(client.signInWithProvider).toHaveBeenCalledWith("acme-sso");
  });

  it("discovers them from the client when it isn't given a list", async () => {
    const client = mockClient({ providers: vi.fn().mockResolvedValue(["apple", "github"]) });
    render(<AuthForm client={client} />);
    expect(await screen.findByText("Continue with GitHub")).toBeTruthy();
    expect(byId("auth-form-provider-apple").textContent).toBe("Continue with Apple");
    expect(client.providers).toHaveBeenCalledTimes(1);
  });

  it("shows none when discovery fails, or with providers={false}, or in the reset modes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = mockClient({ providers: vi.fn().mockRejectedValue(new Error("down")) });
    const { unmount } = render(<AuthForm client={failing} />);
    await waitFor(() => expect(failing.providers).toHaveBeenCalled());
    expect(screen.queryByRole("group")).toBeNull();
    unmount();
    const listed = mockClient({ providers: vi.fn().mockResolvedValue(["google"]) });
    const second = render(<AuthForm client={listed} providers={false} />);
    expect(listed.providers).not.toHaveBeenCalled();
    second.unmount();
    render(<AuthForm client={mockClient()} providers={["google"]} defaultMode="forgot-password" />);
    expect(screen.queryByTestId("auth-form-provider-google")).toBeNull();
    warn.mockRestore();
  });
});

describe("AuthForm: accessibility", () => {
  it("labels every field and sets the autocomplete each needs", () => {
    const { rerender, client } = setup();
    const email = screen.getByLabelText("Email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByRole("form", { name: "Sign in" })).toBeTruthy();

    rerender(<AuthForm client={client} providers={false} mode="sign-up" />);
    const newPassword = screen.getByLabelText("Password");
    expect(newPassword.getAttribute("autocomplete")).toBe("new-password");
    expect(newPassword.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(newPassword.getAttribute("aria-describedby")!)?.textContent).toBe("At least 8 characters.");

    rerender(<AuthForm client={client} providers={false} mode="new-password" />);
    expect(screen.getByLabelText("New password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Confirm new password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByRole("form", { name: "Choose a new password" })).toBeTruthy();
  });

  it("disables the submit while a call is open and makes one call for a double submit", async () => {
    let resolve: (v: object) => void = () => {};
    const client = mockClient({ signInWithPassword: vi.fn(() => new Promise<object>((r) => (resolve = r))) });
    setup({ client });
    type("auth-form-email", "sam@acme.test");
    type("auth-form-password", "pw");
    fireEvent.click(byId("auth-form-submit"));
    fireEvent.click(byId("auth-form-submit"));
    await waitFor(() => expect(byId("auth-form-submit").getAttribute("aria-busy")).toBe("true"));
    expect(client.signInWithPassword).toHaveBeenCalledTimes(1);
    await act(async () => resolve({}));
  });
});
