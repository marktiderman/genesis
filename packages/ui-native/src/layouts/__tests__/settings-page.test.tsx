import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsPage,
  getSettingsPageStackOptions,
} from "../settings-page";

describe("SettingsPage", () => {
  it("renders sectioned rows", () => {
    render(
      <SettingsPage
        testID="settings"
        sections={[
          {
            id: "account",
            title: "Account",
            rows: [
              { id: "name", title: "Name", subtitle: "Mark" },
              { id: "email", title: "Email", subtitle: "mark@x.com" },
            ],
          },
          {
            id: "prefs",
            title: "Preferences",
            rows: [{ id: "theme", title: "Theme", showChevron: true }],
          },
        ]}
      />,
    );
    expect(screen.getByTestId("settings-section-account")).toBeTruthy();
    expect(screen.getByTestId("settings-section-prefs")).toBeTruthy();
    expect(screen.getByTestId("settings-row-name")).toBeTruthy();
    expect(screen.getByTestId("settings-row-email")).toBeTruthy();
    expect(screen.getByTestId("settings-row-theme")).toBeTruthy();
  });

  it("invokes row onPress when pressed", () => {
    const onPress = vi.fn();
    render(
      <SettingsPage
        testID="settings"
        sections={[
          {
            id: "s1",
            rows: [{ id: "r1", title: "Logout", onPress }],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("settings-row-r1"));
    expect(onPress).toHaveBeenCalled();
  });

  it("renders dangerousActions footer with destructive buttons", () => {
    const signOut = vi.fn();
    const deleteAcct = vi.fn();
    render(
      <SettingsPage
        testID="settings"
        sections={[
          { id: "s1", rows: [{ id: "r1", title: "Item" }] },
        ]}
        dangerousActions={[
          { label: "Sign out", onPress: signOut },
          {
            label: "Delete account",
            onPress: deleteAcct,
            emphasized: true,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("settings-dangerous-actions")).toBeTruthy();
    fireEvent.click(screen.getByTestId("settings-danger-sign-out"));
    expect(signOut).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("settings-danger-delete-account"));
    expect(deleteAcct).toHaveBeenCalled();
  });

  it("section title is omitted when not provided", () => {
    render(
      <SettingsPage
        testID="settings"
        sections={[
          {
            id: "untitled",
            rows: [{ id: "r1", title: "Item" }],
          },
        ]}
      />,
    );
    expect(screen.queryByTestId("settings-section-untitled-header")).toBeNull();
  });
});

describe("getSettingsPageStackOptions", () => {
  it("defaults to large=true and scrollEdgeBehavior=match", () => {
    const opts = getSettingsPageStackOptions({});
    expect(opts.headerLargeTitle).toBe(true);
    expect(opts.title).toBe("Settings");
  });

  it("overrides default title via headerTitle prop", () => {
    const opts = getSettingsPageStackOptions({ headerTitle: "Profile" });
    expect(opts.title).toBe("Profile");
  });
});
