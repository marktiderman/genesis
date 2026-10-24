// @feat:forms-react
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { createForm, defineForm, f, when, type FormEngine } from "@marktiderman/genesis-forms";
import { useFormController, type FocusTarget, type FormController, type FormControllerOptions } from "../index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const survey = defineForm({
  id: "survey",
  title: "Survey",
  description: "Hi {{field:name|there}}",
  layout: { mode: "focus" },
  blocks: [
    f.shortText("name", { label: "Name", required: true }),
    f.yesNo("member", { label: "Member?" }),
    f.shortText("since", { label: "Since when, {{field:name}}?" }),
    f.longText("notes", { label: "Notes" }),
  ],
  logic: [when("member").isNot(true).hide("since")],
  endings: [{ id: "default", title: "Done" }],
  settings: { saveProgress: true },
});

/** Renders nothing; hands back the latest controller and counts renders. */
function harness(engine: FormEngine, options: FormControllerOptions = {}, strict = false) {
  const seen: { controller: FormController; renders: number } = { controller: null as never, renders: 0 };
  function Probe({ e, o }: { e: FormEngine; o: FormControllerOptions }) {
    seen.controller = useFormController(e, o);
    seen.renders++;
    return null;
  }
  const tree = (e: FormEngine, o: FormControllerOptions) => (strict ? <StrictMode><Probe e={e} o={o} /></StrictMode> : <Probe e={e} o={o} />);
  const view = render(tree(engine, options));
  return { seen, rerender: (e: FormEngine, o: FormControllerOptions = options) => view.rerender(tree(e, o)) };
}

