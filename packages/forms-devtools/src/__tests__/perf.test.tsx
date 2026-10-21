import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createForm, defineForm, f, replay } from "@marktiderman/genesis-forms";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import { Inspector, TimelinePanel } from "../index";

vi.mock("@marktiderman/genesis-forms", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@marktiderman/genesis-forms")>();
  return { ...mod, replay: vi.fn(mod.replay) };
});
vi.mock("@marktiderman/genesis-forms/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@marktiderman/genesis-forms/server")>();
  return { ...mod, validateSubmission: vi.fn(mod.validateSubmission) };
});

const form = defineForm({ id: "p", title: "P", blocks: [f.rating("overall", { label: "Overall" })] });

beforeEach(() => {
  vi.mocked(replay).mockClear();
});

describe("finding 12: perf", () => {
  it("the timeline does not replay while live, and does when scrubbing", () => {
    const engine = createForm(form.definition, { clock: () => undefined });
    act(() => {
      engine.setValue("overall", 1);
      engine.setValue("overall", 2);
    });
    render(<TimelinePanel engine={engine} />);
    act(() => engine.setValue("overall", 3));
    expect(replay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it("the inspector's default context is stable, so the server check is not redone on re-render", () => {
    const engine = createForm(form.definition, { clock: () => undefined });
    const { rerender } = render(<Inspector engine={engine} defaultTab="server" />);
    const calls = vi.mocked(validateSubmission).mock.calls.length;
    rerender(<Inspector engine={engine} defaultTab="server" />);
    rerender(<Inspector engine={engine} defaultTab="server" />);
    expect(vi.mocked(validateSubmission).mock.calls.length).toBe(calls);
  });
});
