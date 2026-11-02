// @feat:calendar-read-layer
import { describe, expect, it } from "vitest";
import { toCalendarEvent } from "./display";
import { applyMarks, markKey } from "./marks";
import { mergeEvents, occurrenceKey, seriesKey, toBusyKey, type PersonEvent } from "./merge";
import { syncWindow } from "./window";

const copy = (person: string, extra: Partial<PersonEvent> = {}): PersonEvent => ({
  personId: person,
  sourceId: `src-${person}`,
  externalRef: `ref-${person}`,
  icalUid: "dinner@x",
  seriesRef: null,
  title: "Dinner",
  visibility: "public",
  start: new Date("2026-11-05T23:00:00.000Z"),
  end: new Date("2026-11-06T00:00:00.000Z"),
  ...extra,
});

describe("mergeEvents", () => {
  it("shows a shared event once, listing everyone on it, whatever zone each copy was written in", () => {
    const merged = mergeEvents([copy("ann"), copy("bob", { start: new Date("2026-11-05T18:00:00-05:00") }), copy("cy")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.people).toEqual(["ann", "bob", "cy"]);
    expect(merged[0]!.key).toBe("dinner@x|2026-11-05T23:00:00.000Z");
  });

  it("normalises a start stored as an ISO string with an offset", () => {
    const fromRow = copy("bob", { start: "2026-11-05T18:00:00-05:00" as unknown as Date });
    expect(occurrenceKey(fromRow)).toBe(occurrenceKey(copy("ann")));
  });

  it("keeps an all-day copy and a timed copy of one UID apart", () => {
    const merged = mergeEvents([copy("ann"), copy("bob", { start: "2026-11-05", end: "2026-11-06" })]);
    expect(merged.map((m) => [m.key, m.allDay])).toEqual([
      ["dinner@x|2026-11-05", true],
      ["dinner@x|2026-11-05T23:00:00.000Z", false],
    ]);
  });

  it("keeps different occurrences of a series apart, and events without a UID per copy", () => {
    const merged = mergeEvents([
      copy("ann", { seriesRef: "s" }),
      copy("ann", { seriesRef: "s", externalRef: "r2", start: new Date("2026-11-12T23:00:00.000Z") }),
      copy("bob", { icalUid: null }),
      copy("cy", { icalUid: null }),
    ]);
    expect(merged.map((m) => m.people)).toEqual([["ann"], ["bob"], ["cy"], ["ann"]]);
  });

  describe("per viewer", () => {
    const rows = [copy("ann", { visibility: "private", title: "Ann's secret" }), copy("bob", { title: "Dinner at Bob's" })];

    it("the owner of a private copy sees it", () => {
      const [m] = mergeEvents(rows, { viewer: "ann" });
      expect(m!.busy).toBe(false);
      expect(m!.event!.title).toBe("Ann's secret");
    });

    it("another attendee sees their own (public) copy, never the private one", () => {
      const [m] = mergeEvents(rows, { viewer: "bob" });
      expect(m!.event!.title).toBe("Dinner at Bob's");
    });

    it("someone on neither copy sees the public copy", () => {
      const [m] = mergeEvents(rows, { viewer: "cy" });
      expect(m!.event!.title).toBe("Dinner at Bob's");
      expect(m!.people).toEqual(["ann", "bob"]);
    });

    it("only private copies: busy for everyone but their owner, and nothing of the title leaks", () => {
      const onlyPrivate = [copy("ann", { visibility: "private", title: "Ann's secret" }), copy("bob", { visibility: "private", title: "Bob's secret" })];
      for (const viewer of ["cy", null]) {
        const [m] = mergeEvents(onlyPrivate, { viewer });
        expect(m!.busy).toBe(true);
        expect(m!.event).toBeNull();
        expect(JSON.stringify(m)).not.toContain("secret");
        // Nor its UID: a busy block's keys are hashed.
        expect(m!.key).toMatch(/^busy:[0-9a-f]{16}$/);
        expect(m!.seriesKey).toMatch(/^busy:[0-9a-f]{16}$/);
        expect(JSON.stringify(toCalendarEvent(m!))).not.toContain("dinner@x");
        expect(JSON.stringify(m)).not.toContain("dinner@x");
        expect(toCalendarEvent(m!).title).toBe("Busy");
      }
      expect(mergeEvents(onlyPrivate, { viewer: "bob" })[0]!.event!.title).toBe("Bob's secret");
    });

    it("takes the app's own rule", () => {
      const [m] = mergeEvents(rows, { viewer: "cy", canSee: () => false });
      expect(m!.busy).toBe(true);
    });
  });

  it("keys days and series", () => {
    const day = copy("ann", { start: "2026-11-26", end: "2026-11-27", seriesRef: "s1" });
    expect(occurrenceKey(day)).toBe("dinner@x|2026-11-26");
    expect(seriesKey(day)).toBe("dinner@x");
    expect(seriesKey({ ...day, icalUid: null })).toBe("s1");
    expect(seriesKey({ ...day, icalUid: null, seriesRef: null })).toBe("src-ann:ref-ann");
  });
});

describe("applyMarks", () => {
  it("stars, hides one and hides a series", () => {
    const rows = [
      copy("ann"),
      copy("ann", { icalUid: "gym@x", seriesRef: "g", externalRef: "g1", start: new Date("2026-11-06T11:00:00.000Z") }),
      copy("ann", { icalUid: "gym@x", seriesRef: "g", externalRef: "g2", start: new Date("2026-11-07T11:00:00.000Z") }),
    ];
    const merged = mergeEvents(rows);
    const marked = applyMarks(merged, [
      { eventKey: markKey("star", rows[0]!), kind: "star", forPersonIds: ["bob"] },
      { eventKey: markKey("hide_series", rows[1]!), kind: "hide_series", forPersonIds: [] },
    ]);
    expect(marked.map((m) => [m.starred, m.hidden])).toEqual([
      [true, false],
      [false, true],
      [false, true],
    ]);
    expect(marked[0]!.starredFor).toEqual(["bob"]);
  });
});

describe("busy keys", () => {
  it("are stable, distinct per key, and marks under the real key still apply", () => {
    expect(toBusyKey("a@x|2026-11-05")).toBe(toBusyKey("a@x|2026-11-05"));
    expect(toBusyKey("a@x|2026-11-05")).not.toBe(toBusyKey("a@x|2026-11-06"));
    const row = copy("ann", { visibility: "private" });
    const [busy] = mergeEvents([row], { viewer: "bob" });
    expect(busy!.key).toBe(toBusyKey(occurrenceKey(row)));
    const [marked] = applyMarks([busy!], [
      { eventKey: markKey("star", row), kind: "star", forPersonIds: [] },
      { eventKey: markKey("hide_series", row), kind: "hide_series", forPersonIds: [] },
    ]);
    expect([marked!.starred, marked!.hidden]).toEqual([true, true]);
  });
});

describe("toCalendarEvent", () => {
  it("gives EventCalendar an inclusive all-day end and the people as lanes", () => {
    const [m] = mergeEvents([copy("ann", { start: "2026-11-27", end: "2026-11-30", title: "Away" }), copy("bob", { start: "2026-11-27", end: "2026-11-30" })]);
    expect(toCalendarEvent(m!)).toEqual({ key: "dinner@x|2026-11-27", title: "Away", start: "2026-11-27", end: "2026-11-29", allDay: true, lanes: ["ann", "bob"], row: m!.event });
  });

  it("keeps a timed end exclusive", () => {
    const [m] = mergeEvents([copy("ann")]);
    expect(toCalendarEvent(m!)).toMatchObject({ start: new Date("2026-11-05T23:00:00.000Z"), end: new Date("2026-11-06T00:00:00.000Z"), allDay: false });
  });
});

describe("syncWindow", () => {
  it("is a week back and six months ahead, on UTC midnights", () => {
    const w = syncWindow(new Date("2026-11-01T15:30:00Z"));
    expect(w.from.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2027-05-03T00:00:00.000Z");
  });
});
