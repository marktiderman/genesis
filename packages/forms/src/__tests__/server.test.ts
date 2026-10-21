import { describe, expect, it } from "vitest";
import { createForm } from "../index";
import { validateSubmission } from "../server";
import { afterClass } from "./fixtures";

const def = afterClass.definition;

describe("validateSubmission", () => {
  it("never trusts client values for server inputs", () => {
    const result = validateSubmission(
      def,
      { answers: { overall: 1 }, hidden: { coach: "someone-else", utm: "poster" } },
      { context: { coach: "Sam", class: "06:00" } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.submission.context).toEqual({ coach: "Sam", class: "06:00" });
    expect(result.submission.hidden).toEqual({ utm: "poster" });
    expect(result.submission.ignored).toContain("hidden.coach");
  });

  it("drops answers to fields hidden by logic and unknown fields", () => {
    const result = validateSubmission(def, {
      answers: { overall: 2, went_well: ["coaching"], name: "Ada", hacked: "x" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.submission.answers).toEqual({ overall: 2 });
    expect(result.submission.ignored).toContain("hacked");
    expect(result.submission.ending).toBe("default");
  });

  it("rejects an incomplete submission and accepts it as a draft", () => {
    expect(validateSubmission(def, { answers: {} }).ok).toBe(false);
    const draft = validateSubmission(def, { answers: { overall: 4 } }, { complete: false });
    expect(draft.ok && draft.submission.status).toBe("draft");
    const badDraft = validateSubmission(def, { answers: { overall: 99 } }, { complete: false });
    expect(badDraft.ok).toBe(false);
  });

  it("replays an event log instead of trusting answers", () => {
    const form = createForm(def, { clock: () => undefined });
    form.setValue("overall", 5);
    form.setValue("contact_me", false);
    const result = validateSubmission(def, { events: form.getState().events, answers: { overall: 1 } });
    expect(result.ok && result.submission.answers).toEqual({ overall: 5, contact_me: false });
  });

  it("re-validates answers sent after the submit event", () => {
    const events = [
      { type: "answer" as const, field: "overall", value: 5 },
      { type: "answer" as const, field: "contact_me", value: false },
      { type: "submit" as const },
      { type: "answer" as const, field: "overall", value: 99 },
    ];
    const result = validateSubmission(def, { events });
    expect(result.ok).toBe(false);
  });

  it("does not treat unknown event types as a submit", () => {
    const events = [{ type: "answer" as const, field: "overall", value: 5 }, { type: "anything" } as never];
    const result = validateSubmission(def, { events }, { complete: false });
    expect(result.ok && result.submission.status).toBe("draft");
  });
});
