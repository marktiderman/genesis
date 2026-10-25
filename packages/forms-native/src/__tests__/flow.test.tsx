// @feat:forms-native
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessibilityInfo } from "react-native";
import { defineForm, f, registerContentType, type FormDefinition } from "@marktiderman/genesis-forms";
import { ADVANCE_DELAY_MS } from "@marktiderman/genesis-forms-react";
import { announcements, focused } from "../../test-utils/rn-mock";
import { act, back, byTestId, flush, next, press, question, queryTestId, renderForm, screen, type } from "./helpers";

beforeEach(() => {
  announcements.length = 0;
  focused.length = 0;
});
afterEach(() => vi.useRealTimers());

const checkIn = defineForm({
  id: "check-in",
  title: "Weekly check-in",
  description: "Two minutes, {{field:name|friend}}.",
  layout: { mode: "focus" },
  blocks: [
    f.heading("welcome", "Welcome back"),
    f.shortText("name", { label: "Your name", required: true }),
    f.yesNo("trained", { label: "Did you train this week?" }),
    f.rating("energy", { label: "Energy, {{field:name}}?", required: true }),
  ],
  endings: [{ id: "done", title: "Thanks, {{field:name}}", description: "See you next week." }],
}).definition;

describe("steps", () => {
  it("shows a content block as a step of its own, then each question, with progress", () => {
    const { engine } = renderForm(checkIn, { autoAdvance: false });
    screen.getByText("Welcome back");
    expect(byTestId("form-progress").getAttribute("aria-valuetext")).toBe("Question 1 of 4");
    // The introduction and the required note show above the first step.
    screen.getByText("Two minutes, friend.");
    screen.getByText("Required");
    next();
    expect(engine.getState().current).toBe(engine.idOf("name"));
    expect(byTestId("form-progress").getAttribute("aria-valuetext")).toBe("Question 2 of 4");
  });

  it("refuses Next on an unanswered required question, announces why and shows it", () => {
    const { engine } = renderForm(checkIn, { autoAdvance: false });
    next();
    next();
    expect(engine.getState().current).toBe(engine.idOf("name"));
    screen.getByText("This question needs an answer.");
    expect(announcements).toContain("This question needs an answer.");
    expect(byTestId("form-name").getAttribute("aria-describedby")).toBe("Error: This question needs an answer.");
  });

  it("moves back and forward, keeping answers, and recalls them in later labels", () => {
    const { engine } = renderForm(checkIn, { autoAdvance: false });
    next();
    type("form-name", "Ada");
    next();
    expect(engine.getState().current).toBe(engine.idOf("trained"));
    back();
    expect((byTestId("form-name") as HTMLInputElement).value).toBe("Ada");
    next();
    next();
    expect(question()).toContain("Energy, Ada?, required");
  });

  it("the return key on a one-line answer is Next", () => {
    const { engine } = renderForm(checkIn, { autoAdvance: false });
    next();
    type("form-name", "Ada");
    act(() => {
      byTestId("form-name").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(engine.getState().current).toBe(engine.idOf("trained"));
  });

  it("sends from the last step and shows the ending, with recall", async () => {
    const onSubmit = vi.fn(async () => {});
    const { engine } = renderForm(checkIn, { autoAdvance: false, onSubmit });
    next();
    type("form-name", "Ada");
    next();
    next();
    expect(byTestId("form-next").textContent).toBe("Send");
    press("form-energy-option-4");
    next();
    await flush();
    expect(onSubmit).toHaveBeenCalledWith(engine);
    screen.getByText("Thanks, Ada");
    screen.getByText("See you next week.");
  });

  it("keeps the answers and offers Try again when sending fails", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    renderForm(checkIn, { autoAdvance: false, onSubmit });
    next();
    type("form-name", "Ada");
    next();
    next();
    press("form-energy-option-4");
    next();
    await flush();
    screen.getByText(/We couldn't send your answers/);
    expect(byTestId("form-next").textContent).toBe("Try again");
    next();
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(2);
    screen.getByText("Thanks, Ada");
  });
});

describe("auto-advance", () => {
  it("moves on shortly after a single pick, never from the last question", () => {
    vi.useFakeTimers();
    const { engine } = renderForm(checkIn);
    next();
    type("form-name", "Ada");
    next();
    press("form-trained-option-yes");
    expect(engine.getState().current).toBe(engine.idOf("trained"));
    act(() => vi.advanceTimersByTime(ADVANCE_DELAY_MS));
    expect(engine.getState().current).toBe(engine.idOf("energy"));
    press("form-energy-option-5");
    act(() => vi.advanceTimersByTime(ADVANCE_DELAY_MS * 4));
    expect(engine.getState().status).not.toBe("completed");
  });

  it("is off with autoAdvance false", () => {
    vi.useFakeTimers();
    const { engine } = renderForm(checkIn, { autoAdvance: false });
    next();
    type("form-name", "Ada");
    next();
    press("form-trained-option-yes");
    act(() => vi.advanceTimersByTime(ADVANCE_DELAY_MS * 4));
    expect(engine.getState().current).toBe(engine.idOf("trained"));
  });
});

describe("error summary", () => {
  const coaches = [
    { value: "ada", label: "Ada", attributes: { gym: "riverside" } },
    { value: "alan", label: "Alan", attributes: { gym: "hilltop" } },
  ];
  const def = defineForm({
    id: "summary",
    title: "Summary",
    layout: { mode: "focus" },
    blocks: [
      f.singleChoice("gym", { label: "Gym", options: [{ value: "riverside" }, { value: "hilltop" }] }),
      f.singleChoice("coach", { label: "Coach", required: true, optionsFrom: { source: "host", key: "coaches", filter: { attribute: "gym", field: "gym" } } }),
      f.shortText("name", { label: "Name", required: true }),
      f.shortText("notes", { label: "Notes" }),
    ],
  }).definition;

  it("lists the answers a send found wanting, and each link goes back to its question", () => {
    vi.useFakeTimers();
    const { engine } = renderForm(def, { autoAdvance: false }, { hostOptions: { coaches } });
    press("form-gym-option-riverside");
    next();
    press("form-coach-option-ada");
    next();
    type("form-name", "Ada");
    next();
    // Answers change from outside (a host's own control): the coach no longer fits and is
    // cleared, and the name is emptied.
    act(() => {
      engine.setValue(engine.idOf("gym"), "hilltop");
      engine.setValue(engine.idOf("name"), "");
    });
    next();
    expect(engine.getState().status).not.toBe("completed");
    // The send moved to the first; the summary lists both.
    expect(engine.getState().current).toBe(engine.idOf("coach"));
    const summary = byTestId("form-error-summary");
    expect(summary.textContent).toContain("2 answers need attention.");
    expect(summary.textContent).toContain("Name: This question needs an answer.");
    expect(announcements).toContain("2 answers need attention.");
    act(() => vi.advanceTimersByTime(200));
    expect((focused[focused.length - 1] as HTMLElement).textContent).toBe("2 answers need attention.");
    press(`form-error-${engine.idOf("name")}`);
    expect(engine.getState().current).toBe(engine.idOf("name"));
    type("form-name", "Ada");
    // One left, off screen: still listed.
    expect(byTestId("form-error-summary").textContent).toContain("One answer needs attention.");
    press(`form-error-${engine.idOf("coach")}`);
    expect(engine.getState().current).toBe(engine.idOf("coach"));
    press("form-coach-option-alan");
    expect(queryTestId("form-error-summary")).toBeNull();
  });

  it("isn't shown for a step's own error left behind by Back", () => {
    const { engine } = renderForm(def, { autoAdvance: false }, { hostOptions: { coaches } });
    press("form-gym-option-riverside");
    next();
    next();
    expect(engine.getState().errors[engine.idOf("coach")]).toBeDefined();
    back();
    expect(queryTestId("form-error-summary")).toBeNull();
  });
});

describe("accessibility", () => {
  it("moves the keyboard to a text answer and VoiceOver to a question's text on each new step", () => {
    vi.useFakeTimers();
    const { engine } = renderForm(checkIn, { autoAdvance: false });
    next();
    expect(document.activeElement).toBe(byTestId("form-name"));
    type("form-name", "Ada");
    next();
    expect(engine.getState().current).toBe(engine.idOf("trained"));
    act(() => vi.advanceTimersByTime(200));
    const last = focused[focused.length - 1] as HTMLElement;
    expect(last.textContent).toContain("Did you train this week?");
    expect(last.getAttribute("role")).toBe("header");
  });

  it("names a group by its question and gives each option its state", () => {
    renderForm(checkIn, { autoAdvance: false });
    next();
    type("form-name", "Ada");
    next();
    const yes = byTestId("form-trained-option-yes");
    expect(yes.getAttribute("role")).toBe("radio");
    expect(yes.getAttribute("aria-checked")).toBe("false");
    expect(yes.getAttribute("aria-describedby")).toBe("1 of 2");
    expect(screen.getByRole("radiogroup").getAttribute("aria-label")).toBe("Did you train this week?");
  });

  it("puts VoiceOver on the ending's title", async () => {
    vi.useFakeTimers();
    renderForm(checkIn, { autoAdvance: false });
    next();
    type("form-name", "Ada");
    next();
    next();
    press("form-energy-option-4");
    next();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    screen.getByText("Thanks, Ada");
    act(() => vi.advanceTimersByTime(300));
    const last = focused[focused.length - 1] as HTMLElement;
    expect(last.textContent).toBe("Thanks, Ada");
  });

  it("skips the step's motion when Reduce Motion is on", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    renderForm(checkIn, { autoAdvance: false });
    await flush();
    const style = JSON.parse(byTestId("form-step").getAttribute("data-style") ?? "[]") as unknown[];
    expect(style.filter(Boolean).some((s) => typeof s === "object" && s !== null && "opacity" in s)).toBe(false);
  });
});

describe("prefill and the respondent's path", () => {
  const def = defineForm({
    id: "prefill",
    title: "Prefill",
    layout: { mode: "focus" },
    blocks: [
      f.singleChoice("gym", { label: "Gym", options: [{ value: "riverside" }, { value: "hilltop" }], prefill: { param: "gym", hideWhenPrefilled: true } }),
      f.shortText("name", { label: "Name" }),
      f.shortText("goal", { label: "Goal" }),
    ],
  }).definition;

  it("skips a question the link answered and leaves it out of the count", () => {
    const { engine } = renderForm(def, {}, { linkParams: { gym: "hilltop" } });
    expect(engine.getState().values[engine.idOf("gym")]).toBe("hilltop");
    expect(queryTestId("form-gym-option-hilltop")).toBeNull();
    expect(byTestId("form-progress").getAttribute("aria-valuetext")).toBe("Question 1 of 2");
  });
});

describe("content kinds", () => {
  it("draws a registered callout as a step, and a kind it doesn't know as its text", () => {
    registerContentType({ type: "callout", label: "Callout" });
    registerContentType({ type: "riverside/quote", label: "Quote" });
    const def: FormDefinition = {
      schemaVersion: 1,
      id: "content",
      title: "Content",
      layout: { mode: "focus" },
      blocks: [
        { kind: "content", id: "tip", type: "callout", text: "Drink water.", props: { title: "Tip", tone: "success" } },
        { kind: "content", id: "q", type: "riverside/quote", text: "Small steps." },
        { kind: "field", id: "f1", key: "x", type: "short-text", label: "X" },
      ],
    };
    renderForm(def);
    expect(byTestId("form-tip").getAttribute("aria-label")).toBe("Tip. Drink water.");
    next();
    screen.getByText("Small steps.");
  });
});

describe("the platform header", () => {
  it("is configured through the layout: the title goes to the screen's options", () => {
    const Screen = vi.fn((_: { options: Record<string, unknown> }) => null);
    renderForm(checkIn, { screen: Screen, headerOptions: { headerBackTitle: "Home" } });
    expect(Screen.mock.calls[0]![0].options).toEqual({ title: "Weekly check-in", headerBackTitle: "Home" });
    // The title isn't drawn twice.
    expect(screen.queryByText("Weekly check-in")).toBeNull();
  });
});
