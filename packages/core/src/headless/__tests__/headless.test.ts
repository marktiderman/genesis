import { describe, expect, it } from "vitest";
import {
  canStepNumber,
  carouselIndex,
  chartDomain,
  chartSeriesColor,
  chartSummary,
  chartTokenOf,
  clampNumber,
  clampRange,
  customViewStatus,
  dropIndex,
  fieldAccept,
  fieldArrayAddLabel,
  fieldArrayLimits,
  fileAccepted,
  fileProblem,
  filterOptions,
  formatFileSize,
  formatTimeOfDay,
  formatTrend,
  groupNotificationsByDay,
  matchesQuery,
  moveItem,
  movedAnnouncement,
  niceTicks,
  notificationDayBucket,
  otpComplete,
  otpSlots,
  parseNumberInput,
  parseTimeOfDay,
  sanitizeOtp,
  snapToStep,
  statusBadgeLabel,
  STATUS_BADGE_TONES,
  stepNumber,
  stepState,
  timeSlots,
  timeToValue,
  withTimeOfDay,
  wizardProgressLabel,
  wizardStepFields,
} from "../index";

describe("numbers", () => {
  it("clamps, snaps and steps", () => {
    expect(clampNumber(5, 0, 3)).toBe(3);
    expect(clampNumber(-1, 0)).toBe(0);
    expect(snapToStep(4, 2, 1, 9)).toBe(5);
    expect(snapToStep(0.30000000000000004, 0.1, 0, 1)).toBe(0.3);
    expect(stepNumber(0.2, 1, { step: 0.1 })).toBe(0.3);
    expect(stepNumber(1, -1, { min: 1 })).toBe(1);
    expect(canStepNumber(1, -1, { min: 1 })).toBe(false);
    expect(canStepNumber(1, 1, { max: 2 })).toBe(true);
  });
  it("reads typed numbers, or null", () => {
    expect(parseNumberInput("1,5")).toBe(1.5);
    expect(parseNumberInput("-3")).toBe(-3);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("1.2.3")).toBeNull();
  });
  it("keeps a range's thumbs apart, stopping the one that moved", () => {
    expect(clampRange([60, 40], { min: 0, max: 100, moving: 0 })).toEqual([40, 40]);
    expect(clampRange([60, 40], { min: 0, max: 100, moving: 1 })).toEqual([60, 60]);
    expect(clampRange([-5, 120], { min: 0, max: 100, step: 10 })).toEqual([0, 100]);
  });
});

describe("text", () => {
  it("matches every word, ignoring case and accents", () => {
    expect(matchesQuery("Café Royal", "cafe roy")).toBe(true);
    expect(matchesQuery(["Acme", "Berlin office"], "acme berlin")).toBe(true);
    expect(matchesQuery("Acme", "west")).toBe(false);
    expect(filterOptions([{ label: "Apple" }, { label: "Pear", description: "green" }], "GREEN")).toEqual([{ label: "Pear", description: "green" }]);
  });
});

describe("reorder", () => {
  it("moves an item and says where", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(dropIndex(1, 95, 48, 4)).toBe(3);
    expect(dropIndex(1, -500, 48, 4)).toBe(0);
    expect(movedAnnouncement("Week 1", 2, 5)).toBe("Week 1 moved to position 3 of 5.");
  });
});

describe("time", () => {
  it("reads the ways people type a time", () => {
    expect(parseTimeOfDay("14:30")).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeOfDay("2:30 pm")).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeOfDay("12am")).toEqual({ hours: 0, minutes: 0 });
    expect(parseTimeOfDay("1430")).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeOfDay("25:00")).toBeNull();
    expect(parseTimeOfDay("13pm")).toBeNull();
  });
  it("writes a time", () => {
    expect(timeToValue({ hours: 9, minutes: 5 })).toBe("09:05");
    expect(formatTimeOfDay({ hours: 0, minutes: 5 }, { hour12: true })).toBe("12:05 AM");
    expect(withTimeOfDay(new Date(2026, 0, 2, 8, 0, 30), { hours: 17, minutes: 45 }).getHours()).toBe(17);
    expect(timeSlots(60)).toHaveLength(24);
  });
});

describe("charts", () => {
  it("resolves colours and tokens", () => {
    expect(chartSeriesColor({ theme: { light: "#fff", dark: "#000" } }, "dark")).toBe("#000");
    expect(chartSeriesColor({ color: "red" }, "dark")).toBe("red");
    expect(chartTokenOf("hsl(var(--chart-2))")).toBe("chart-2");
    expect(chartTokenOf("var(--chart-4)")).toBe("chart-4");
    expect(chartTokenOf("#ff0000")).toBeUndefined();
  });
  it("finds a round axis", () => {
    expect(niceTicks(0, 87, 4)).toEqual([0, 25, 50, 75, 100]);
    const d = chartDomain([{ a: 3, b: 9 }, { a: -2, b: 1 }], ["a", "b"]);
    expect(d.min).toBeLessThanOrEqual(-2);
    expect(d.max).toBeGreaterThanOrEqual(9);
    expect(chartDomain([{ a: 3, b: 9 }], ["a", "b"], { stacked: true }).max).toBeGreaterThanOrEqual(12);
  });
  it("says the chart in words", () => {
    expect(chartSummary([{ m: "Jan", v: 1 }, { m: "Feb", v: 2 }], "m", [{ key: "v", label: "Visits" }])).toBe("Visits: Jan 1, Feb 2.");
  });
});

