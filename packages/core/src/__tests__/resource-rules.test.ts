// @feat:resource-workspace
import { describe, expect, it } from "vitest";
import { dayLabel, readinessChip, readinessOf, SAVE_STATE_LABEL } from "../resource";

describe("dayLabel", () => {
  it("says Today, Yesterday, a short date, and the year when it differs", () => {
    expect(dayLabel("2026-10-23", "2026-10-23")).toBe("Today");
    expect(dayLabel("2026-10-22", "2026-10-23")).toBe("Yesterday");
    expect(dayLabel("2026-10-21", "2026-10-23")).toBe("Oct 21");
    expect(dayLabel("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025");
    expect(dayLabel("nope")).toBe("nope");
  });
});

describe("readiness", () => {
  it("reads readiness from an editor's findings", () => {
    expect(readinessOf([])).toEqual({ state: "ready", count: 0 });
    const r = readinessOf([{ level: "error" }, { level: "error" }, { level: "warning" }]);
    expect(r).toEqual({ state: "problems", count: 2 });
    expect(readinessChip(r)).toEqual({ label: "2 problems to fix", tone: "danger" });
    expect(readinessChip(readinessOf([{ level: "warning" }]))).toEqual({ label: "1 to check", tone: "warning" });
    expect(readinessOf([{ level: "info" }], { pending: true }).state).toBe("pending");
    expect(readinessChip({ state: "ready", count: 0 }).label).toBe("Ready to publish");
  });

  it("knows no resource's empty code unless the host names one", () => {
    const findings = [{ level: "error" as const, code: "no-lessons" }];
    expect(readinessOf(findings).state).toBe("problems");
    expect(readinessOf(findings, { emptyCode: "no-lessons" })).toEqual({ state: "empty", count: 0 });
    // The empty code wins wherever it sits in the list.
    expect(readinessOf([{ level: "error" }, ...findings], { emptyCode: "no-lessons" }).state).toBe("empty");
  });

  it("says empty in neutral words, or the host's", () => {
    const empty = { state: "empty", count: 0 } as const;
    expect(readinessChip(empty)).toEqual({ label: "Nothing to publish yet", tone: "muted" });
    expect(readinessChip(empty, { empty: "Add a lesson" }).label).toBe("Add a lesson");
    expect(readinessChip({ state: "problems", count: 1 }, { problems: (n) => `${n} to fix` }).label).toBe("1 to fix");
  });

  it("reads a long list in one pass, linear in its length", () => {
    const many = Array.from({ length: 200_000 }, (_, i) => ({ level: i % 2 ? ("warning" as const) : ("info" as const) }));
    const started = performance.now();
    expect(readinessOf(many)).toEqual({ state: "warnings", count: 100_000 });
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("names every save state", () => {
    expect(SAVE_STATE_LABEL.saved).toBe("Changes saved");
    expect(Object.keys(SAVE_STATE_LABEL)).toHaveLength(6);
  });
});
