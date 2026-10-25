import { describe, expect, it, jest } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { copy } from "@/copy";
import { renderApp } from "./render-app";
import { tabTitles } from "./tabs";

// This file's app has `features.notifications` off; every other switch is the starter's own.
jest.mock("../../starter.config", () => {
  const actual = jest.requireActual<{ default: { features: object } }>("../../starter.config").default;
  return { __esModule: true, default: { ...actual, features: { ...actual.features, notifications: false } } };
});

describe("tabs with a feature off", () => {
  it("hides the Notifications tab when features.notifications is off", async () => {
    await renderApp("/", "person@example.com");
    await screen.findByTestId("home");
    expect(tabTitles()).toEqual([copy.tabs.home, copy.tabs.settings]);
  });
});
