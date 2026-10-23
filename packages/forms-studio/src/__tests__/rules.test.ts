// @feat:forms-studio
import { describe, expect, it } from "vitest";
import { comparisonFilter, headlineNumbers } from "../headline";
import { followUpOf, needsFollowUp } from "../followups";
import { dayLabel } from "../generic/days";
import { filterResponses, NO_FILTERS } from "../summary";
import { formCounts, formNavItems, formStatusChip } from "../status";
import { readinessChip, readinessOf } from "../generic/status";
import { answer, checkIn } from "./fixtures";

const skip = new Set(["name"]);

describe("headlineNumbers", () => {
  const now = [
    answer("2026-10-23", { wod: 5, photo: true }),
    answer("2026-10-23", { wod: 2, photo: true, wrong: "Rower was broken again" }),
    answer("2026-10-22", { wod: 4, photo: false }),
  ];
  const before = [answer("2026-10-16", { wod: 5 }), answer("2026-10-15", { wod: 4 })];

  it("counts responses and the change against the period before", () => {
    const h = headlineNumbers(now, [checkIn], { previous: before, skip });
    expect(h.responses).toEqual({ count: 3, previous: 2, change: 1 });
  });

  it("averages the first rating question, and how it moved", () => {
    const h = headlineNumbers(now, [checkIn], { previous: before, skip });
    expect(h.rating).toMatchObject({ key: "wod", max: 5, previousAverage: 4.5, change: -0.8 });
    expect(h.rating?.average).toBeCloseTo(3.667, 2);
  });

  it("counts low ratings and the consent rate", () => {
    const h = headlineNumbers(now, [checkIn], { skip });
    expect(h.low).toEqual({ count: 1 });
    expect(h.rate).toMatchObject({ key: "photo", type: "consent", yes: 2, count: 3, percent: 67 });
  });

  it("leaves out what the form doesn't ask, and changes without a period", () => {
    const plain = { ...checkIn, blocks: checkIn.blocks.filter((b) => b.kind === "field" && b.key === "wrong") };
    const h = headlineNumbers([answer("2026-10-23", { wrong: "x" })], [plain]);
    expect(h).toMatchObject({ rating: null, low: null, rate: null, responses: { previous: null, change: null } });
  });
});

describe("comparisonFilter", () => {
  const today = "2026-10-23"; // a Friday
  it("compares this week with the same days last week", () => {
    expect(comparisonFilter({ ...NO_FILTERS, when: "week" }, today)).toMatchObject({
      filter: { from: "2026-10-12", to: "2026-10-16" },
      label: "last week",
    });
  });
  it("compares today with yesterday, and the last 7 days with the 7 before", () => {
    expect(comparisonFilter({ ...NO_FILTERS, when: "today" }, today)?.filter).toMatchObject({
      from: "2026-10-22",
      to: "2026-10-22",
    });
    expect(comparisonFilter({ ...NO_FILTERS, when: "7d" }, today)?.filter).toMatchObject({
      from: "2026-10-10",
      to: "2026-10-16",
    });
  });
  it("compares this month with last month up to the same day, clamped", () => {
    expect(comparisonFilter({ ...NO_FILTERS, when: "month" }, today)?.filter).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-23",
    });
    expect(comparisonFilter({ ...NO_FILTERS, when: "month" }, "2026-03-31")?.filter).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });
  it("keeps the other filters, and has nothing for all time or an open range", () => {
    const value = { ...NO_FILTERS, when: "week" as const, match: { class: "6:00 WOD" }, low: true };
    expect(comparisonFilter(value, today)?.filter).toMatchObject({ match: { class: "6:00 WOD" }, low: true });
    expect(comparisonFilter(NO_FILTERS, today)).toBeNull();
    expect(comparisonFilter({ ...NO_FILTERS, when: "custom", from: "2026-10-01" }, today)).toBeNull();
  });
  it("finds the previous items with filterResponses", () => {
    const items = [answer("2026-10-14", { wod: 3 }), answer("2026-10-21", { wod: 3 })];
    const c = comparisonFilter({ ...NO_FILTERS, when: "week" }, today)!;
    expect(filterResponses(items, c.filter).map((i) => i.date)).toEqual(["2026-10-14"]);
  });
});

