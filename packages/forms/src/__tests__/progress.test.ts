// @feat:forms-engine
import { describe, expect, it } from "vitest";
import { createForm, formProgress, furthestReached, parseForm, type FormDefinition } from "../index";

const form = (settings?: FormDefinition["settings"]): FormDefinition => ({
  schemaVersion: 1,
  id: "progress",
  title: "Progress",
  layout: { mode: "focus" },
  blocks: [
    { kind: "field", id: "q1", key: "overall", type: "rating", label: "How was it?" },
    { kind: "content", id: "c1", type: "text", text: "A few more." },
    { kind: "field", id: "q2", key: "went_well", type: "short-text", label: "What went well?" },
    { kind: "field", id: "q3", key: "name", type: "short-text", label: "Your name" },
  ],
  ...(settings ? { settings } : {}),
});

describe("settings.saveProgress", () => {
  it("parses as a boolean and refuses anything else", () => {
    expect(parseForm(form({ saveProgress: true })).ok).toBe(true);
    const bad = parseForm({ ...form(), settings: { saveProgress: "yes" } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.map((i) => i.path)).toContain("settings.saveProgress");
  });
});

describe("formProgress", () => {
  it("starts on the first question", () => {
    const engine = createForm(form({ saveProgress: true }));
    expect(formProgress(engine)).toEqual({ step: 1, total: 4, fieldId: "q1" });
  });

  it("moves with each Next, and a content block counts the question before it", () => {
    const engine = createForm(form());
    engine.setValue("q1", 4);
    engine.next();
    expect(formProgress(engine)).toEqual({ step: 2, total: 4, fieldId: "q1" });
    engine.next();
    expect(formProgress(engine)).toEqual({ step: 3, total: 4, fieldId: "q2" });
  });

  it("keeps the furthest question after going back", () => {
    const engine = createForm(form());
    engine.setValue("q1", 4);
    engine.next();
    engine.next();
    engine.back();
    engine.back();
    expect(engine.getState().current).toBe("q1");
    expect(formProgress(engine).fieldId).toBe("q2");
  });

  it("counts the last answered question when every question shows at once", () => {
    const engine = createForm({ ...form(), layout: { mode: "classic" } });
    engine.setValue("q2", "The coach");
    expect(furthestReached(engine.getState(), engine.definition)).toBe("q2");
    expect(formProgress(engine).fieldId).toBe("q2");
    // A blank answer is no answer.
    engine.setValue("q3", "  ");
    expect(formProgress(engine).fieldId).toBe("q2");
  });

  it("resumes at a saved question with the saved answers, and Back walks the path", () => {
    const engine = createForm(form({ saveProgress: true }), {
      initialValues: { q1: 4, q2: "The coach" },
      resumeAt: "q3",
    });
    expect(engine.getState().current).toBe("q3");
    expect(formProgress(engine)).toEqual({ step: 4, total: 4, fieldId: "q3" });
    expect(engine.answers()).toEqual({ q1: 4, q2: "The coach" });
    engine.back();
    expect(engine.getState().current).toBe("q2");
    expect(formProgress(engine).fieldId).toBe("q3");
  });

  it("stops resuming at a step that no longer passes, without showing its error", () => {
    const def = form();
    (def.blocks[0] as { required?: boolean }).required = true;
    const engine = createForm(def, { resumeAt: "q3" });
    expect(engine.getState().current).toBe("q1");
    expect(engine.getState().errors).toEqual({});
  });

  it("ignores a resume point that isn't on the path", () => {
    const engine = createForm(form(), { initialValues: { q1: 2 }, resumeAt: "gone" });
    expect(engine.getState().current).toBe("q1");
    expect(engine.getState().history).toEqual([]);
  });

  it("says nothing on an empty path", () => {
    const engine = createForm({ ...form(), blocks: [] });
    expect(formProgress(engine)).toEqual({ step: 0, total: 0, fieldId: null });
  });
});
