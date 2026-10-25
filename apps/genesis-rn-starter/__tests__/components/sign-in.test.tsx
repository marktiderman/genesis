import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Alert } from "react-native";
import { screen, userEvent } from "@testing-library/react-native";
import { copy, format } from "@/copy";
import { fakeSupabase, next } from "./fake-supabase";
import { expectPathname, renderApp } from "./render-app";

const t = copy.signIn;

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  const emailField = await screen.findByTestId("auth-screen-form-email");
  const passwordField = screen.getByTestId("auth-screen-form-password");
  await user.clear(emailField);
  if (email) await user.type(emailField, email);
  await user.clear(passwordField);
  if (password) await user.type(passwordField, password);
  await user.press(screen.getByTestId("auth-screen-form-submit"));
}

describe("sign-in screen", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is where a signed-out person lands, with the catalog's copy, the email form and Sign in with Apple", async () => {
    const app = await renderApp("/", null);
    expect(await screen.findByText(t.headline)).toBeOnTheScreen();
    await expectPathname(app, "/sign-in");
    expect(screen.getByText(t.subhead)).toBeOnTheScreen();
    expect(screen.getByTestId("auth-screen-form-email")).toBeOnTheScreen();
    expect(screen.getByTestId("auth-screen-form-password")).toBeOnTheScreen();
    expect(screen.getByText(t.submit)).toBeOnTheScreen();
    expect(screen.getByTestId("auth-screen-social-apple")).toBeOnTheScreen();
  });

  it("signs in with the typed email and password, then goes home", async () => {
    const app = await renderApp("/sign-in", null);
    await fillAndSubmit("person@example.com", "correct horse");
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    expect(fakeSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(fakeSupabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "person@example.com", password: "correct horse" });
    expect(fakeSupabase.auth.signUp).not.toHaveBeenCalled();
    await expectPathname(app, "/");
  });

  it("refuses an empty email or password before calling Supabase", async () => {
    await renderApp("/sign-in", null);
    await fillAndSubmit("", "a password");
    expect(await screen.findByText(t.emailRequired)).toBeOnTheScreen();
    await fillAndSubmit("person@example.com", "");
    expect(await screen.findByText(t.passwordRequired)).toBeOnTheScreen();
    expect(fakeSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the catalog's message for Supabase's error code, never the server's text", async () => {
    const app = await renderApp("/sign-in", null);
    next.authError = "invalid_credentials";
    await fillAndSubmit("person@example.com", "wrong");
    expect(await screen.findByText(t.errors.invalid_credentials)).toBeOnTheScreen();
    expect(screen.queryByText("server text for invalid_credentials")).not.toBeOnTheScreen();
    expect(app.getPathname()).toBe("/sign-in");
  });

  it("creates an account after the switch, and asks to confirm the email when Supabase wants it", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const app = await renderApp("/sign-in", null);
    await userEvent.setup().press(await screen.findByTestId("sign-in-switch"));
    expect(screen.getByText(t.createSubmit)).toBeOnTheScreen();
    next.confirmEmail = true;
    await fillAndSubmit("new@example.com", "a long password");
    // Back to "Sign in" once the account exists and waits for its confirmation.
    expect(await screen.findByText(t.submit)).toBeOnTheScreen();
    expect(fakeSupabase.auth.signUp).toHaveBeenCalledWith({ email: "new@example.com", password: "a long password" });
    expect(fakeSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(t.checkInboxTitle, format(t.checkInboxBody, { email: "new@example.com" }));
    expect(app.getPathname()).toBe("/sign-in");
  });

  it("sends a signed-in person who opens sign-in home", async () => {
    const app = await renderApp("/sign-in", "person@example.com");
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    await expectPathname(app, "/");
  });
});
