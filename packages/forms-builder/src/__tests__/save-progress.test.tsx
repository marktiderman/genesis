// @feat:forms-builder
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { FormBuilder, updateSettings } from "../index";

const form = (settings?: FormDefinition["settings"]): FormDefinition => ({
  schemaVersion: 1,
  id: "f",
  title: "How was class?",
  layout: { mode: "focus" },
  blocks: [{ kind: "field", id: "q_overall", key: "overall", type: "rating", label: "How was class?" }],
  ...(settings ? { settings } : {}),
});

describe("Save answers as they go", () => {
  it("is a switch in the form's settings that stores settings.saveProgress only when on", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} tabs={false} tab="settings" onChange={onChange} />);
    expect(screen.getByRole("heading", { name: "Responses" })).toBeTruthy();
    const toggle = screen.getByTestId("builder-save-progress");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    const on = onChange.mock.lastCall![0] as FormDefinition;
    expect(on.settings).toEqual({ saveProgress: true });
    fireEvent.click(screen.getByTestId("builder-save-progress"));
    expect((onChange.mock.lastCall![0] as FormDefinition).settings).toBeUndefined();
  });

  it("goes when the host owns it", () => {
    render(<FormBuilder defaultValue={form()} tabs={false} tab="settings" settingsOmit={["saveProgress"]} />);
    expect(screen.queryByTestId("builder-save-progress")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Responses" })).toBeNull();
  });

  it("keeps other settings when turned off", () => {
    const def = form({ anonymous: true, saveProgress: true });
    expect(updateSettings(def, { saveProgress: false }).settings).toEqual({ anonymous: true });
    expect(updateSettings(def, { saveProgress: true })).toBe(def);
  });
});
