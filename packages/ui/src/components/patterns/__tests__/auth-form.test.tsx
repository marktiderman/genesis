// @feat:account
/**
 * AuthForm against a mocked auth client.
 *
 * What is pinned: each mode's flow makes the client call it should and ends
 * where it should (onSuccess, a "check your email" status, the code step);
 * the code step verifies on the last digit, resends only after the
 * cooldown and starts over; providers come from the list given or from
 * `client.providers()`, asked once however often the parent renders; errors
 * are the catalogue's copy for the client's code (never the server's text),
 * announced (role="alert") and tied to the field the code is about; without
 * sign-up an unknown email is answered as sent, in neutral copy; every field
 * has a label and the autocomplete a password manager needs.
 */
import { setErrorReporter } from "@marktiderman/genesis-core/errors";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("shows the catalogue's copy for the client's code, never the server's text, and the catalogue can be reworded", async () => {
    const reports: Array<{ error: unknown; tags: unknown }> = [];
    const restore = setErrorReporter((error, context) => reports.push({ error, tags: context.tags }));
    try {
      const client = mockClient({
        signInWithPassword: vi
          .fn()
          .mockResolvedValueOnce({ error: { code: "invalid_credentials", message: "Invalid login credentials" } })
          .mockResolvedValueOnce({ error: { code: "something_new", message: "A server sentence" } })
          .mockResolvedValueOnce({ error: { code: "something_new", message: "Your trial has ended.", displayable: true } }),
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
      expect(reports).toHaveLength(0);
      await submit();
      expect(screen.getByRole("alert").textContent).toBe("That didn't work. Try again.");
      expect(reports).toHaveLength(1);
      expect((reports[0]!.error as Error).message).toBe("A server sentence");
      expect(reports[0]!.tags).toEqual({ mode: "sign-in", code: "something_new" });
      // A message the client wrote for people, marked displayable, is shown.
      await submit();
      expect(screen.getByRole("alert").textContent).toBe("Your trial has ended.");
      expect(reports).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it("answers a long input that a backtracking email pattern would choke on at once", async () => {
    const { client } = setup({ methods: ["magic-link"] });
    type("auth-form-email", `${"a".repeat(50_000)}@${"b".repeat(50_000)}`);
    const started = performance.now();
    await submit();
    expect(performance.now() - started).toBeLessThan(1000);
    expect(byId("auth-form-error").textContent).toBe("Enter a valid email address.");
    expect(client.sendMagicLink).not.toHaveBeenCalled();
  });

  it("ties a server error to the field its code is about, and to none otherwise", async () => {
    const signUp = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "weak_password" } })
      .mockResolvedValueOnce({ error: { code: "user_already_exists" } })
      .mockResolvedValueOnce({ error: { code: "email_address_invalid" } })
      .mockResolvedValueOnce({ error: { code: "over_request_rate_limit" } });
    setup({ client: mockClient({ signUp }), defaultMode: "sign-up" });
    type("auth-form-email", "new@acme.test");
    type("auth-form-password", "long-enough");
    const invalid = () => ({
      email: byId("auth-form-email").getAttribute("aria-invalid"),
      password: byId("auth-form-password").getAttribute("aria-invalid"),
    });
    await submit();
    expect(byId("auth-form-error").textContent).toBe("Choose a stronger password.");
    expect(invalid()).toEqual({ email: null, password: "true" });
    await submit();
    expect(invalid()).toEqual({ email: "true", password: null });
    await submit();
    expect(invalid()).toEqual({ email: "true", password: null });
    await submit();
    expect(invalid()).toEqual({ email: null, password: null });
  });

  it("doesn't tie a wrong password to either field", async () => {
    setup({ client: mockClient({ signInWithPassword: vi.fn().mockResolvedValue({ error: { code: "invalid_credentials" } }) }) });
    type("auth-form-email", "sam@acme.test");
    type("auth-form-password", "nope");
    await submit();
    expect(byId("auth-form-email").getAttribute("aria-invalid")).toBeNull();
    expect(byId("auth-form-password").getAttribute("aria-invalid")).toBeNull();
  });

  it.each([
    ["sam@acme.test", true],
    ["a.b+c@mail.acme.co.uk", true],
    ["no-at-sign", false],
    ["@acme.test", false],
    ["sam@", false],
    ["sam@acme", false],
    ["sam@.acme", false],
    ["sam@acme.", false],
    ["sam@@acme.test", false],
    ["sam@x@acme.test", false],
    ["sam smith@acme.test", false],
    ["sam@acme\t.test", false],
  ])("checks %j as an email: %s", async (value, ok) => {
    const { client } = setup({ methods: ["magic-link"] });
    type("auth-form-email", value);
    await submit();
    expect(client.sendMagicLink).toHaveBeenCalledTimes(ok ? 1 : 0);
    if (!ok) expect(byId("auth-form-error").textContent).toBe("Enter a valid email address.");
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
    expect(byId("auth-form-status").textContent).toContain("If sam@acme.test has an account, we sent it a sign-in link");
    // The form is gone: focus is on the heading that replaced it.
    expect(document.activeElement).toBe(byId("auth-form-status-title"));
    expect(byId("auth-form-status-title").tagName).toBe("H2");
    expect(byId("auth-form-status-title").getAttribute("tabindex")).toBe("-1");
    fireEvent.click(byId("auth-form-start-over"));
    expect((byId("auth-form-email") as HTMLInputElement).value).toBe("sam@acme.test");
  });

  it("says a link was sent, in plain words, when sign-up is on", async () => {
    setup({ methods: ["magic-link"] });
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(byId("auth-form-status").textContent).toContain("We sent a sign-in link to sam@acme.test");
  });

  it("without sign-up, answers an email with no account (otp_disabled) as sent, for a link and a code", async () => {
    // In development it tells the developer, since the same code means OTP is off for the project.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = () => Promise.resolve({ error: { code: "otp_disabled", message: "Signups not allowed for otp" } });
    const link = setup({ methods: ["magic-link"], allowSignUp: false, client: mockClient({ sendMagicLink: vi.fn(refused) }) });
    type("auth-form-email", "nobody@acme.test");
    await submit();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(byId("auth-form-status").textContent).toContain("If nobody@acme.test has an account, we sent it a sign-in link");
    link.unmount();

    setup({ methods: ["email-code"], allowSignUp: false, client: mockClient({ sendEmailCode: vi.fn(refused) }) });
    type("auth-form-email", "nobody@acme.test");
    await submit();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("If nobody@acme.test has an account, we sent it a code. It has 6 digits.")).toBeTruthy();
    expect(screen.getByLabelText("Code")).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("otp_disabled, shown as sent"));
    warn.mockRestore();
  });

  it("with sign-up on, otp_disabled is an error", async () => {
    setup({ methods: ["email-code"], client: mockClient({ sendEmailCode: vi.fn().mockResolvedValue({ error: { code: "otp_disabled" } }) }) });
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(byId("auth-form-error").textContent).toBe("Email codes aren't turned on for this app.");
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
    expect(screen.getByText("We sent a code to sam@acme.test. It has 6 digits.")).toBeTruthy();
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

  it("keeps the code field focusable while it verifies: read-only and busy, not disabled", async () => {
    let resolve: (v: object) => void = () => {};
    const client = mockClient({ verifyEmailCode: vi.fn(() => new Promise<object>((r) => (resolve = r))) });
    await toCodeStep(client);
    const input = screen.getByLabelText("Code") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "123456" } });
    });
    await waitFor(() => expect(input.getAttribute("aria-busy")).toBe("true"));
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    await act(async () => resolve({}));
    expect(input.getAttribute("aria-busy")).toBeNull();
    expect(input.readOnly).toBe(false);
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

  it("asks once, however often the parent renders or rebuilds the client", async () => {
    const providers = vi.fn().mockResolvedValue(["google"]);
    const { rerender } = render(<AuthForm client={mockClient({ providers })} />);
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    for (let i = 0; i < 3; i++) rerender(<AuthForm client={mockClient({ providers })} className={`render-${i}`} />);
    await act(async () => {});
    expect(providers).toHaveBeenCalledTimes(1);
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

describe("AuthForm: before hydration", () => {
  it("renders a server page whose native submit can't send a GET or drop what was typed", () => {
    const html = renderToString(<AuthForm client={mockClient()} providers={false} />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    // The email would go in the body, never the URL, should a submit slip through.
    expect(doc.querySelector("form")!.getAttribute("method")).toBe("post");
    // The default button is disabled until hydration: no click submit, no implicit Enter submit.
    const button = doc.querySelector('[data-testid="auth-form-submit"]')!;
    expect(button.hasAttribute("disabled")).toBe(true);
    // Drawn as enabled, so the page doesn't flash a dimmed button.
    expect(button.className).toContain("disabled:opacity-100");
  });

  it("is ready at once on the client, with nothing that changes after mount", () => {
    setup();
    const button = byId("auth-form-submit") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.className).not.toContain("disabled:opacity-100");
  });

  it("becomes submittable once a server-rendered form hydrates", async () => {
    const client = mockClient();
    const container = document.createElement("div");
    container.innerHTML = renderToString(<AuthForm client={client} providers={false} />);
    document.body.appendChild(container);
    const button = () => container.querySelector('[data-testid="auth-form-submit"]') as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <AuthForm client={client} providers={false} />);
    });
    expect(button().disabled).toBe(false);
    act(() => root?.unmount());
    container.remove();
  });
});

