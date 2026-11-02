// @feat:calendar-read-layer
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDuration, parseIcs, readIcs } from "./ics";
import type { CalendarEvent } from "./types";
import { resolveZone } from "./zones";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const window = { from: new Date("2026-10-25T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") };
const feed = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-TIMEZONE:America/New_York", ...events, "END:VCALENDAR"].join("\r\n");
const read = (text: string, w = window) => readIcs(text, { sourceId: "src", window: w }).events;
const iso = (t: CalendarEvent["start"]) => (t instanceof Date ? t.toISOString() : t);

describe("parseIcs", () => {
  it("unfolds lines, reads quoted parameters and unescapes on read", () => {
    const [cal] = parseIcs(
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Long\r\n  title\r\nATTENDEE;CN="Doe, J: x":mailto:j@x.test\r\nEND:VEVENT\r\nEND:VCALENDAR',
    );
    const ev = cal!.components[0]!;
    expect(ev.properties.find((p) => p.name === "SUMMARY")!.value).toBe("Long title");
    const att = ev.properties.find((p) => p.name === "ATTENDEE")!;
    expect(att.params["CN"]).toBe("Doe, J: x");
    expect(att.value).toBe("mailto:j@x.test");
  });

  it("skips components nested too deep, and tolerates stray ENDs and unclosed components", () => {
    const deep = ["BEGIN:VCALENDAR", ...Array.from({ length: 50 }, () => "BEGIN:X"), "SUMMARY:deep", ...Array.from({ length: 50 }, () => "END:X"), "X-AFTER:yes", "END:VCALENDAR"];
    const [cal] = parseIcs(deep.join("\n"), { maxDepth: 4 });
    expect(cal!.properties.map((p) => p.name)).toEqual(["X-AFTER"]);
    expect(parseIcs("END:VEVENT\nnot a line\nBEGIN:VCALENDAR\nX:1")).toHaveLength(1);
  });
});

describe("parseDuration", () => {
  it("reads weeks, days and times", () => {
    expect(parseDuration("PT1H30M")).toBe(90 * 60_000);
    expect(parseDuration("P1W")).toBe(7 * 86_400_000);
    expect(parseDuration("-PT15M")).toBe(-15 * 60_000);
    expect(parseDuration("nope")).toBeNull();
  });
});

describe("resolveZone", () => {
  it("takes IANA, Windows and prefixed names", () => {
    expect(resolveZone("Europe/London")).toBe("Europe/London");
    expect(resolveZone("Eastern Standard Time")).toBe("America/New_York");
    expect(resolveZone("/mozilla.org/20050126_1/America/Chicago")).toBe("America/Chicago");
    expect(resolveZone("Mars/Olympus")).toBeNull();
  });
});

