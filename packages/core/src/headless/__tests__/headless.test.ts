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
  fileProblem,
  filterOptions,
  formatFileSize,
  formatTimeOfDay,
  formatTrend,
  groupNotificationsByDay,
  matchesQuery,
  moveItem,
  movedAnnouncement,
  notificationDayBucket,
  otpComplete,
  otpSlots,
  parseNumberInput,
  readNumberDraft,
  commitNumberDraft,
  stripOtpSeparators,
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

// fileAccepted is fileProblem's type check; the public rule is fileProblem.
const fileAccepted = (file: Parameters<typeof fileProblem>[0], accept: string) => fileProblem(file, { accept }) === null;

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
  it("reads a comma before three digits as a thousands mark, and both marks by which comes last", () => {
    expect(parseNumberInput("1,234")).toBe(1234);
    expect(parseNumberInput("12,345,678")).toBe(12345678);
    expect(parseNumberInput("1,234.5")).toBe(1234.5);
    expect(parseNumberInput("1.234,5")).toBe(1234.5);
    expect(parseNumberInput("1.234.567")).toBe(1234567);
    expect(parseNumberInput("1 000")).toBe(1000);
    expect(parseNumberInput("1\u202f000,25")).toBe(1000.25);
    expect(parseNumberInput("1'000")).toBe(1000);
    // Not a thousands group: the decimal mark.
    expect(parseNumberInput("0,125")).toBe(0.125);
    expect(parseNumberInput("1234,567")).toBe(1234.567);
    expect(parseNumberInput("1,23")).toBe(1.23);
    // Marks that can't be read.
    expect(parseNumberInput("1,23.4")).toBeNull();
    expect(parseNumberInput("1.234,5.6")).toBeNull();
  });
  it("reads text with a locale's own marks when given one", () => {
    expect(parseNumberInput("1.234", { locale: "de-DE" })).toBe(1234);
    expect(parseNumberInput("1.234,5", { locale: "de-DE" })).toBe(1234.5);
    expect(parseNumberInput("1,234", { locale: "en-US" })).toBe(1234);
    expect(parseNumberInput("1 234,5", { locale: "fr-FR" })).toBe(1234.5);
    expect(parseNumberInput("1.5", { locale: "fr-FR" })).toBeNull();
  });
  it("reads a locale's marks as strictly as it guesses: groups only in the whole part, one decimal mark", () => {
    // Each of these was read 10 or 1000 times off.
    expect(parseNumberInput("1,5", { locale: "en-US" })).toBeNull();
    expect(parseNumberInput("1,2,3", { locale: "en-US" })).toBeNull();
    expect(parseNumberInput("1.234,5", { locale: "en-US" })).toBeNull();
    expect(parseNumberInput("1.5", { locale: "de-DE" })).toBeNull();
    expect(parseNumberInput("1,2,3", { locale: "de-DE" })).toBeNull();
    expect(parseNumberInput("1.234.5", { locale: "en-US" })).toBeNull();
    expect(parseNumberInput("1,234.5,6", { locale: "en-US" })).toBeNull();
    // Still read.
    expect(parseNumberInput("1,234,567.25", { locale: "en-US" })).toBe(1234567.25);
    expect(parseNumberInput("1.5", { locale: "en-US" })).toBe(1.5);
    expect(parseNumberInput("1.234.567,5", { locale: "de-DE" })).toBe(1234567.5);
    expect(parseNumberInput("1,5", { locale: "de-DE" })).toBe(1.5);
    expect(parseNumberInput("12,34,567", { locale: "en-IN" })).toBe(1234567);
    expect(parseNumberInput("12,34,567", { locale: "en-US" })).toBeNull();
  });
  it("guards the edges: tiny steps, NaN, and a min above max", () => {
    expect(snapToStep(3.2e-7, 1e-7, 0, 1)).toBe(3e-7);
    expect(stepNumber(2e-7, 1, { step: 1e-7 })).toBe(3e-7);
    expect(clampNumber(Number.NaN)).toBe(0);
    expect(clampNumber(Number.NaN, 5, 10)).toBe(5);
    expect(stepNumber(Number.NaN, 1, { max: 10 })).toBe(1);
    expect(snapToStep(5, Number.POSITIVE_INFINITY, 0, 10)).toBe(5);
    expect(() => snapToStep(5, 1, 10, 0)).toThrow(RangeError);
    expect(() => clampNumber(5, 10, 0)).toThrow(/min \(10\) is greater than max \(0\)/);
  });
  it("passes a typed number on only while it is in range", () => {
    expect(readNumberDraft("1", { min: 10, max: 20 })).toEqual({ value: 1, ready: false });
    expect(readNumberDraft("15", { min: 10, max: 20 })).toEqual({ value: 15, ready: true });
    expect(readNumberDraft("-", { min: 10 })).toEqual({ value: null, ready: false });
  });
  it("holds back a comma that may still become a thousands group, and digits past the precision", () => {
    // "1,234" typed key by key: "1,2" and "1,23" are not sent as 1.2 and 1.23.
    expect(readNumberDraft("1,2").ready).toBe(false);
    expect(readNumberDraft("1,23").ready).toBe(false);
    expect(readNumberDraft("1,234")).toEqual({ value: 1234, ready: true });
    expect(readNumberDraft("0,5")).toEqual({ value: 0.5, ready: true });
    expect(readNumberDraft("1,2", { locale: "de-DE" })).toEqual({ value: 1.2, ready: true });
    expect(readNumberDraft("1.5", { precision: 0 })).toEqual({ value: 1.5, ready: false });
    expect(readNumberDraft("1.5", { precision: 1 }).ready).toBe(true);
  });
  it("commits what's typed rounded to the precision and clamped, so the value is what the field shows", () => {
    expect(commitNumberDraft("1.5", { precision: 0 })).toBe(2);
    expect(commitNumberDraft("1.26", { precision: 1 })).toBe(1.3);
    expect(commitNumberDraft("1,2")).toBe(1.2);
    expect(commitNumberDraft("99", { max: 20, precision: 0 })).toBe(20);
    expect(commitNumberDraft("-")).toBeNull();
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
  it("folds only Latin accents: marks that make another letter in other scripts stay", () => {
    expect(matchesQuery("Crème Brûlée ỆƠ", "creme brulee eo")).toBe(true);
    // Japanese dakuten: ガ is not カ.
    expect(matchesQuery("カード", "ガ")).toBe(false);
    expect(matchesQuery("ガード", "ガ")).toBe(true);
    // Devanagari vowel signs: कि is not का.
    expect(matchesQuery("किताब", "का")).toBe(false);
    expect(matchesQuery("किताब", "कि")).toBe(true);
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
  it("puts a name in as it is, with no replacement patterns and no second substitution", () => {
    expect(movedAnnouncement("Save $' now {n}", 1, 3)).toBe("Save $' now {n} moved to position 2 of 3.");
    expect(movedAnnouncement("$& and $` and $$", 0, 1)).toBe("$& and $` and $$ moved to position 1 of 1.");
    expect(movedAnnouncement("{total}", 0, 2, "{n}/{total}: {name}")).toBe("1/2: {total}");
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
    expect(chartDomain([{ a: 87 }], ["a"]).ticks).toEqual([0, 25, 50, 75, 100]);
    const d = chartDomain([{ a: 3, b: 9 }, { a: -2, b: 1 }], ["a", "b"]);
    expect(d.min).toBeLessThanOrEqual(-2);
    expect(d.max).toBeGreaterThanOrEqual(9);
    expect(chartDomain([{ a: 3, b: 9 }], ["a", "b"], { stacked: true }).max).toBeGreaterThanOrEqual(12);
  });
  it("stacks positive and negative values apart, and skips values that aren't finite", () => {
    const mixed = chartDomain([{ a: 10, b: -8 }], ["a", "b"], { stacked: true });
    expect(mixed.min).toBeLessThanOrEqual(-8);
    expect(mixed.max).toBeGreaterThanOrEqual(10);
    const withNaN = chartDomain([{ a: 4, b: Number.NaN }, { a: 6, b: Number.POSITIVE_INFINITY }], ["a", "b"], { stacked: true });
    expect(withNaN.ticks.length).toBeGreaterThan(1);
    expect(withNaN.max).toBeGreaterThanOrEqual(6);
    expect(Number.isFinite(withNaN.max)).toBe(true);
  });
  it("says the chart in words", () => {
    expect(chartSummary([{ m: "Jan", v: 1 }, { m: "Feb", v: 2 }], "m", [{ key: "v", label: "Visits" }])).toBe("Visits: Jan 1, Feb 2.");
  });
});

describe("one-time codes", () => {
  it("keeps allowed characters and marks the caret", () => {
    expect(sanitizeOtp("123-456", 6)).toBe("123456");
    expect(sanitizeOtp(" 12 34 56 78", 6)).toBe("123456");
    expect(otpSlots("12", 4, true).map((s) => s.isActive)).toEqual([false, false, true, false]);
    expect(otpSlots("1234", 4, true)[3]!.isActive).toBe(true);
    expect(otpComplete("1234", 4)).toBe(true);
  });
  it("tests the pattern against the whole code, as input-otp does", () => {
    // A letter anywhere refuses the change, on the web and the phone alike.
    expect(sanitizeOtp("12a456", 6)).toBeNull();
    expect(sanitizeOtp("ab12", 6, "^[a-z]+$")).toBeNull();
    expect(sanitizeOtp("ab12", 6, "^[a-z0-9]+$")).toBe("ab12");
    expect(sanitizeOtp("", 6)).toBe("");
    expect(stripOtpSeparators("12\u2013 34.56")).toBe("123456");
  });
});

describe("forms", () => {
  it("limits a repeating group", () => {
    expect(fieldArrayLimits(2, { arrayMin: 2, arrayMax: 3 })).toEqual({ canAdd: true, canRemove: false });
    expect(fieldArrayAddLabel("Contacts")).toBe("Add Contact");
    expect(fieldArrayAddLabel("Addresses")).toBe("Add Address");
    expect(fieldArrayAddLabel("Status")).toBe("Add Status");
    expect(fieldArrayAddLabel("Categories")).toBe("Add Category");
    expect(fieldArrayAddLabel("Boxes")).toBe("Add Box");
    expect(fieldArrayAddLabel("People", "Person")).toBe("Add Person");
  });
  it("lists a wizard step's visible fields", () => {
    const fields = [{ key: "a" }, { key: "b", visible: () => false }, { key: "c" }];
    expect(wizardStepFields(fields, ["a", "b"], {}).map((f) => f.key)).toEqual(["a"]);
    expect(wizardProgressLabel({ currentStep: 1, totalSteps: 4, progress: 0.5 })).toEqual({ step: "Step 2 of 4", percent: "50%" });
    // The wizard's own progress is the one shown, not a second sum.
    expect(wizardProgressLabel({ currentStep: 0, totalSteps: 3, progress: 1 / 3 }).percent).toBe("33%");
  });
  it("checks files", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(fileAccepted({ name: "a.PDF", type: "" }, ".pdf")).toBe(true);
    expect(fileAccepted({ name: "a.png", type: "image/png" }, "image/*")).toBe(true);
    expect(fileAccepted({ name: "a.txt", type: "text/plain" }, "image/*")).toBe(false);
    // Both the extension and the reported type must agree.
    expect(fileAccepted({ name: "a.exe", type: "image/png" }, "image/*")).toBe(false);
    expect(fileAccepted({ name: "PHOTO.PNG", type: "" }, "image/*")).toBe(true);
    expect(fileAccepted({ name: "PHOTO.PNG" }, "image/png")).toBe(true);
    expect(fileAccepted({ name: "notes.txt", type: "text/plain;charset=utf-8" }, "text/plain")).toBe(true);
    expect(fileAccepted({ name: "notes", type: "text/plain; charset=utf-8" }, "text/plain")).toBe(true);
    expect(fileAccepted({ name: "notes", type: "" }, "text/plain")).toBe(false);
    expect(fileAccepted({ name: "a.unknownext", type: "image/png" }, "image/*")).toBe(true);
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
    expect(notificationDayBucket(new Date(2026, 5, 9, 23), { now })).toBe("Yesterday");
    const groups = groupNotificationsByDay(
      [{ timestamp: new Date(2026, 4, 1) }, { timestamp: new Date(2026, 5, 10, 8) }],
      { now },
    );
    expect(groups.map((g) => g.title)).toEqual(["Today", "Earlier"]);
  });
  it("puts a later day under Upcoming, and keeps each group's order", () => {
    const now = new Date(2026, 5, 10, 12);
    expect(notificationDayBucket(new Date(2026, 5, 11, 9), { now })).toBe("Upcoming");
    expect(notificationDayBucket("not a date", { now })).toBe("Earlier");
    const items = [
      { id: 1, timestamp: new Date(2026, 5, 10, 9) },
      { id: 2, timestamp: new Date(2026, 5, 12) },
      { id: 3, timestamp: new Date(2026, 5, 10, 8) },
      { id: 4, timestamp: new Date(2026, 5, 9, 8) },
    ];
    const groups = groupNotificationsByDay(items, { now });
    expect(groups.map((g) => [g.title, g.data.map((i) => i.id)])).toEqual([
      ["Upcoming", [2]],
      ["Today", [1, 3]],
      ["Yesterday", [4]],
    ]);
  });
  it("counts days on the zone it is given, not the machine's", () => {
    // 23:30 UTC on 10 June is already 11 June in Tokyo and still 10 June in New York.
    const now = new Date(Date.UTC(2026, 5, 11, 1));
    const late = new Date(Date.UTC(2026, 5, 10, 23, 30));
    expect(notificationDayBucket(late, { now, timeZone: "Asia/Tokyo" })).toBe("Today");
    expect(notificationDayBucket(late, { now, timeZone: "America/New_York" })).toBe("Today");
    expect(notificationDayBucket(new Date(Date.UTC(2026, 5, 10, 10)), { now, timeZone: "Asia/Tokyo" })).toBe("Yesterday");
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
  it("starts weeks on Monday by default, as genesis-core's dates do, and refuses a bad week start in both", () => {
    expect(monthWeeks("2026-06-15")[0]![0]).toBe("2026-06-01");
    expect(weekdayDays()[0]).toBe("2023-01-02");
    expect(weekdayDays(0)[0]).toBe("2023-01-01");
    expect(weekdayDays(6).length).toBe(7);
    expect(() => weekdayDays(7)).toThrow(RangeError);
    expect(() => monthWeeks("2026-06-15", 7)).toThrow(RangeError);
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
