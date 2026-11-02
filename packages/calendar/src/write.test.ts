// @feat:calendar-read-layer
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIcs, readIcs } from "./ics";
import type { CalendarEvent } from "./types";
import { writeIcs } from "./write";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const window = { from: new Date("2026-10-20T00:00:00Z"), to: new Date("2027-02-01T00:00:00Z") };
const now = new Date("2026-11-01T12:00:00Z");

const event = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  sourceId: "app",
  externalRef: "s-1",
  icalUid: null,
  seriesRef: null,
  title: "Planning",
  location: null,
  allDay: false,
  start: new Date("2026-11-05T15:00:00Z"),
  end: new Date("2026-11-05T16:00:00Z"),
  timeZone: null,
  recurring: false,
  visibility: "public",
  status: "confirmed",
  ...extra,
});

describe("writeIcs", () => {
  it("writes a feed: UID, UTC and all-day times, status, class and a stamp", () => {
    const text = writeIcs(
      [event(), event({ externalRef: "s-2", icalUid: "away@x", allDay: true, start: "2026-11-27", end: "2026-11-30", visibility: "private", status: "tentative" })],
      { prodId: "-//Acme//Schedule//EN", calendarName: "Acme, schedule", now },
    );
    expect(text.split("\r\n")).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Acme//Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Acme\\, schedule",
      "BEGIN:VEVENT",
      "UID:app-s-1",
      "DTSTAMP:20261101T120000Z",
      "DTSTART:20261105T150000Z",
      "DTEND:20261105T160000Z",
      "SUMMARY:Planning",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:away@x",
      "DTSTAMP:20261101T120000Z",
      "DTSTART;VALUE=DATE:20261127",
      "DTEND;VALUE=DATE:20261130",
      "SUMMARY:Planning",
      "STATUS:TENTATIVE",
      "CLASS:PRIVATE",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
  });

  it("escapes text, so a title can't start a property or an event of its own", () => {
    const hostile = "Lunch\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evil\r\nSUMMARY:injected; a, b \\ c";
    const text = writeIcs([event({ title: hostile, location: "Room\nBEGIN:VALARM" })], { prodId: "p", now });
    const [cal] = parseIcs(text);
    expect(cal!.components.filter((c) => c.type === "VEVENT")).toHaveLength(1);
    expect(cal!.components[0]!.components).toEqual([]);
    expect(text).not.toMatch(/\r\nBEGIN:VEVENT\r\nUID:evil/);
    const [read] = readIcs(text, { sourceId: "x", window }).events;
    expect(read!.title).toBe(hostile.replace(/\r\n/g, "\n"));
    expect(read!.location).toBe("Room\nBEGIN:VALARM");
  });

  it("folds lines at 75 octets, never inside a character", () => {
    const title = "Ünïcödé planning session ".repeat(8);
    const text = writeIcs([event({ title })], { prodId: "p", now });
    const encoder = new TextEncoder();
    for (const line of text.split("\r\n")) expect(encoder.encode(line).byteLength).toBeLessThanOrEqual(75);
    expect(text).not.toContain("�");
    expect(readIcs(text, { sourceId: "x", window }).events[0]!.title).toBe(title.trim());
  });

  it("round-trips: readIcs of writeIcs gives the same events (times in UTC, so no zone)", () => {
    for (const name of ["google-overrides.ics", "all-day.ics", "floating.ics", "outlook-windows-tz.ics"]) {
      const original = readIcs(fixture(name), { sourceId: "feed", window }).events;
      expect(original.length).toBeGreaterThan(0);
      const again = readIcs(writeIcs(original, { prodId: "p", now }), { sourceId: "feed", window });
      expect(again.unexpanded).toEqual([]);
      expect(again.events).toEqual(original.map((e) => ({ ...e, timeZone: null })));
    }
  });

  it("writes one copy of an occurrence that appears twice", () => {
    const text = writeIcs([event({ icalUid: "u@x" }), event({ icalUid: "u@x", sourceId: "other" })], { prodId: "p", now });
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});
