import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Alert, type AlertButton } from "react-native";
import { act, screen, userEvent, within } from "@testing-library/react-native";
import { copy } from "@/copy";
import { fakeSupabase, next } from "./fake-supabase";
import { expectPathname, renderApp } from "./render-app";

const t = copy.settings;

/** Records every Alert instead of showing it; `press` taps one of the last alert's buttons. */
function captureAlerts() {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const last = () => {
    const call = alert.mock.calls.at(-1);
    if (!call) throw new Error("no Alert was shown");
    const [title, message, buttons] = call;
    return { title, message, buttons: buttons ?? [] };
  };
  const press = async (text: string) => {
    const button = last().buttons.find((b: AlertButton) => b.text === text);
    if (!button) throw new Error(`the last Alert has no "${text}" button: ${JSON.stringify(last().buttons.map((b) => b.text))}`);
    await act(async () => {
      button.onPress?.();
    });
  };
  return { alert, last, press };
}

const deleteCalls = () => fakeSupabase.rpc.mock.calls.filter(([fn]) => fn === "delete_my_account");

describe("settings screen", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows who is signed in, the Notifications row, the version and both account actions", async () => {
    await renderApp("/settings", "person@example.com");
    const account = await screen.findByTestId("settings-row-email");
    expect(within(account).getByText(t.signedInAs)).toBeOnTheScreen();
    expect(within(account).getByText("person@example.com")).toBeOnTheScreen();
    // The push block's row, added through useBlockSettings into the untitled `general` section.
    expect(within(screen.getByTestId("genesis-push-settings")).getByText(t.notifications)).toBeOnTheScreen();
    expect(within(screen.getByTestId("settings-row-version")).getByText(t.version)).toBeOnTheScreen();
    expect(within(screen.getByTestId("sign-out")).getByText(t.signOut)).toBeOnTheScreen();
    expect(within(screen.getByTestId("delete-account")).getByText(t.deleteAccount)).toBeOnTheScreen();
  });

  it("signs out, and the app goes back to sign-in", async () => {
    const app = await renderApp("/settings", "person@example.com");
    await userEvent.setup().press(await screen.findByTestId("sign-out"));
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(copy.signIn.headline)).toBeOnTheScreen();
    await expectPathname(app, "/sign-in");
  });

  it("asks before deleting the account, and Cancel deletes nothing", async () => {
    const alerts = captureAlerts();
    await renderApp("/settings", "person@example.com");
    await userEvent.setup().press(await screen.findByTestId("delete-account"));
    expect(alerts.last().title).toBe(t.deleteConfirmTitle);
    expect(alerts.last().message).toBe(t.deleteConfirmBody);
    expect(alerts.last().buttons.find((b) => b.text === t.deleteConfirm)?.style).toBe("destructive");
    await alerts.press(t.cancel);
    expect(deleteCalls()).toHaveLength(0);
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("deletes the account once confirmed, signs this device out and says so", async () => {
    const alerts = captureAlerts();
    const app = await renderApp("/settings", "person@example.com");
    await userEvent.setup().press(await screen.findByTestId("delete-account"));
    await alerts.press(t.deleteConfirm);
    expect(deleteCalls()).toHaveLength(1);
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(alerts.last().title).toBe(t.deletedTitle);
    await expectPathname(app, "/sign-in");
  });

  it("reports a refusal as a refusal, keeps the session and offers a fresh sign-in", async () => {
    const alerts = captureAlerts();
    const app = await renderApp("/settings", "person@example.com");
    next.deleteError = "GA002"; // the app requires a recent sign-in
    await userEvent.setup().press(await screen.findByTestId("delete-account"));
    await alerts.press(t.deleteConfirm);
    expect(deleteCalls()).toHaveLength(1);
    expect(alerts.last().title).toBe(t.deleteFailedTitle);
    expect(alerts.last().message).toBe(t.deleteErrors.recentSignIn);
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe("/settings");
    await alerts.press(t.signInAgain);
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    await expectPathname(app, "/sign-in");
  });
});