describe("useFormController", () => {
  it("reports the step, the path and what the controls do", () => {
    const engine = createForm(survey.definition);
    const { seen } = harness(engine);
    const c = seen.controller;
    expect(c.layout).toBe("focus");
    expect(c.path).toEqual([engine.idOf("name"), engine.idOf("member"), engine.idOf("notes")]);
    expect([c.step, c.total, c.isLast, c.canGoBack, c.phase, c.showEnding]).toEqual([1, 3, false, false, "idle", false]);
    expect(c.description).toBe("Hi there");
    expect(typeof c.onAdvance).toBe("function");
  });

  it("announces a failed step, then moves on and back", () => {
    const engine = createForm(survey.definition);
    const { seen } = harness(engine);
    act(() => seen.controller.advance());
    expect(seen.controller.announcement).toBe("This question needs an answer.");
    act(() => seen.controller.advance());
    // The same message again is announced again (a trailing space).
    expect(seen.controller.announcement).toBe("This question needs an answer. ");
    act(() => engine.setValue(engine.idOf("name"), "Ada"));
    expect(seen.controller.description).toBe("Hi Ada");
    act(() => seen.controller.advance());
    expect([seen.controller.step, seen.controller.direction, seen.controller.canGoBack]).toEqual([2, "forward", true]);
    act(() => seen.controller.back());
    expect([seen.controller.step, seen.controller.direction]).toEqual([1, "back"]);
  });

  it("follows the path as answers change it", () => {
    const engine = createForm(survey.definition);
    const { seen } = harness(engine);
    act(() => engine.setValue(engine.idOf("member"), true));
    expect(seen.controller.total).toBe(4);
  });

  it("asks for focus on each new step, the ending and after a failed send, never on first render", async () => {
    const targets: FocusTarget[] = [];
    const engine = createForm(survey.definition);
    let reject = true;
    const { seen } = harness(engine, {
      focus: (t) => targets.push(t),
      onSubmit: async () => {
        if (reject) throw new Error("offline");
      },
    }, true);
    expect(targets).toEqual([]);
    act(() => engine.setValue(engine.idOf("name"), "Ada"));
    act(() => seen.controller.advance());
    expect(targets).toEqual([{ kind: "step", id: engine.idOf("member") }]);
    act(() => seen.controller.advance());
    await act(async () => seen.controller.advance());
    expect(seen.controller.phase).toBe("failed");
    expect(seen.controller.locked).toBe(true);
    expect(targets.at(-1)).toEqual({ kind: "submit" });
    reject = false;
    await act(async () => seen.controller.submit());
    expect(seen.controller.phase).toBe("sent");
    expect(seen.controller.showEnding).toBe(true);
    expect(seen.controller.ending?.title).toBe("Done");
    expect(targets.at(-1)).toEqual({ kind: "ending" });
  });

  it("asks for the error summary after a failed classic submit", () => {
    const targets: FocusTarget[] = [];
    const engine = createForm(survey.definition);
    const { seen } = harness(engine, { layout: "classic", focus: (t) => targets.push(t) });
    expect(seen.controller.isLast).toBe(true);
    expect(seen.controller.onAdvance).toBeUndefined();
    act(() => seen.controller.submit());
    expect(targets).toEqual([{ kind: "errorSummary" }]);
    expect(seen.controller.errorList).toEqual([{ id: engine.idOf("name"), label: "Name", message: "This question needs an answer." }]);
  });

  it("auto-advances after a pick, but not from the last question, and a new step cancels it", () => {
    vi.useFakeTimers();
    const engine = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Ada" } });
    const { seen } = harness(engine);
    act(() => seen.controller.advance());
    act(() => seen.controller.onAdvance!());
    act(() => vi.advanceTimersByTime(250));
    expect(seen.controller.current).toBe(engine.idOf("notes"));
    act(() => seen.controller.onAdvance!());
    act(() => vi.advanceTimersByTime(250));
    expect(seen.controller.status).toBe("in_progress");
    act(() => seen.controller.back());
    act(() => seen.controller.onAdvance!());
    act(() => seen.controller.back());
    act(() => vi.advanceTimersByTime(250));
    expect(seen.controller.current).toBe(engine.idOf("name"));
  });

  it("waits while the host says so", () => {
    let waiting: string | null = "A photo is still uploading.";
    const engine = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Ada" } });
    const { seen } = harness(engine, { waitFor: () => waiting });
    act(() => seen.controller.advance());
    expect([seen.controller.step, seen.controller.announcement]).toEqual([1, "A photo is still uploading."]);
    waiting = null;
    act(() => seen.controller.advance());
    expect(seen.controller.step).toBe(2);
  });

  it("calls the latest onSubmit and onChange, not the first render's", async () => {
    const engine = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Ada" } });
    const first = vi.fn();
    const second = vi.fn();
    const changes: string[] = [];
    const { seen, rerender } = harness(engine, { layout: "classic", onSubmit: first, onChange: () => changes.push("first") });
    const submit = seen.controller.submit;
    rerender(engine, { layout: "classic", onSubmit: second, onChange: () => changes.push("second") });
    // The action from the first render is the same function, and acts with today's options.
    expect(seen.controller.submit).toBe(submit);
    act(() => engine.setValue(engine.idOf("notes"), "x"));
    await act(async () => submit());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(engine);
    expect(changes.every((c) => c === "second")).toBe(true);
  });

  it("starts over with a new engine, and ignores the old engine's late send", async () => {
    const one = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Ada" } });
    const two = createForm(survey.definition);
    let resolve!: () => void;
    const { seen, rerender } = harness(one, { layout: "classic", onSubmit: () => new Promise<void>((r) => (resolve = r)) });
    act(() => seen.controller.submit());
    expect(seen.controller.phase).toBe("sending");
    rerender(two);
    expect([seen.controller.engine, seen.controller.phase]).toEqual([two, "idle"]);
    await act(async () => resolve());
    expect(seen.controller.phase).toBe("idle");
  });

  it("sends a new engine's answers while an earlier engine's send is still on its way", async () => {
    const one = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Ada" } });
    const two = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Sam" } });
    const sent: FormEngine[] = [];
    let resolveFirst!: () => void;
    const onSubmit = (e: FormEngine) => {
      sent.push(e);
      return e === one ? new Promise<void>((r) => (resolveFirst = r)) : Promise.resolve();
    };
    const { seen, rerender } = harness(one, { layout: "classic", onSubmit });
    act(() => seen.controller.submit());
    rerender(two);
    await act(async () => seen.controller.submit());
    expect(sent).toEqual([one, two]);
    expect(seen.controller.phase).toBe("sent");
    await act(async () => resolveFirst());
    expect([seen.controller.engine, seen.controller.phase]).toEqual([two, "sent"]);
  });

  it("treats a new engine like a fresh mount: no focus on its first question", () => {
    const targets: FocusTarget[] = [];
    const one = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Ada" } });
    const { seen, rerender } = harness(one, { focus: (t) => targets.push(t) });
    act(() => seen.controller.advance());
    act(() => seen.controller.back());
    expect(seen.controller.direction).toBe("back");
    targets.length = 0;
    // A new engine on its second question, so `current` changes with the swap.
    const two = createForm(survey.definition, {
      initialValues: { [survey.definition.blocks[0]!.id]: "Sam" },
      resumeAt: survey.definition.blocks[1]!.id,
    });
    rerender(two, { focus: (t) => targets.push(t) });
    expect(seen.controller.current).toBe(two.idOf("member"));
    expect(targets).toEqual([]);
    expect(seen.controller.direction).toBe("forward");
  });

  it("saves progress after a step, and flushes a pending save at once", () => {
    vi.useFakeTimers();
    const onProgress = vi.fn();
    const engine = createForm(survey.definition, { initialValues: { [survey.definition.blocks[0]!.id]: "Ada" } });
    const { seen } = harness(engine, { onProgress });
    expect(seen.controller.saveProgress).toBe(true);
    act(() => seen.controller.advance());
    expect(onProgress).not.toHaveBeenCalled();
    act(() => seen.controller.flushProgress());
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0]![1]).toMatchObject({ step: 2 });
    act(() => vi.advanceTimersByTime(1000));
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it("doesn't re-render for a change it doesn't show", () => {
    const engine = createForm(survey.definition);
    const { seen } = harness(engine);
    const before = seen.renders;
    // Typing changes the value, not the step, path, errors or recalled introduction.
    act(() => engine.setValue(engine.idOf("notes"), "a"));
    act(() => engine.setValue(engine.idOf("notes"), "ab"));
    expect(seen.renders).toBe(before);
  });
});
