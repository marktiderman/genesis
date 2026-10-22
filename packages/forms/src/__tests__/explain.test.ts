import { describe, expect, it } from "vitest";
import { createForm, explain, replay } from "../index";
import { validateSubmission } from "../server";
import { eventFeedback, monthlyCheckIn } from "./sample-forms";

describe("explain", () => {
  it("says why a field is hidden by a rule", () => {
    const engine = createForm(eventFeedback.definition);
    engine.setValue("overall", 5);
    const why = explain(engine, "name");
    expect(why).toMatchObject({ blockId: "name", key: "name", onPath: false, ruleVisible: false, visible: false });
    expect(why.rules).toEqual([
      { ruleId: "r1", effect: "hide", matched: true, sentence: "Hidden because contact_me is not Yes." },
    ]);
    expect(why.summary).toBe("Hidden because contact_me is not Yes.");
    expect(why.validation).toEqual({ status: "not-checked" });
    expect(why.skippedBy).toBeUndefined();
  });

  it("names the jump that skipped a block", () => {
    const why = explain({ definition: eventFeedback.definition, values: { overall: 2 } }, "went_well");
    expect(why.onPath).toBe(false);
    expect(why.ruleVisible).toBe(true);
    expect(why.skippedBy).toEqual({
      ruleId: "r3",
      from: "overall",
      to: "improve",
      sentence: "Skipped: overall jumps to improve because overall is less than 4.",
    });
    expect(why.summary).toBe(why.skippedBy?.sentence);
  });

  it("explains a jump to an ending", () => {
    const why = explain({ definition: monthlyCheckIn.definition, values: { recommend: 10 } }, "frequency");
    expect(why.skippedBy?.to).toEqual({ ending: "promoter" });
    expect(why.summary).toMatch(/jumps to the "promoter" ending because recommend is at least 9/);
  });

  it("reports validation for visible fields, and accepts a key", () => {
    const values = { overall: 5, contact_me: true, email: "ada@" };
    expect(explain({ definition: eventFeedback.definition, values }, "email")).toMatchObject({
      visible: true,
      rules: [{ matched: false, sentence: "Would be hidden if contact_me is not Yes." }],
      validation: { status: "invalid", message: expect.stringMatching(/email address/) },
    });
    expect(explain({ definition: eventFeedback.definition, values }, "name").validation).toEqual({
      status: "invalid",
      message: "This question needs an answer.",
    });
    expect(explain({ definition: eventFeedback.definition, values }, "overall").validation).toEqual({ status: "valid" });
    expect(explain({ definition: eventFeedback.definition, values }, "improve").validation).toEqual({ status: "unanswered" });
    expect(() => explain({ definition: eventFeedback.definition, values }, "nope")).toThrow(/no block/);
  });
});

describe("a completed response is final", () => {
  it("ignores edits after submit, so a tampered log cannot store unchecked answers", () => {
    const engine = createForm(eventFeedback.definition, { clock: () => undefined });
    engine.setValue("overall", 1);
    expect(engine.submit()).toBe(true);
    engine.setValue("overall", 3.5);
    engine.back();
    expect(engine.submit()).toBe(false);
    expect(engine.getState().values.overall).toBe(1);

    const events = [...engine.getState().events, { type: "answer" as const, field: "overall", value: 99 }];
    const result = validateSubmission(eventFeedback.definition, { events });
    expect(result.ok && result.submission.answers.overall).toBe(1);
  });

  it("logs failed next and submit attempts, so replay shows the same errors", () => {
    const engine = createForm(eventFeedback.definition, { clock: () => undefined });
    expect(engine.next()).toBe(false);
    expect(engine.getState().events).toEqual([{ type: "next" }]);
    expect(replay(eventFeedback.definition, engine.getState().events).getState().errors).toEqual(engine.getState().errors);
  });
});