describe("readIcs", () => {
  it("reads a one-off timed event in its zone, with text and class", () => {
    const [e] = read(
      feed(
        "BEGIN:VEVENT",
        "UID:one@x",
        "DTSTART;TZID=America/Los_Angeles:20261105T090000",
        "DTEND;TZID=America/Los_Angeles:20261105T100000",
        "SUMMARY:Dentist\\, Dr. Lee",
        "LOCATION:12 Main St",
        "CLASS:PRIVATE",
        "END:VEVENT",
      ),
    );
    expect(e).toEqual({
      sourceId: "src",
      externalRef: "one@x",
      icalUid: "one@x",
      seriesRef: null,
      title: "Dentist, Dr. Lee",
      location: "12 Main St",
      allDay: false,
      start: new Date("2026-11-05T17:00:00.000Z"),
      end: new Date("2026-11-05T18:00:00.000Z"),
      timeZone: "America/Los_Angeles",
      recurring: false,
      visibility: "private",
      status: "confirmed",
    });
  });

  it("reads all-day events as days, with an exclusive end", () => {
    const [e] = read(feed("BEGIN:VEVENT", "UID:d@x", "DTSTART;VALUE=DATE:20261126", "SUMMARY:Holiday", "END:VEVENT"));
    expect(e).toMatchObject({ allDay: true, start: "2026-11-26", end: "2026-11-27", timeZone: null });
  });

  it("uses the calendar's zone for floating times and DURATION for the end", () => {
    const [e] = read(feed("BEGIN:VEVENT", "UID:f@x", "DTSTART:20261110T080000", "DURATION:PT45M", "END:VEVENT"));
    expect(iso(e!.start)).toBe("2026-11-10T13:00:00.000Z");
    expect(iso(e!.end)).toBe("2026-11-10T13:45:00.000Z");
  });

  it("leaves out cancelled events and events outside the window", () => {
    const out = read(
      feed("BEGIN:VEVENT", "UID:c@x", "DTSTART:20261110T080000Z", "STATUS:CANCELLED", "END:VEVENT", "BEGIN:VEVENT", "UID:old@x", "DTSTART:20250110T080000Z", "END:VEVENT"),
    );
    expect(out).toEqual([]);
  });

  it("expands a weekly series across a DST change, keeping the wall time", () => {
    const out = read(
      feed(
        "BEGIN:VEVENT",
        "UID:w@x",
        "DTSTART;TZID=America/New_York:20261026T180000",
        "DTEND;TZID=America/New_York:20261026T190000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Practice",
        "END:VEVENT",
      ),
    );
    expect(out.map((e) => iso(e.start))).toEqual(["2026-10-26T22:00:00.000Z", "2026-11-02T23:00:00.000Z", "2026-11-09T23:00:00.000Z"]);
    expect(out[1]).toMatchObject({ externalRef: "w@x|2026-11-02T23:00:00.000Z", seriesRef: "w@x", recurring: true, end: new Date("2026-11-03T00:00:00.000Z") });
  });

  it("moves a time the clock skips forward, as RFC 5545 says", () => {
    const [e] = read(feed("BEGIN:VEVENT", "UID:gap@x", "DTSTART;TZID=America/New_York:20270314T023000", "END:VEVENT"), {
      from: new Date("2027-03-01T00:00:00Z"),
      to: new Date("2027-04-01T00:00:00Z"),
    });
    expect(iso(e!.start)).toBe("2027-03-14T07:30:00.000Z");
  });

  it("honours EXDATE and RECURRENCE-ID overrides, moved and cancelled", () => {
    const out = read(
      feed(
        "BEGIN:VEVENT",
        "UID:s@x",
        "DTSTART;TZID=America/New_York:20261102T090000",
        "DTEND;TZID=America/New_York:20261102T093000",
        "RRULE:FREQ=DAILY;COUNT=5",
        "EXDATE;TZID=America/New_York:20261103T090000",
        "SUMMARY:Standup",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:s@x",
        "RECURRENCE-ID;TZID=America/New_York:20261104T090000",
        "DTSTART;TZID=America/New_York:20261104T110000",
        "DTEND;TZID=America/New_York:20261104T113000",
        "SUMMARY:Standup (moved)",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:s@x",
        "RECURRENCE-ID:20261105T140000Z",
        "DTSTART:20261105T140000Z",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ),
    );
    expect(out.map((e) => [iso(e.start), e.title])).toEqual([
      ["2026-11-02T14:00:00.000Z", "Standup"],
      ["2026-11-04T16:00:00.000Z", "Standup (moved)"],
      ["2026-11-06T14:00:00.000Z", "Standup"],
    ]);
    // The moved one keeps the key of the occurrence it replaced.
    expect(out[1]!.externalRef).toBe("s@x|2026-11-04T14:00:00.000Z");
  });

  it("expands from a start long before the window, keeping only the window", () => {
    expect(read(feed("BEGIN:VEVENT", "UID:b@x", "DTSTART;VALUE=DATE:19900310", "RRULE:FREQ=YEARLY", "SUMMARY:Birthday", "END:VEVENT"))).toEqual([]);
    const nov = read(feed("BEGIN:VEVENT", "UID:b2@x", "DTSTART;VALUE=DATE:19901112", "RRULE:FREQ=YEARLY", "END:VEVENT"));
    expect(nov.map((e) => e.start)).toEqual(["2026-11-12"]);
  });

  it("adds RDATEs", () => {
    const out = read(feed("BEGIN:VEVENT", "UID:r@x", "DTSTART:20261101T100000Z", "RDATE:20261115T100000Z,20261120T100000Z", "END:VEVENT"));
    expect(out.map((e) => iso(e.start))).toEqual(["2026-11-01T10:00:00.000Z", "2026-11-15T10:00:00.000Z", "2026-11-20T10:00:00.000Z"]);
  });

  it("reads Outlook's Windows zone names", () => {
    const [e] = read(feed("BEGIN:VEVENT", "UID:o@x", 'DTSTART;TZID="Pacific Standard Time":20261201T090000', "END:VEVENT"));
    expect(iso(e!.start)).toBe("2026-12-01T17:00:00.000Z");
  });

  it("shows a rule core/dates refuses as its first occurrence, reported, never thrown", () => {
    const result = readIcs(feed("BEGIN:VEVENT", "UID:p@x", "DTSTART:20261102T090000Z", "RRULE:FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=1", "END:VEVENT"), { sourceId: "s", window });
    expect(result.events.map((e) => iso(e.start))).toEqual(["2026-11-02T09:00:00.000Z"]);
    expect(result.unexpanded).toEqual(["p@x"]);
    const garbage = readIcs(feed("BEGIN:VEVENT", "UID:g@x", "DTSTART:20261102T090000Z", "RRULE:nonsense", "END:VEVENT"), { sourceId: "s", window });
    expect(garbage.unexpanded).toEqual(["g@x"]);
  });

  it("caps the work counted rules share, reporting the rest as unexpanded", () => {
    const counted = (i: number) => ["BEGIN:VEVENT", `UID:c${i}@x`, "DTSTART:20000101T090000Z", "RRULE:FREQ=DAILY;COUNT=100000", "END:VEVENT"];
    const result = readIcs(feed(...Array.from({ length: 11 }, (_, i) => counted(i)).flat()), { sourceId: "s", window });
    expect(result.unexpanded).toEqual(["c10@x"]);
  });

  it("skips malformed times rather than throwing", () => {
    const out = read(feed("BEGIN:VEVENT", "UID:m@x", "DTSTART:20261399T250000", "END:VEVENT", "BEGIN:VEVENT", "UID:n@x", "DTSTART:00000101T000000Z", "END:VEVENT"));
    expect(out).toEqual([]);
  });
});