describe("AuthForm: notices", () => {
  it("shows a kind's default copy above the form, an expired reset link as an alert", () => {
    setup({ notice: { kind: "reset-link-expired" }, defaultMode: "forgot-password" });
    const notice = byId("auth-form-notice");
    expect(notice.textContent).toBe("That reset link has expired or was already used. Ask for a new one.");
    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.getAttribute("data-kind")).toBe("reset-link-expired");
    expect(notice.compareDocumentPosition(screen.getByRole("form")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("announces a cancelled provider or a deleted account politely", () => {
    const { rerender, client } = setup({ notice: { kind: "provider-cancelled" } });
    expect(byId("auth-form-notice").getAttribute("role")).toBe("status");
    expect(byId("auth-form-notice").textContent).toBe("Sign-in was cancelled. Try again, or use another way to sign in.");
    rerender(<AuthForm client={client} providers={false} notice={{ kind: "account-deleted" }} />);
    expect(byId("auth-form-notice").textContent).toBe("Your account is deleted.");
  });

  it("takes a message of its own, a plain string, a tone, and the catalogue's rewording", () => {
    const { rerender, client } = setup({ notice: { kind: "account-deleted", message: "Your data is gone." } });
    expect(byId("auth-form-notice").textContent).toBe("Your data is gone.");
    rerender(<AuthForm client={client} providers={false} notice="Welcome back." />);
    expect(byId("auth-form-notice").textContent).toBe("Welcome back.");
    expect(byId("auth-form-notice").getAttribute("role")).toBe("status");
    rerender(<AuthForm client={client} providers={false} notice={{ message: "Something broke.", tone: "error" }} />);
    expect(byId("auth-form-notice").getAttribute("role")).toBe("alert");
    rerender(
      <UiMessagesProvider messages={{ auth: { notices: { "provider-cancelled": "You backed out." } } }}>
        <AuthForm client={client} providers={false} notice={{ kind: "provider-cancelled" }} />
      </UiMessagesProvider>,
    );
    expect(byId("auth-form-notice").textContent).toBe("You backed out.");
    rerender(<AuthForm client={client} providers={false} notice={null} />);
    expect(screen.queryByTestId("auth-form-notice")).toBeNull();
  });

  it("leaves the notice behind once the person moves on to check their email", async () => {
    setup({ notice: { kind: "provider-cancelled" }, methods: ["magic-link"] });
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(screen.queryByTestId("auth-form-notice")).toBeNull();
  });
});

describe("AuthForm: the code on the confirm screens", () => {
  it("is off by default", async () => {
    setup({ methods: ["magic-link", "email-code"] });
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(byId("auth-form-status")).toBeTruthy();
    expect(screen.queryByTestId("auth-form-enter-code")).toBeNull();
  });

  it("needs code sign-in among the methods", async () => {
    setup({ methods: ["magic-link"], offerCodeOnConfirm: true });
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(screen.queryByTestId("auth-form-enter-code")).toBeNull();
  });

  it("after a magic link, enters the same email's code and signs in", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { client, onSuccess } = setup({ methods: ["magic-link", "email-code"], offerCodeOnConfirm: true, resendCooldown: 30 });
      type("auth-form-email", "sam@acme.test");
      await submit();
      expect(client.sendMagicLink).toHaveBeenCalledTimes(1);
      fireEvent.click(byId("auth-form-enter-code"));
      // The code step, without sending another email; the resend waits out the cooldown.
      expect(client.sendEmailCode).not.toHaveBeenCalled();
      expect(screen.getByText("We sent a code to sam@acme.test. It has 6 digits.")).toBeTruthy();
      expect((byId("auth-form-resend") as HTMLButtonElement).disabled).toBe(true);
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
      });
      await waitFor(() => expect(client.verifyEmailCode).toHaveBeenCalledWith({ email: "sam@acme.test", code: "123456" }));
      expect(onSuccess).toHaveBeenCalledWith({ mode: "sign-in", method: "email-code", email: "sam@acme.test" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("after sign-up, confirms the account with the code", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = mockClient({ signUp: vi.fn().mockResolvedValue({ confirmEmail: true }) });
      const { onSuccess } = setup({ client, defaultMode: "sign-up", methods: ["password", "email-code"], offerCodeOnConfirm: true });
      type("auth-form-email", "new@acme.test");
      type("auth-form-password", "long-enough");
      await submit();
      expect(byId("auth-form-status").textContent).toContain("confirm your account");
      fireEvent.click(byId("auth-form-enter-code"));
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Code"), { target: { value: "654321" } });
      });
      await waitFor(() => expect(client.verifyEmailCode).toHaveBeenCalledWith({ email: "new@acme.test", code: "654321" }));
      expect(onSuccess).toHaveBeenCalledWith({ mode: "sign-up", method: "email-code", email: "new@acme.test" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("isn't offered after a reset email", async () => {
    setup({ defaultMode: "forgot-password", methods: ["password", "email-code"], offerCodeOnConfirm: true });
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(screen.queryByTestId("auth-form-enter-code")).toBeNull();
  });
});

describe("AuthForm: code length", () => {
  it.each([8, 11, 18])("words a %i-digit code without a wrong article", async (length) => {
    setup({ methods: ["email-code"], codeLength: length });
    type("auth-form-email", "sam@acme.test");
    await submit();
    expect(screen.getByText(`We sent a code to sam@acme.test. It has ${length} digits.`)).toBeTruthy();
    expect(screen.getByLabelText("Code").getAttribute("maxlength")).toBe(String(length));
  });

  it("in development, a refused code hints that codeLength may not match the project's otp_length", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = mockClient({ verifyEmailCode: vi.fn().mockResolvedValue({ error: { code: "otp_expired" } }) });
    setup({ client, methods: ["email-code"] });
    type("auth-form-email", "sam@acme.test");
    await submit();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    });
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("codeLength matches the project's otp_length")));
    expect(byId("auth-form-error").textContent).toBe("That code has expired or is wrong. Ask for a new one.");
  });
});
