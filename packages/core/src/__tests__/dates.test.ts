// @feat:person-day
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  dayIn,
  dayRangeIn,
  daysBetween,
  deviceTimeZone,
  isDay,
  isTimeZone,
  personDay,
  personTimeZone,
  startOfDayIn,
  startOfWeek,
  wallClock,
  weekdayOf,
} from "../dates";

// 2026-10-27 03:30 UTC: still the 26th in the Americas, the 27th in Europe and Asia.
const evening = new Date("2026-10-27T03:30:00Z");

afterEach(() => vi.restoreAllMocks());

describe("dayIn", () => {
  it("is the day on that zone's wall clock, not UTC's", () => {
    expect(evening.toISOString().slice(0, 10)).toBe("2026-10-27");
    expect(dayIn("America/Denver", evening)).toBe("2026-10-26");
    expect(dayIn("America/New_York", evening)).toBe("2026-10-26");
    expect(dayIn("Europe/London", evening)).toBe("2026-10-27");
    expect(dayIn("Asia/Kolkata", evening)).toBe("2026-10-27");
  });

  it("refuses a zone the runtime doesn't know", () => {
    expect(() => dayIn("Mars/Olympus", evening)).toThrow(RangeError);
  });
});

describe("wallClock", () => {
  it("reads the clock, with 0 for Sunday and a 24-hour day", () => {
    expect(wallClock("America/Denver", evening)).toEqual({ year: 2026, month: 10, day: 26, hour: 21, minute: 30, second: 0, weekday: 1 });
    expect(wallClock("UTC", new Date("2026-11-01T00:00:00Z")).hour).toBe(0);
  });
});

describe("personDay", () => {
  it("uses the person's saved zone first", () => {
    expect(personDay({ timeZone: "America/Los_Angeles" }, evening)).toBe("2026-10-26");
    expect(personDay({ timeZone: "Asia/Tokyo" }, evening)).toBe("2026-10-27");
  });

  it("falls back to the device's zone for none or an unknown one", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ timeZone: "America/Chicago" } as Intl.ResolvedDateTimeFormatOptions);
    expect(deviceTimeZone()).toBe("America/Chicago");
    expect(personTimeZone({ timeZone: null })).toBe("America/Chicago");
    expect(personTimeZone({ timeZone: "Not/AZone" })).toBe("America/Chicago");
    expect(personDay(undefined, evening)).toBe("2026-10-26");
  });
});

describe("calendar arithmetic", () => {
  it("validates days", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-2-1")).toBe(false);
    expect(isDay(20260101)).toBe(false);
    expect(isTimeZone("America/Phoenix")).toBe(true);
    expect(isTimeZone("")).toBe(false);
  });

  it("adds days across months, years and daylight saving", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(daysBetween("2026-10-26", "2026-11-02")).toBe(7);
    expect(daysBetween("2026-11-02", "2026-10-26")).toBe(-7);
    expect(() => addDays("2026-13-01", 1)).toThrow(RangeError);
  });

  it("finds the week's first day", () => {
    expect(weekdayOf("2026-10-26")).toBe(1);
    expect(startOfWeek("2026-10-28")).toBe("2026-10-26");
    expect(startOfWeek("2026-10-26")).toBe("2026-10-26");
    expect(startOfWeek("2026-10-28", 0)).toBe("2026-10-25");
    expect(startOfWeek("2026-11-01", 1)).toBe("2026-10-26");
  });
});

describe("startOfDayIn", () => {
  it("is midnight on the zone's clock", () => {
    expect(startOfDayIn("2026-10-26", "America/Denver").toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect(startOfDayIn("2026-10-26", "Asia/Kolkata").toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(startOfDayIn("2026-10-26", "UTC").toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("gives 23- and 25-hour days at the daylight-saving changes", () => {
    const spring = dayRangeIn("2026-03-08", "America/New_York");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const fall = dayRangeIn("2026-11-01", "America/New_York");
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
    expect(fall.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("starts at the first instant that exists when midnight is skipped", () => {
    // Santiago springs forward at 00:00 local on 2026-09-06: the day starts at 01:00 (-03).
    const start = startOfDayIn("2026-09-06", "America/Santiago");
    expect(dayIn("America/Santiago", start)).toBe("2026-09-06");
    expect(dayIn("America/Santiago", new Date(start.getTime() - 1))).toBe("2026-09-05");
    expect(wallClock("America/Santiago", start).hour).toBe(1);
  });
});