describe("needsFollowUp", () => {
  const low = answer("2026-10-22", { wod: 2, wrong: "  Too crowded  ", name: "Ann" });
  const lower = answer("2026-10-23", { wod: 1 });
  const fine = answer("2026-10-23", { wod: 4, wrong: "Great" });

  it("lists low-rated responses newest first, with the score and comment", () => {
    const list = needsFollowUp([low, fine, lower], { skip });
    expect(list.map((f) => f.item.id)).toEqual([lower.id, low.id]);
    expect(list[1]).toMatchObject({ rating: { value: 2, max: 5, type: "rating" }, comment: "Too crowded" });
    expect(list[0]?.comment).toBeNull();
  });

  it("leaves handled ones out", () => {
    expect(needsFollowUp([low, lower], { isHandled: (i) => i.id === lower.id }).map((f) => f.item.id)).toEqual([
      low.id,
    ]);
  });

  it("doesn't take a skipped key as the comment", () => {
    const named = answer("2026-10-22", { wod: 1, name: "Ann" });
    expect(followUpOf(named, skip)?.comment).toBeNull();
    expect(followUpOf(fine)).toBeNull();
  });
});

describe("dayLabel", () => {
  it("says Today, Yesterday, a short date, and the year when it differs", () => {
    expect(dayLabel("2026-10-23", "2026-10-23")).toBe("Today");
    expect(dayLabel("2026-10-22", "2026-10-23")).toBe("Yesterday");
    expect(dayLabel("2026-10-21", "2026-10-23")).toBe("Oct 21");
    expect(dayLabel("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025");
    expect(dayLabel("nope")).toBe("nope");
  });
});

describe("status words", () => {
  it("names a form's status", () => {
    expect(formStatusChip("live", 1)).toEqual({ label: "Live · version 1", tone: "success" });
    expect(formStatusChip("draft")).toEqual({ label: "Draft", tone: "muted" });
    expect(formStatusChip("paused", 3).label).toBe("Paused · version 3");
  });

  it("reads readiness from a builder's findings", () => {
    expect(readinessOf([])).toEqual({ state: "ready", count: 0 });
    expect(readinessOf([{ level: "error", code: "no-questions" }])).toEqual({ state: "empty", count: 0 });
    const r = readinessOf([{ level: "error" }, { level: "error" }, { level: "warning" }]);
    expect(r).toEqual({ state: "problems", count: 2 });
    expect(readinessChip(r)).toEqual({ label: "2 problems to fix", tone: "danger" });
    expect(readinessChip(readinessOf([{ level: "warning" }]))).toEqual({ label: "1 to check", tone: "warning" });
    expect(readinessOf([{ level: "info" }], { pending: true }).state).toBe("pending");
    expect(readinessChip({ state: "ready", count: 0 }).label).toBe("Ready to publish");
  });

  it("declares the four places with their counts", () => {
    expect(formCounts(checkIn)).toEqual({ questions: 4, logic: 1 });
    expect(formCounts(null)).toEqual({ questions: 0, logic: 0 });
    expect(formNavItems("/forms/f1", { questions: 2, logic: 1, responses: 24 })).toEqual([
      { id: "questions", to: "/forms/f1", label: "Questions", badge: 2 },
      { id: "logic", to: "/forms/f1?tab=logic", label: "Logic and endings", badge: 1 },
      { id: "responses", to: "/forms/f1?tab=responses", label: "Responses", badge: 24 },
      { id: "settings", to: "/forms/f1?tab=settings", label: "Settings" },
    ]);
    expect(formNavItems("/f")[2]).toEqual({ id: "responses", to: "/f?tab=responses", label: "Responses" });
    expect(formNavItems((t) => `/forms/f1/${t}`)[3]?.to).toBe("/forms/f1/settings");
  });
});