describe("one-time codes", () => {
  it("keeps allowed characters and marks the caret", () => {
    expect(sanitizeOtp("12 3a45678", 6)).toBe("123456");
    expect(otpSlots("12", 4, true).map((s) => s.isActive)).toEqual([false, false, true, false]);
    expect(otpSlots("1234", 4, true)[3]!.isActive).toBe(true);
    expect(otpComplete("1234", 4)).toBe(true);
  });
});

describe("forms", () => {
  it("limits a repeating group", () => {
    expect(fieldArrayLimits(2, { arrayMin: 2, arrayMax: 3 })).toEqual({ canAdd: true, canRemove: false });
    expect(fieldArrayAddLabel("Contacts")).toBe("Add Contact");
  });
  it("lists a wizard step's visible fields", () => {
    const fields = [{ key: "a" }, { key: "b", visible: () => false }, { key: "c" }];
    expect(wizardStepFields(fields, ["a", "b"], {}).map((f) => f.key)).toEqual(["a"]);
    expect(wizardProgressLabel(1, 4)).toEqual({ step: "Step 2 of 4", percent: "50%" });
  });
  it("checks files", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(fileAccepted({ name: "a.PDF", type: "" }, ".pdf")).toBe(true);
    expect(fileAccepted({ name: "a.png", type: "image/png" }, "image/*")).toBe(true);
    expect(fileAccepted({ name: "a.txt", type: "text/plain" }, "image/*")).toBe(false);
    expect(fileProblem({ name: "big.png", type: "image/png", size: 20 * 1024 * 1024 }, {})).toBe('"big.png" exceeds 10.0 MB limit');
    expect(fieldAccept({ type: "image" })).toBe("image/*");
  });
});

describe("display", () => {
  it("formats a trend and a status", () => {
    expect(formatTrend({ value: 12, label: "vs last week" })).toEqual({ text: "+12% vs last week", positive: true });
    expect(formatTrend({ value: -3, label: "" }).positive).toBe(false);
    expect(STATUS_BADGE_TONES.blocked).toBe("danger");
    expect(statusBadgeLabel("inProgress")).toBe("In progress");
    expect([0, 1, 2].map((i) => stepState(i, 1))).toEqual(["complete", "current", "upcoming"]);
  });
  it("groups notifications by day", () => {
    const now = new Date(2026, 5, 10, 12);
    expect(notificationDayBucket(new Date(2026, 5, 9, 23), now)).toBe("Yesterday");
    const groups = groupNotificationsByDay(
      [{ timestamp: new Date(2026, 4, 1) }, { timestamp: new Date(2026, 5, 10, 8) }],
      now,
    );
    expect(groups.map((g) => g.title)).toEqual(["Today", "Earlier"]);
  });
  it("derives a custom view's status", () => {
    expect(customViewStatus({ error: new Error("x"), loading: true, empty: true })).toBe("error");
    expect(customViewStatus({ error: null, loading: false, empty: true })).toBe("empty");
  });
  it("finds a carousel's slide", () => {
    expect(carouselIndex(610, 300, 3)).toBe(2);
    expect(carouselIndex(9000, 300, 3)).toBe(2);
  });
});

import { dayInRange, dayOfDate, monthWeeks, pickRangeDay, weekdayDays } from "../index";

describe("calendar", () => {
  it("lays out a month's weeks", () => {
    const weeks = monthWeeks("2026-06-15", 1);
    expect(weeks[0]![0]).toBe("2026-06-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(dayOfDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(weekdayDays(1)[0]).toBe("2023-01-02");
  });
  it("picks a range", () => {
    expect(pickRangeDay(undefined, "2026-01-05")).toEqual({ from: "2026-01-05" });
    expect(pickRangeDay({ from: "2026-01-05" }, "2026-01-02")).toEqual({ from: "2026-01-02", to: "2026-01-05" });
    expect(dayInRange("2026-01-03", { from: "2026-01-02", to: "2026-01-05" })).toBe(true);
  });
});

describe("adversarial inputs stay linear (CodeQL js/polynomial-redos)", () => {
  const fast = (fn: () => unknown) => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };

  it("parseNumberInput: still reads numbers, and refuses 50k-character input fast", () => {
    expect(parseNumberInput("12.")).toBe(12);
    expect(parseNumberInput(".5")).toBe(0.5);
    expect(parseNumberInput(" -1,25 ")).toBe(-1.25);
    expect(parseNumberInput("1,2,3")).toBeNull();
    expect(parseNumberInput("1".repeat(64))).not.toBeNull();
    for (const evil of ["1".repeat(50_000) + "x", "1".repeat(50_000) + ".", "-" + "9".repeat(50_000) + "a", "1".repeat(25_000) + "," + "1".repeat(25_000) + ","]) {
      let result: number | null = 0;
      expect(fast(() => (result = parseNumberInput(evil)))).toBeLessThan(50);
      expect(result).toBeNull();
    }
  });

  it("chartTokenOf: still reads tokens, and refuses 50k-character input fast", () => {
    expect(chartTokenOf("  hsl( var(--chart-2) )  ")).toBe("chart-2");
    expect(chartTokenOf("chart-3")).toBe("chart-3");
    expect(chartTokenOf("var(--chart-1)))")).toBeUndefined();
    for (const evil of ["chart-1" + " ".repeat(50_000) + "x", "hsl(var(--chart-1" + " )".repeat(25_000), "chart-" + "1".repeat(50_000) + "!"]) {
      let result: string | undefined = "x";
      expect(fast(() => (result = chartTokenOf(evil)))).toBeLessThan(50);
      expect(result).toBeUndefined();
    }
  });
});
