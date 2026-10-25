import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Alert, type AlertButton } from "react-native";
import { act, screen, userEvent, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { draftKey } from "@marktiderman/genesis-chat/native";
import { copy } from "@/copy";
import { fakeSupabase, next, releaseDelete } from "./fake-supabase";
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
    // A full sign-out (the server revokes the refresh token), not just this device's copy.
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledWith();
    expect(await screen.findByText(copy.signIn.headline)).toBeOnTheScreen();
    await expectPathname(app, "/sign-in");
  });

  it("signing out takes that person's chat drafts off the phone, and nothing else of the app's", async () => {
    const mine = draftKey("user-person@example.com", "c1");
    const theirs = "genesis-starter:something-else";
    await AsyncStorage.multiSet([[mine, JSON.stringify({ text: "half written" })], [theirs, "kept"]]);
    await renderApp("/settings", "person@example.com");
    await userEvent.setup().press(await screen.findByTestId("sign-out"));
    expect(await screen.findByText(copy.signIn.headline)).toBeOnTheScreen();
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(mine)).toBeNull();
    expect(await AsyncStorage.getItem(theirs)).not.toBeNull();
  });

  it("signing in takes other people's chat drafts off the phone (a session that ended while the app was closed)", async () => {
    const mine = draftKey("user-person@example.com", "c1");
    const left = draftKey("user-before@example.com", "c1");
    await AsyncStorage.multiSet([[mine, JSON.stringify({ text: "mine" })], [left, JSON.stringify({ text: "left behind" })]]);
    await renderApp("/settings", "person@example.com");
    await screen.findByTestId("sign-out");
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(left)).toBeNull();
    expect(await AsyncStorage.getItem(mine)).not.toBeNull();
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

  it("deletes the account once confirmed, revokes the Apple tokens, signs this device out and says so", async () => {
    const alerts = captureAlerts();
    const app = await renderApp("/settings", "person@example.com");
    await userEvent.setup().press(await screen.findByTestId("delete-account"));
    await alerts.press(t.deleteConfirm);
    expect(deleteCalls()).toHaveLength(1);
    // App Review requires Sign in with Apple tokens to be revoked when the account goes.
    expect(fakeSupabase.functions.invoke).toHaveBeenCalledWith("genesis-apple-revoke", expect.objectContaining({ body: { action: "revoke" } }));
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(alerts.last().title).toBe(t.deletedTitle);
    await expectPathname(app, "/sign-in");
  });

  it("ignores Delete account while a deletion is running", async () => {
    const alerts = captureAlerts();
    await renderApp("/settings", "person@example.com", () => {
      next.holdDelete = true;
    });
    const user = userEvent.setup();
    await user.press(await screen.findByTestId("delete-account"));
    await alerts.press(t.deleteConfirm);
    expect(deleteCalls()).toHaveLength(1);
    const shown = alerts.alert.mock.calls.length;
    await user.press(screen.getByTestId("delete-account"));
    expect(alerts.alert.mock.calls.length).toBe(shown); // no second confirmation
    await act(async () => releaseDelete());
    expect(deleteCalls()).toHaveLength(1);
    expect(alerts.last().title).toBe(t.deletedTitle);
  });

  // delete_my_account's error codes (src/lib/account.ts) → the copy, and whether to offer a fresh sign-in.
  it.each([
    ["GA002", t.deleteErrors.recentSignIn, true],
    ["42501", t.deleteErrors.notAllowed, true],
    ["GA001", t.deleteErrors.refused, false],
    ["GA999", t.deleteErrors.refused, false],
    ["23503", t.deleteErrors.inUse, false],
    ["XX000", t.deleteErrors.unknown, false],
  ])("reports refusal %s as a refusal with its own message, and keeps the session", async (code, message, signInAgain) => {
    const alerts = captureAlerts();
    const app = await renderApp("/settings", "person@example.com", () => {
      next.deleteError = code;
    });
    await userEvent.setup().press(await screen.findByTestId("delete-account"));
    await alerts.press(t.deleteConfirm);
    expect(deleteCalls()).toHaveLength(1);
    expect(alerts.last().title).toBe(t.deleteFailedTitle);
    expect(alerts.last().message).toBe(message);
    expect(alerts.last().buttons.map((b) => b.text)).toEqual(signInAgain ? [t.cancel, t.signInAgain] : [t.ok]);
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe("/settings");
  });

  it("offers a fresh sign-in after a refusal that needs one, and it signs out", async () => {
    const alerts = captureAlerts();
    const app = await renderApp("/settings", "person@example.com", () => {
      next.deleteError = "GA002";
    });
    await userEvent.setup().press(await screen.findByTestId("delete-account"));
    await alerts.press(t.deleteConfirm);
    await alerts.press(t.signInAgain);
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    await expectPathname(app, "/sign-in");
  });
});
