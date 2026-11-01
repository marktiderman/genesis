// @feat:person-day
import { describe, expect, it } from "vitest";
import {
  addMonths,
  addWeeks,
  daysInMonth,
  eachDay,
  expandRecurrence,
  instantIn,
  monthGridRange,
  monthRange,
  parseRRule,
  quarterRange,
  rangeIn,
  startOfMonth,
  startOfQuarter,
  wallTimeIn,
  weeksRange,
  type Occurrence,
} from "../dates";

const days = (os: Occurrence[]) => os.map((o) => o.day);
const iso = (os: Occurrence[]) => os.map((o) => o.start?.toISOString());

describe("month, quarter and week ranges", () => {
  it("knows each month's length, leap years included", () => {
    expect(daysInMonth("2026-02-10")).toBe(28);
    expect(daysInMonth("2028-02-10")).toBe(29);
    expect(daysInMonth("2026-04-30")).toBe(30);
    expect(daysInMonth("2026-12-01")).toBe(31);
  });

  it("starts months and quarters", () => {
    expect(startOfMonth("2026-11-17")).toBe("2026-11-01");
    expect(startOfQuarter("2026-11-17")).toBe("2026-10-01");
    expect(startOfQuarter("2026-03-31")).toBe("2026-01-01");
    expect(startOfQuarter("2026-04-01")).toBe("2026-04-01");
  });

  it("moves by months, clamping to the month's last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-03-31", -13)).toBe("2025-02-28");
    expect(() => addMonths("2026-01-01", 1.5)).toThrow(RangeError);
  });

  it("moves by weeks", () => {
    expect(addWeeks("2026-11-01", 2)).toBe("2026-11-15");
    expect(addWeeks("2026-11-01", -1)).toBe("2026-10-25");
  });

  it("gives month and quarter ranges, end exclusive", () => {
    expect(monthRange("2026-12-09")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(quarterRange("2026-12-09")).toEqual({ start: "2026-10-01", end: "2027-01-01" });
  });

  it("gives 1 to 4 weeks from the week a day is in, Sunday or Monday first", () => {
    // 2026-11-04 is a Wednesday.
    expect(weeksRange("2026-11-04", 2, 0)).toEqual({ start: "2026-11-01", end: "2026-11-15" });
    expect(weeksRange("2026-11-04", 1)).toEqual({ start: "2026-11-02", end: "2026-11-09" });
    expect(weeksRange("2026-11-04", 4, 1).end).toBe("2026-11-30");
    expect(() => weeksRange("2026-11-04", 0)).toThrow(RangeError);
  });

  it("covers a month in whole weeks", () => {
    // November 2026: Sunday 1st to Monday 30th.
    expect(monthGridRange("2026-11-15", 0)).toEqual({ start: "2026-11-01", end: "2026-12-06" });
    expect(monthGridRange("2026-11-15", 1)).toEqual({ start: "2026-10-26", end: "2026-12-07" });
    // February 2026 fits exactly in four Sunday-first weeks.
    expect(monthGridRange("2026-02-10", 0)).toEqual({ start: "2026-02-01", end: "2026-03-01" });
  });

  it("lists each day of a range", () => {
    expect(eachDay({ start: "2026-12-30", end: "2027-01-02" })).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(eachDay({ start: "2026-12-30", end: "2026-12-30" })).toEqual([]);
  });

  it("turns a range of days into instants on a zone's clock, across daylight saving", () => {
    // Denver leaves daylight saving on 1 November 2026: that week is an hour longer.
    const { start, end } = rangeIn(weeksRange("2026-11-04", 1, 0), "America/Denver");
    expect(start.toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-08T07:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe((7 * 24 + 1) * 3_600_000);
  });
});