describe("readIcs on hostile feeds", () => {
  it("never throws on a TZID or X-WR-TIMEZONE naming an Object member", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(resolveZone(name)).toBeNull();
      const text = [
        "BEGIN:VCALENDAR",
        `X-WR-TIMEZONE:${name}`,
        "BEGIN:VEVENT",
        "UID:z@x",
        `DTSTART;TZID=${name}:20261105T090000`,
        "RRULE:FREQ=DAILY;COUNT=2",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:f@x",
        "DTSTART:20261106T100000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");
      // Read on the fallback zone (UTC), not thrown.
      const out = readIcs(text, { sourceId: "s", window, defaultZone: name }).events;
      expect(out.map((e) => iso(e.start))).toEqual(["2026-11-05T09:00:00.000Z", "2026-11-06T09:00:00.000Z", "2026-11-06T10:00:00.000Z"]);
    }
  });

  it("skips an event with an absurd length rather than throwing", () => {
    const out = read(
      feed(
        "BEGIN:VEVENT",
        "UID:long@x",
        "DTSTART:20261105T090000Z",
        "DURATION:P99999999999999999999W",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:far@x",
        "DTSTART:20261105T090000Z",
        "DTEND:99991231T000000Z",
        "RRULE:FREQ=DAILY",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:ok@x",
        "DTSTART:20261105T090000Z",
        "DURATION:PT1H",
        "END:VEVENT",
      ),
    );
    expect(out.map((e) => e.externalRef)).toEqual(["ok@x"]);
  });

  it("keeps a moved occurrence of a private series private", () => {
    const out = read(
      feed(
        "BEGIN:VEVENT",
        "UID:p@x",
        "DTSTART:20261102T090000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "CLASS:PRIVATE",
        "SUMMARY:Appointment",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:p@x",
        "RECURRENCE-ID:20261103T090000Z",
        "DTSTART:20261103T150000Z",
        "SUMMARY:Appointment (moved)",
        "END:VEVENT",
        // An override whose original is outside the window still takes the master's class.
        "BEGIN:VEVENT",
        "UID:p@x",
        "RECURRENCE-ID:20261001T090000Z",
        "DTSTART:20261110T090000Z",
        "SUMMARY:Appointment (moved in)",
        "END:VEVENT",
      ),
    );
    expect(out.map((e) => [e.title, e.visibility])).toEqual([
      ["Appointment", "private"],
      ["Appointment (moved)", "private"],
      ["Appointment", "private"],
      ["Appointment (moved in)", "private"],
    ]);
  });
});

