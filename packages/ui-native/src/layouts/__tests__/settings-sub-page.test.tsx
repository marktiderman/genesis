import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsSubPage,
  confirmDiscardChanges,
  getSettingsSubPageStackOptions,
} from "../settings-sub-page";

describe("SettingsSubPage", () => {
  it("renders form children inside KeyboardAvoidingView", () => {
    render(
      <SettingsSubPage testID="sub" onSave={() => {}}>
        <span data-testid="field">Field</span>
      </SettingsSubPage>,
    );
    expect(screen.getByTestId("sub-kav")).toBeTruthy();
    expect(screen.getByTestId("sub-form")).toBeTruthy();
    expect(screen.getByTestId("field")).toBeTruthy();
  });
});

describe("getSettingsSubPageStackOptions", () => {
  it("wires save button to headerRight when onSave provided", () => {
    const onSave = vi.fn();
    const opts = getSettingsSubPageStackOptions({
      headerTitle: "Edit profile",
      onSave,
      dirty: true,
    });
    expect(opts.title).toBe("Edit profile");
    expect(typeof opts.headerRight).toBe("function");
  });

  it("does not render save button when no onSave", () => {
    const opts = getSettingsSubPageStackOptions({ headerTitle: "Read only" });
    expect(opts.headerRight).toBeUndefined();
  });

  it("respects custom headerRight override", () => {
    const customRight = () => null;
    const opts = getSettingsSubPageStackOptions({
      onSave: () => {},
      headerRight: customRight,
    });
    expect(opts.headerRight).toBe(customRight);
  });
});

describe("confirmDiscardChanges", () => {
  it("is callable without throwing (Alert is shimmed in tests)", () => {
    expect(() => confirmDiscardChanges(() => {})).not.toThrow();
  });
});
