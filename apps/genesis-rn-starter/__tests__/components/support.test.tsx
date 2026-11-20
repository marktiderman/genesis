// @feat:support-feedback
import { afterEach, describe, expect, it } from "@jest/globals";
import { act, screen, waitFor } from "@testing-library/react-native";
import { createStarterSettings, starterSettings } from "@/lib/settings";
import { broadcastSettingsChange, emit, fakeSupabase, resetSupabase, sessionFor, sessionReady, settingsLayers } from "./fake-supabase";
import { renderApp } from "./render-app";
import { expectReport } from "./reports";

const flush = () => act(async () => {});
const joined = () => fakeSupabase.channel.mock.calls.map(([topic]) => topic);

describe("Genesis settings for whoever is signed in", () => {
  let stop: () => void = () => {};
  afterEach(() => stop());

  it("follows the person: a token refresh keeps the watch, a sign-out or another account starts over with nothing of the last one's", async () => {
    resetSupabase(null);
    const alice = sessionFor("alice@example.com");
    const bob = sessionFor("bob@example.com");
    settingsLayers.person[alice.user.id] = { "shake.enabled": { value: false } };
    const settings = createStarterSettings(fakeSupabase, (error) => {
      throw error;
    });
    stop = settings.start();
    await flush();
    // Signed out: the app's own layer only.
    expect(joined()).toEqual(["genesis-settings"]);
    expect(settings.current()?.values["shake.enabled"]).toBe(true);

    emit("SIGNED_IN", alice);
    // Not someone else's values while hers are read.
    expect(settings.current()).toBeUndefined();
    await flush();
    expect(settings.current()?.values["shake.enabled"]).toBe(false);
    expect(joined()).toContain(`genesis-settings:person:${alice.user.id}`);

    const joins = fakeSupabase.channel.mock.calls.length;
    const leaves = fakeSupabase.removeChannel.mock.calls.length;
    emit("TOKEN_REFRESHED", alice);
    await flush();
    expect(fakeSupabase.channel.mock.calls.length).toBe(joins);
    expect(fakeSupabase.removeChannel.mock.calls.length).toBe(leaves);

    // A change to her own value arrives live.
    settingsLayers.person[alice.user.id] = { "shake.enabled": { value: true } };
    broadcastSettingsChange(`genesis-settings:person:${alice.user.id}`);
    await flush();
    expect(settings.current()?.values["shake.enabled"]).toBe(true);
    settingsLayers.person[alice.user.id] = { "shake.enabled": { value: false } };
    broadcastSettingsChange(`genesis-settings:person:${alice.user.id}`);
    await flush();

    emit("SIGNED_OUT", null);
    expect(settings.current()).toBeUndefined();
    await flush();
    expect(settings.current()?.values["shake.enabled"]).toBe(true);

    emit("SIGNED_IN", alice);
    await flush();
    emit("SIGNED_IN", bob);
    expect(settings.current()).toBeUndefined();
    await flush();
    // Bob's own (none): not Alice's.
    expect(settings.current()?.values["shake.enabled"]).toBe(true);
    expect(joined()).toContain(`genesis-settings:person:${bob.user.id}`);
  });
});

describe("Send diagnostics under Settings → About", () => {
  it("shows while diagnostics may be sent from Settings, and goes when the setting turns off", async () => {
    await renderApp("/settings", "person@example.com");
    expect(await screen.findByTestId("send-diagnostics")).toBeOnTheScreen();

    settingsLayers.database["diagnostics.sendFromSettings"] = { value: false };
    await act(async () => broadcastSettingsChange());
    await waitFor(() => expect(screen.queryByTestId("send-diagnostics")).not.toBeOnTheScreen());

    settingsLayers.database["diagnostics.sendFromSettings"] = { value: true };
    await act(async () => broadcastSettingsChange());
    expect(await screen.findByTestId("send-diagnostics")).toBeOnTheScreen();
  });

  it("is not there with the dump off", async () => {
    await renderApp("/settings", "person@example.com", () => {
      settingsLayers.database["diagnostics.enabled"] = { value: false };
    });
    expect(await screen.findByTestId("settings-row-version")).toBeOnTheScreen();
    // Shown on the `max` preset until the app has read its settings, then gone.
    await waitFor(() => expect(starterSettings.current()?.values["diagnostics.enabled"]).toBe(false));
    await waitFor(() => expect(screen.queryByTestId("send-diagnostics")).not.toBeOnTheScreen());
  });
});

describe("Contact support on the fatal screen", () => {
  it("is there when support has somewhere to write", async () => {
    expectReport(/^\[observability\] fatal boot: keychain unavailable$/);
    await renderApp("/", "person@example.com", () => {
      settingsLayers.database["support.contactEmail"] = { value: "help@example.com" };
      sessionReady.mockRejectedValueOnce(new Error("keychain unavailable"));
    });
    expect(await screen.findByTestId("genesis-fatal")).toBeOnTheScreen();
    expect(await screen.findByTestId("genesis-fatal-contact")).toBeOnTheScreen();
  });

  it("is not there without a contact", async () => {
    expectReport(/^\[observability\] fatal boot: keychain unavailable$/);
    await renderApp("/", "person@example.com", () => {
      sessionReady.mockRejectedValueOnce(new Error("keychain unavailable"));
    });
    expect(await screen.findByTestId("genesis-fatal")).toBeOnTheScreen();
    // Once the app has read its settings: there is no contact in them.
    await waitFor(() => expect(starterSettings.current()).toBeDefined());
    await flush();
    expect(starterSettings.current()?.values["support.contactEmail"]).toBeNull();
    expect(screen.queryByTestId("genesis-fatal-contact")).not.toBeOnTheScreen();
  });
});
