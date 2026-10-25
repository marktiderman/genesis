import { describe, expect, it } from "@jest/globals";
import { act, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { copy } from "@/copy";
import { emit } from "./fake-supabase";
import { expectPathname, renderApp } from "./render-app";
import { tabTitles } from "./tabs";

describe("tabs", () => {
  it("opens a signed-in person on Home, with Home, Notifications and Settings in the tab bar", async () => {
    const app = await renderApp("/", "person@example.com");
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/");
    expect(tabTitles()).toEqual([copy.tabs.home, copy.tabs.notifications, copy.tabs.settings]);
  });

  it("routes each tab to its screen", async () => {
    const app = await renderApp("/", "person@example.com");
    await screen.findByTestId("home");
    // A tab switch, as the tab bar makes it (expo-router's testRouter asserts the internal no-animation param too).
    await act(async () => router.navigate("/notifications"));
    expect(await screen.findByText(copy.notifications.emptyTitle)).toBeOnTheScreen();
    await expectPathname(app, "/notifications");
    await act(async () => router.navigate("/settings"));
    expect(await screen.findByTestId("settings-row-email")).toBeOnTheScreen();
    await expectPathname(app, "/settings");
  });

  it("sends a signed-out deep link into a tab to sign-in", async () => {
    const app = await renderApp("/settings", null);
    expect(await screen.findByText(copy.signIn.headline)).toBeOnTheScreen();
    await expectPathname(app, "/sign-in");
    expect(screen.queryByTestId("settings")).not.toBeOnTheScreen();
  });

  it("leaves the tabs for sign-in when the session ends elsewhere", async () => {
    const app = await renderApp("/notifications", "person@example.com");
    await screen.findByText(copy.notifications.emptyTitle);
    emit("SIGNED_OUT", null);
    expect(await screen.findByText(copy.signIn.headline)).toBeOnTheScreen();
    await expectPathname(app, "/sign-in");
  });
});
