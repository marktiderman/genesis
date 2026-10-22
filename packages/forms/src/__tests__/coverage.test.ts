import { describe, expect, it } from "vitest";
import { defineForm, f, when } from "../index";
import { coverage, simulate } from "../testing";
import { eventFeedback as fixtureEventFeedback } from "./fixtures";
import { eventFeedback, monthlyCheckIn } from "./sample-forms";

describe("coverage", () => {
  it("reaches every block of the event-feedback form and its default ending", () => {
    for (const form of [eventFeedback, fixtureEventFeedback]) {
      const report = coverage(form);
      expect(report.truncated).toBe(false);
      expect(report.unreachableBlocks).toEqual([]);
      expect(report.rulesNeverFired).toEqual([]);
      expect(report.endings.default?.reached).toBe(true);
      expect(report.pathsExplored).toBeGreaterThan(10);
    }
  });

  it("reaches both monthly-check-in endings, with witnesses that replay", () => {
    const report = coverage(monthlyCheckIn);
    expect(report.endings.default?.reached).toBe(true);
    expect(report.endings.promoter?.reached).toBe(true);
    expect(report.unreachableBlocks).toEqual([]);
    for (const [ending, { witness }] of Object.entries(report.endings)) {
      expect(simulate(monthlyCheckIn).answer(witness!).submit()).toBe(ending);
    }
    expect(report.endings.promoter?.witness?.recommend).toBeGreaterThanOrEqual(9);
  });

  it("reports unreachable blocks and rules that never fire", () => {
    const broken = defineForm({
      id: "broken",
      title: "Broken",
      blocks: [
        f.rating("score", { label: "Score", max: 5, required: true }),
        f.shortText("great", { label: "What was great?" }),
        f.shortText("after", { label: "After" }),
      ],
      logic: [
        // A 5-star rating can never exceed 5: the field it reveals is unreachable.
        when("score").greaterThan(5).show("great"),
        // Every response jumps past "after" to the ending.
        when("score").isAnswered().jumpTo({ ending: "done" }),
      ],
      endings: [
        { id: "default", title: "Default" },
        { id: "done", title: "Done" },
      ],
    });
    const report = coverage(broken);
    expect(report.unreachableBlocks).toEqual(["great", "after"]);
    expect(report.rulesNeverFired).toEqual(["r1"]);
    expect(report.endings.done?.reached).toBe(true);
    expect(report.endings.default).toEqual({ reached: false });
  });

  it("uses boundary values from conditions on text and hidden inputs", () => {
    const form = defineForm({
      id: "bounds",
      title: "Bounds",
      hidden: { plan: f.hidden.string() },
      blocks: [f.shortText("code", { label: "Code" }), f.shortText("vip", { label: "VIP" })],
      logic: [
        when.condition({ all: [{ op: "eq", left: { field: "code" }, right: { value: "GOLD" } }] }).show("vip"),
        when.condition({ op: "eq", left: { hidden: "plan" }, right: { value: "pro" } }, "code").jumpTo({ ending: "pro" }),
      ],
      endings: [
        { id: "default", title: "Default" },
        { id: "pro", title: "Pro" },
      ],
    });
    const report = coverage(form);
    expect(report.unreachableBlocks).toEqual([]);
    expect(report.endings.pro).toMatchObject({ reached: true, witnessHidden: { plan: "pro" } });
    expect(coverage(form, { hidden: { plan: "free" } }).endings.pro?.reached).toBe(false);
  });

  it("stops at maxStates and says so", () => {
    const report = coverage(eventFeedback, { maxStates: 10 });
    expect(report.truncated).toBe(true);
    expect(report.pathsExplored).toBeLessThan(10);
  });
});
