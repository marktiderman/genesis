import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as SplashScreen from "expo-splash-screen";
import { act, screen, userEvent } from "@testing-library/react-native";
import { fakeSupabase, sessionReady } from "./fake-supabase";
import { renderApp } from "./render-app";
import { expectReport } from "./reports";

jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(async () => true), hideAsync: jest.fn(async () => true) }));

const splash = jest.mocked(SplashScreen);

describe("root layout", () => {
  beforeEach(() => {
    splash.hideAsync.mockClear();
  });

  it("boots through GenesisNativeApp: the boot steps run, the session is read, the splash goes and the route renders", async () => {
    await renderApp("/", "person@example.com");
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    // `_layout.tsx` holds the splash as the module loads; GenesisNativeApp hides it after the boot.
    expect(splash.preventAutoHideAsync).toHaveBeenCalled();
    expect(splash.hideAsync).toHaveBeenCalled();
    expect(sessionReady).toHaveBeenCalledTimes(1);
    expect(fakeSupabase.auth.getSession).toHaveBeenCalled();
    expect(fakeSupabase.auth.onAuthStateChange).toHaveBeenCalled();
  });

  it("keeps the splash up and renders no route while a boot step is still running", async () => {
    let finish: (value: unknown) => void = () => {};
    await renderApp("/", "person@example.com", () => {
      sessionReady.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    });
    await act(async () => {}); // let the boot start
    expect(sessionReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("home")).not.toBeOnTheScreen();
    expect(splash.hideAsync).not.toHaveBeenCalled();
    await act(async () => finish(false));
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    expect(splash.hideAsync).toHaveBeenCalled();
  });

  it("shows the fatal screen when a boot step fails, reports it, and Try again runs it again", async () => {
    expectReport(/^\[observability\] fatal boot: keychain unavailable$/);
    await renderApp("/", "person@example.com", () => {
      sessionReady.mockRejectedValueOnce(new Error("keychain unavailable"));
    });
    expect(await screen.findByTestId("genesis-fatal")).toBeOnTheScreen();
    expect(screen.queryByTestId("home")).not.toBeOnTheScreen();
    // The fatal screen replaces the splash, so a person can see it and retry.
    expect(splash.hideAsync).toHaveBeenCalled();
    await userEvent.setup().press(screen.getByTestId("genesis-fatal-retry"));
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    expect(sessionReady).toHaveBeenCalledTimes(2);
  });
});