describe("instantIn", () => {
  it("reads a wall time on a zone's clock", () => {
    expect(instantIn("2026-07-01", "09:00", "America/Denver").toISOString()).toBe("2026-07-01T15:00:00.000Z");
    expect(instantIn("2026-12-01", "09:00", "America/Denver").toISOString()).toBe("2026-12-01T16:00:00.000Z");
    expect(instantIn("2026-12-01", "09:00:30", "Asia/Kolkata").toISOString()).toBe("2026-12-01T03:30:30.000Z");
  });

  it("moves a skipped time forward by the jump (02:30 on the spring-forward day is 03:30)", () => {
    const at = instantIn("2026-03-08", "02:30", "America/Denver");
    expect(at.toISOString()).toBe("2026-03-08T09:30:00.000Z");
    expect(wallTimeIn("America/Denver", at)).toEqual({ day: "2026-03-08", time: "03:30:00" });
  });

  it("takes the first of a repeated time (01:30 on the fall-back day)", () => {
    expect(instantIn("2026-11-01", "01:30", "America/Denver").toISOString()).toBe("2026-11-01T07:30:00.000Z");
    expect(instantIn("2026-10-25", "02:30", "Europe/Berlin").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("refuses bad times and zones", () => {
    expect(() => instantIn("2026-01-01", "24:00", "UTC")).toThrow(RangeError);
    expect(() => instantIn("2026-01-01", "9:00", "UTC")).toThrow(RangeError);
    expect(() => instantIn("2026-01-01", "09:00", "Mars/Olympus")).toThrow(RangeError);
  });
});

describe("parseRRule", () => {
  it("reads the supported parts, with or without the prefix", () => {
    expect(parseRRule("RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=2MO,-1FR;WKST=SU;COUNT=5")).toEqual({
      freq: "MONTHLY",
      interval: 2,
      count: 5,
      byDay: [{ weekday: 1, nth: 2 }, { weekday: 5, nth: -1 }],
      weekStart: 0,
    });
    expect(parseRRule("freq=yearly;bymonth=11;bymonthday=-1;until=20301231")).toEqual({
      freq: "YEARLY",
      interval: 1,
      byMonth: [11],
      byMonthDay: [-1],
      until: "2030-12-31",
      weekStart: 1,
    });
    expect((parseRRule("FREQ=DAILY;UNTIL=20261231T235959Z").until as Date).toISOString()).toBe("2026-12-31T23:59:59.000Z");
  });

  it("refuses what it doesn't support, so a caller never shows a wrong pattern", () => {
    expect(() => parseRRule("FREQ=HOURLY")).toThrow(/FREQ=HOURLY/);
    expect(() => parseRRule("FREQ=DAILY;BYHOUR=9")).toThrow(/BYHOUR/);
    expect(() => parseRRule("INTERVAL=2")).toThrow(/FREQ is required/);
    expect(() => parseRRule("FREQ=DAILY;COUNT=2;UNTIL=20260101")).toThrow(RangeError);
    expect(() => parseRRule("FREQ=WEEKLY;BYDAY=XX")).toThrow(RangeError);
    expect(() => parseRRule("FREQ=MONTHLY;BYMONTHDAY=32")).toThrow(RangeError);
    expect(() => parseRRule("FREQ=MONTHLY;BYDAY=0MO")).toThrow(RangeError);
  });
});

describe("expandRecurrence: all-day series", () => {
  const year = { start: "2026-01-01", end: "2028-01-01" };

  it("repeats daily with an interval and a count", () => {
    expect(days(expandRecurrence({ rule: "FREQ=DAILY;INTERVAL=3;COUNT=4", start: "2026-12-30", window: year }))).toEqual([
      "2026-12-30",
      "2027-01-02",
      "2027-01-05",
      "2027-01-08",
    ]);
  });

  it("repeats weekly on several days, every other week from WKST", () => {
    // Starts Wednesday 4 Nov 2026; every second week, Monday and Wednesday.
    expect(days(expandRecurrence({ rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5", start: "2026-11-04", window: year }))).toEqual([
      "2026-11-04",
      "2026-11-16",
      "2026-11-18",
      "2026-11-30",
      "2026-12-02",
    ]);
  });

  it("lets WKST decide which weeks an every-other-week rule lands in", () => {
    // RFC 5545's own example: start Tue 5 Aug 1997, every 2 weeks on Tue and Sun, 4 times.
    const rule = "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU";
    expect(days(expandRecurrence({ rule: `${rule};WKST=MO`, start: "1997-08-05", window: { start: "1997-01-01", end: "1998-01-01" } }))).toEqual([
      "1997-08-05",
      "1997-08-10",
      "1997-08-19",
      "1997-08-24",
    ]);
    expect(days(expandRecurrence({ rule: `${rule};WKST=SU`, start: "1997-08-05", window: { start: "1997-01-01", end: "1998-01-01" } }))).toEqual([
      "1997-08-05",
      "1997-08-17",
      "1997-08-19",
      "1997-08-31",
    ]);
  });

  it("finds the second Monday and the last Friday of each month", () => {
    expect(days(expandRecurrence({ rule: "FREQ=MONTHLY;BYDAY=2MO;COUNT=3", start: "2026-11-09", window: year }))).toEqual([
      "2026-11-09",
      "2026-12-14",
      "2027-01-11",
    ]);
    expect(days(expandRecurrence({ rule: "FREQ=MONTHLY;BYDAY=-1FR;COUNT=3", start: "2026-11-27", window: year }))).toEqual([
      "2026-11-27",
      "2026-12-25",
      "2027-01-29",
    ]);
  });

  it("skips months without the day rather than moving it", () => {
    expect(days(expandRecurrence({ rule: "FREQ=MONTHLY;COUNT=4", start: "2026-01-31", window: year }))).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });

  it("counts month days from the end", () => {
    expect(days(expandRecurrence({ rule: "FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3", start: "2026-01-31", window: year }))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("picks one from each month's set with BYSETPOS (the last weekday)", () => {
    expect(days(expandRecurrence({ rule: "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3", start: "2026-10-30", window: year }))).toEqual([
      "2026-10-30",
      "2026-11-30",
      "2026-12-31",
    ]);
  });

  it("repeats yearly: a birthday, Thanksgiving, and 29 February", () => {
    expect(days(expandRecurrence({ rule: "FREQ=YEARLY", start: "2001-07-14", window: year }))).toEqual(["2026-07-14", "2027-07-14"]);
    expect(days(expandRecurrence({ rule: "FREQ=YEARLY;BYMONTH=11;BYDAY=4TH", start: "2020-11-26", window: year }))).toEqual([
      "2026-11-26",
      "2027-11-25",
    ]);
    expect(days(expandRecurrence({ rule: "FREQ=YEARLY", start: "2024-02-29", window: { start: "2024-01-01", end: "2033-01-01" } }))).toEqual([
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
  });

  it("repeats yearly on a weekday counted through the year", () => {
    // The 20th Monday of the year.
    expect(days(expandRecurrence({ rule: "FREQ=YEARLY;BYDAY=20MO;COUNT=2", start: "2026-05-18", window: year }))).toEqual([
      "2026-05-18",
      "2027-05-17",
    ]);
  });

  it("limits a daily rule to some months and weekdays", () => {
    const got = days(expandRecurrence({ rule: "FREQ=DAILY;BYMONTH=1;BYDAY=SA,SU", start: "2026-01-03", window: { start: "2026-01-01", end: "2026-02-01" } }));
    expect(got).toEqual(["2026-01-03", "2026-01-04", "2026-01-10", "2026-01-11", "2026-01-17", "2026-01-18", "2026-01-24", "2026-01-25", "2026-01-31"]);
  });

  it("stops at UNTIL, inclusive", () => {
    expect(days(expandRecurrence({ rule: "FREQ=WEEKLY;UNTIL=20261118", start: "2026-11-04", window: year }))).toEqual([
      "2026-11-04",
      "2026-11-11",
      "2026-11-18",
    ]);
  });

  it("counts from the start whatever the window, and EXDATE doesn't add one at the end", () => {
    const rule = "FREQ=WEEKLY;COUNT=4";
    expect(days(expandRecurrence({ rule, start: "2026-11-02", window: { start: "2026-11-15", end: "2027-01-01" } }))).toEqual([
      "2026-11-16",
      "2026-11-23",
    ]);
    expect(days(expandRecurrence({ rule, start: "2026-11-02", exdates: ["2026-11-09"], window: year }))).toEqual([
      "2026-11-02",
      "2026-11-16",
      "2026-11-23",
    ]);
  });

  it("can remove the first occurrence", () => {
    expect(days(expandRecurrence({ rule: "FREQ=DAILY;COUNT=2", start: "2026-11-02", exdates: ["2026-11-02"], window: year }))).toEqual(["2026-11-03"]);
  });

  it("returns only the window, and jumps to it on an endless series", () => {
    const got = expandRecurrence({ rule: "FREQ=DAILY", start: "1990-01-01", window: { start: "2026-11-01", end: "2026-11-04" } });
    expect(days(got)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(got[0]!.start).toBeUndefined();
    const weekly = expandRecurrence({ rule: "FREQ=WEEKLY;INTERVAL=3", start: "2000-01-03", window: { start: "2026-11-01", end: "2026-12-01" } });
    expect(days(weekly).every((d) => (Date.parse(d) - Date.parse("2000-01-03")) % (21 * 86_400_000) === 0)).toBe(true);
    expect(weekly.length).toBeGreaterThan(0);
  });

  it("stops at the limit", () => {
    expect(expandRecurrence({ rule: "FREQ=DAILY", start: "2026-01-01", window: year, limit: 5 })).toHaveLength(5);
  });

  it("ends a rule that names no real day", () => {
    expect(days(expandRecurrence({ rule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", start: "2026-01-01", window: { start: "2026-01-01", end: "2900-01-01" } }))).toEqual([
      "2026-01-01",
    ]);
  });
});

describe("expandRecurrence: timed series across daylight saving", () => {
  const denver = "America/Denver";

  it("keeps the wall time when the clocks change (09:00 stays 09:00)", () => {
    const got = expandRecurrence({
      rule: "FREQ=WEEKLY;BYDAY=SU",
      start: { day: "2026-10-25", time: "09:00", timeZone: denver },
      window: { start: "2026-10-25", end: "2026-11-09" },
    });
    expect(days(got)).toEqual(["2026-10-25", "2026-11-01", "2026-11-08"]);
    expect(iso(got)).toEqual(["2026-10-25T15:00:00.000Z", "2026-11-01T16:00:00.000Z", "2026-11-08T16:00:00.000Z"]);
  });

  it("moves an occurrence in the skipped hour forward, as RFC 5545 says", () => {
    const got = expandRecurrence({
      rule: "FREQ=DAILY;COUNT=3",
      start: { day: "2026-03-07", time: "02:30", timeZone: denver },
      window: { start: "2026-03-01", end: "2026-04-01" },
    });
    expect(iso(got)).toEqual(["2026-03-07T09:30:00.000Z", "2026-03-08T09:30:00.000Z", "2026-03-09T08:30:00.000Z"]);
  });

  it("starts from an instant read on the series' clock", () => {
    const got = expandRecurrence({
      rule: "FREQ=WEEKLY;COUNT=2",
      start: { at: new Date("2026-10-28T00:30:00Z"), timeZone: denver },
      window: { start: "2026-10-01", end: "2026-12-01" },
    });
    // 18:30 on Tuesday 27 October in Denver, then the next Tuesday after the clocks change.
    expect(days(got)).toEqual(["2026-10-27", "2026-11-03"]);
    expect(iso(got)).toEqual(["2026-10-28T00:30:00.000Z", "2026-11-04T01:30:00.000Z"]);
  });

  it("stops at an UNTIL instant, inclusive", () => {
    const got = expandRecurrence({
      rule: "FREQ=DAILY;UNTIL=20261103T160000Z",
      start: { day: "2026-11-01", time: "09:00", timeZone: denver },
      window: { start: "2026-11-01", end: "2026-12-01" },
    });
    expect(iso(got)).toEqual(["2026-11-01T16:00:00.000Z", "2026-11-02T16:00:00.000Z", "2026-11-03T16:00:00.000Z"]);
  });

  it("removes an occurrence by its instant or its day", () => {
    const got = expandRecurrence({
      rule: "FREQ=DAILY;COUNT=4",
      start: { day: "2026-11-01", time: "09:00", timeZone: denver },
      exdates: [new Date("2026-11-02T16:00:00Z"), "2026-11-03"],
      window: { start: "2026-11-01", end: "2026-12-01" },
    });
    expect(days(got)).toEqual(["2026-11-01", "2026-11-04"]);
  });

  it("works on the other side of the world too", () => {
    const got = expandRecurrence({
      rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=2",
      start: { day: "2026-03-30", time: "08:00", timeZone: "Australia/Sydney" },
      window: { start: "2026-03-01", end: "2026-05-01" },
    });
    // Sydney leaves daylight saving on 5 April 2026.
    expect(iso(got)).toEqual(["2026-03-29T21:00:00.000Z", "2026-04-05T22:00:00.000Z"]);
  });

  it("refuses an unknown zone", () => {
    expect(() =>
      expandRecurrence({ rule: "FREQ=DAILY", start: { day: "2026-01-01", time: "09:00", timeZone: "Mars/Olympus" }, window: { start: "2026-01-01", end: "2026-01-02" } }),
    ).toThrow(RangeError);
  });
});