describe("readIcs limits", () => {
  it("refuses a feed over the byte cap", () => {
    expect(() => readIcs(feed("X-PAD:" + "é".repeat(600)), { sourceId: "s", window, maxBytes: 1000 })).toThrow(RangeError);
  });

  it("caps the events read and the occurrences of one series, reporting truncated", () => {
    const many = feed(...Array.from({ length: 5 }, (_, i) => ["BEGIN:VEVENT", `UID:e${i}@x`, `DTSTART:2026110${i + 1}T090000Z`, "END:VEVENT"]).flat());
    const capped = readIcs(many, { sourceId: "s", window, maxEvents: 3 });
    expect(capped.events).toHaveLength(3);
    expect(capped.truncated).toBe(true);

    const daily = feed("BEGIN:VEVENT", "UID:d@x", "DTSTART:20261026T090000Z", "RRULE:FREQ=DAILY", "END:VEVENT");
    const series = readIcs(daily, { sourceId: "s", window, maxOccurrencesPerSeries: 10 });
    expect(series.events).toHaveLength(10);
    expect(series.truncated).toBe(true);
    const total = readIcs(daily, { sourceId: "s", window, maxOccurrences: 4 });
    expect(total.events).toHaveLength(4);
    expect(total.truncated).toBe(true);
    expect(readIcs(daily, { sourceId: "s", window }).truncated).toBe(false);
  });
});

describe("readIcs on recorded feeds", () => {
  it("an Exchange feed with Windows TZIDs and a VTIMEZONE, and a BYSETPOS rule", () => {
    const result = readIcs(fixture("outlook-windows-tz.ics"), { sourceId: "o", window });
    const weekly = result.events.filter((e) => e.title === "Weekly review");
    // Tuesdays 09:00 Pacific until 24 November inclusive, across the 1 November DST change.
    expect(weekly.map((e) => iso(e.start))).toEqual([
      "2026-10-27T16:00:00.000Z",
      "2026-11-03T17:00:00.000Z",
      "2026-11-10T17:00:00.000Z",
      "2026-11-17T17:00:00.000Z",
      "2026-11-24T17:00:00.000Z",
    ]);
    expect(weekly[0]).toMatchObject({ location: "Room 4, second floor", timeZone: "America/Los_Angeles", visibility: "public" });
    const lastWeekday = result.events.filter((e) => e.title === "Last weekday of the month");
    expect(lastWeekday.map((e) => [iso(e.start), e.visibility])).toEqual([["2026-10-30T23:00:00.000Z", "private"]]);
    expect(result.unexpanded).toEqual(["040000008200E00074C5B7101A82E00800000000C0FIXTURE0000000000000000100000002"]);
  });

  it("a Google feed with a moved and a cancelled occurrence, and an EXDATE", () => {
    const out = read(fixture("google-overrides.ics"), { from: new Date("2026-10-25T00:00:00Z"), to: new Date("2026-11-23T00:00:00Z") });
    expect(out.map((e) => [iso(e.start), e.title])).toEqual([
      ["2026-10-26T22:30:00.000Z", "Swim lessons"],
      ["2026-10-28T22:30:00.000Z", "Swim lessons"],
      ["2026-11-02T23:30:00.000Z", "Swim lessons"],
      ["2026-11-09T23:30:00.000Z", "Swim lessons"],
      ["2026-11-12T01:00:00.000Z", "Swim lessons (late pool)"],
      ["2026-11-18T23:30:00.000Z", "Swim lessons"],
    ]);
    expect(out[4]!.externalRef).toBe("1a2bfixtureseries@google.com|2026-11-11T23:30:00.000Z");
    expect(new Set(out.map((e) => e.seriesRef))).toEqual(new Set(["1a2bfixtureseries@google.com"]));
  });

  it("all-day events, a one-day default length and an all-day series with an EXDATE", () => {
    const out = read(fixture("all-day.ics"), { from: new Date("2026-10-25T00:00:00Z"), to: new Date("2027-02-01T00:00:00Z") });
    expect(out.map((e) => [e.title, e.start, e.end, e.allDay])).toEqual([
      ["Half day", "2026-11-02", "2026-11-03", true],
      ["No school", "2026-11-11", "2026-11-12", true],
      ["Thanksgiving break", "2026-11-25", "2026-11-28", true],
      ["Half day", "2027-01-04", "2027-01-05", true],
    ]);
  });

  it("floating times read on X-WR-TIMEZONE's clock, across its DST change", () => {
    const out = read(fixture("floating.ics"), { from: new Date("2026-10-20T00:00:00Z"), to: new Date("2026-11-05T00:00:00Z") });
    expect(out.map((e) => [e.title, iso(e.start), iso(e.end), e.timeZone])).toEqual([
      ["Game 1", "2026-10-24T09:00:00.000Z", "2026-10-24T10:30:00.000Z", "Europe/London"],
      ["Game 2", "2026-10-31T10:00:00.000Z", "2026-10-31T11:30:00.000Z", "Europe/London"],
    ]);
  });
});
