// @feat:forms-web
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { defineForm, f, type FormDefinition } from "@marktiderman/genesis-forms";
import { Form, PROGRESS_DELAY_MS } from "../index";

const definition = (saveProgress: boolean, mode: "focus" | "classic" = "focus"): FormDefinition => ({
  ...defineForm({
    id: "class-feedback",
    title: "How was class?",
    layout: { mode },
    blocks: [
      f.rating("overall", { label: "How was class?", required: true }),
      f.shortText("went_well", { label: "What went well?" }),
      f.shortText("name", { label: "Your name" }),
    ],
  }).toJSON(),
  ...(saveProgress ? { settings: { saveProgress: true } } : {}),
});

const next = () => fireEvent.submit(document.querySelector("form")!);
const NOTICE = "Your answers save as you go.";

afterEach(() => vi.useRealTimers());

describe("onProgress (settings.saveProgress)", () => {
  it("saves a moment after each step forward, with the furthest question, and never holds up Next", () => {
    vi.useFakeTimers();
    const onProgress = vi.fn(() => new Promise<void>(() => {})); // never settles
    render(
      <Form form={definition(true)} presentation="page" autoAdvance={false} onProgress={onProgress} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    next();
    // The next question is on screen before anything is saved.
    expect(screen.getByLabelText("What went well?")).toBeTruthy();
    expect(onProgress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(onProgress).toHaveBeenCalledOnce();
    const [engine, progress] = onProgress.mock.calls[0] as unknown as [
      { answers(): Record<string, unknown>; idOf(key: string): string },
      { step: number; total: number; fieldId: string },
    ];
    expect(progress).toEqual({ step: 2, total: 3, fieldId: engine.idOf("went_well") });
    expect(engine.answers()).toEqual({ [engine.idOf("overall")]: 4 });

    // Going back saves nothing; quick steps forward save once.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(onProgress).toHaveBeenCalledOnce();
    next();
    next();
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect((onProgress.mock.calls[1] as unknown as [unknown, { fieldId: string }])[1].fieldId).toBe(
      engine.idOf("name"),
    );
  });

  it("ignores a failed save, and makes none once the form is sent", async () => {
    vi.useFakeTimers();
    const onProgress = vi.fn(() => Promise.reject(new Error("offline")));
    const onSubmit = vi.fn();
    render(
      <Form
        form={definition(true)}
        presentation="page"
        autoAdvance={false}
        onProgress={onProgress}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    next();
    await act(async () => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(onProgress).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("What went well?")).toBeTruthy();
    next();
    // Sent before the pending save goes: it never does.
    await act(async () => next());
    expect(onSubmit).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(PROGRESS_DELAY_MS * 2));
    expect(onProgress).toHaveBeenCalledOnce();
  });

  it("sends a pending save when the page is hidden", () => {
    vi.useFakeTimers();
    const onProgress = vi.fn();
    render(<Form form={definition(true)} autoAdvance={false} onProgress={onProgress} />);
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    next();
    window.dispatchEvent(new Event("pagehide"));
    expect(onProgress).toHaveBeenCalledOnce();
  });

  it("tells respondents under the first question, until they move on", () => {
    render(
      <Form form={definition(true)} presentation="page" autoAdvance={false} onProgress={() => {}} />,
    );
    expect(screen.getByText(NOTICE)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    next();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("does nothing, and says nothing, unless the form saves progress and the host saves it", () => {
    vi.useFakeTimers();
    const onProgress = vi.fn();
    const { unmount } = render(
      <Form form={definition(false)} presentation="page" autoAdvance={false} onProgress={onProgress} />,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    next();
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(onProgress).not.toHaveBeenCalled();
    unmount();
    render(<Form form={definition(true)} presentation="page" autoAdvance={false} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("in classic layout, saves a moment after the answers change", () => {
    vi.useFakeTimers();
    const onProgress = vi.fn();
    render(<Form form={definition(true, "classic")} onProgress={onProgress} progressNotice="Saved as you go" />);
    expect(screen.getByText("Saved as you go")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("What went well?"), { target: { value: "Pacing" } });
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(onProgress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2000));
    expect(onProgress).toHaveBeenCalledOnce();
    expect((onProgress.mock.calls[0] as unknown as [unknown, { step: number }])[1].step).toBe(2);
  });
});
