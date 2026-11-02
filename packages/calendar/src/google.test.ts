// @feat:calendar-read-layer
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOKEN = "ya29.test-token-7f3c";
import { fromGoogleEvent, GoogleCalendarError, syncGoogleCalendar } from "./google";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")) as unknown;
const window = { from: new Date("2026-10-25T00:00:00Z"), to: new Date("2027-05-01T00:00:00Z") };

function fakeGoogle(pages: ((url: URL) => { status?: number; body?: unknown })[]) {
  const calls: URL[] = [];
  const fetch = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect((init?.headers as Record<string, string>)["authorization"]).toMatch(/^Bearer \S+$/);
    const page = pages.shift();
    if (!page) throw new Error("unexpected call");
    const { status = 200, body = {} } = page(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const event = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  iCalUID: `${id}@google.com`,
  summary: `Event ${id}`,
  start: { dateTime: "2026-11-05T09:00:00-05:00", timeZone: "America/New_York" },
  end: { dateTime: "2026-11-05T10:00:00-05:00" },
  ...extra,
});

describe("fromGoogleEvent", () => {
  it("maps a timed recurring instance", () => {
    expect(fromGoogleEvent("s", event("a_20261105", { recurringEventId: "a", visibility: "confidential", location: "Gym" }))).toEqual({
      sourceId: "s",
      externalRef: "a_20261105",
      icalUid: "a_20261105@google.com",
      seriesRef: "a",
      title: "Event a_20261105",
      location: "Gym",
      allDay: false,
      start: new Date("2026-11-05T14:00:00.000Z"),
      end: new Date("2026-11-05T15:00:00.000Z"),
      timeZone: "America/New_York",
      recurring: true,
      visibility: "private",
      status: "confirmed",
    });
  });
  it("maps an all-day event and drops cancelled or mixed ones", () => {
    expect(fromGoogleEvent("s", { id: "d", start: { date: "2026-11-26" }, end: { date: "2026-11-27" } })).toMatchObject({
      allDay: true,
      start: "2026-11-26",
      end: "2026-11-27",
      title: "",
    });
    expect(fromGoogleEvent("s", { id: "x", status: "cancelled" })).toBeNull();
    expect(fromGoogleEvent("s", { id: "m", start: { date: "2026-11-26" }, end: { dateTime: "2026-11-26T10:00:00Z" } })).toBeNull();
  });
});

describe("syncGoogleCalendar", () => {
  it("reads the window in full, following pages, and keeps the sync token (recorded pages)", async () => {
    const g = fakeGoogle([() => ({ body: fixture("google-full-page-1.json") }), () => ({ body: fixture("google-full-page-2.json") })]);
    const out = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "me@x.test", sourceId: "s", window, fetch: g.fetch });
    expect(out.full).toBe(true);
    expect(out.events.map((e) => [e.externalRef, e.visibility, e.status])).toEqual([
      ["4kfixtureweekly_20261102T230000Z", "public", "confirmed"],
      ["7qfixtureoneoff", "private", "confirmed"],
      ["9zfixtureallday", "public", "tentative"],
    ]);
    expect(out.events[0]).toMatchObject({ seriesRef: "4kfixtureweekly", recurring: true, start: new Date("2026-11-02T23:00:00.000Z") });
    expect(out.events[2]).toMatchObject({ allDay: true, start: "2026-11-27", end: "2026-11-30" });
    expect(out.syncToken).toBe("CPDAlvWDx70CEPDAlvWDx70CGAUggICAgICAgA==");
    expect(g.calls[0]!.pathname).toBe("/calendar/v3/calendars/me%40x.test/events");
    expect(g.calls[0]!.searchParams.get("singleEvents")).toBe("true");
    expect(g.calls[0]!.searchParams.get("timeMin")).toBe("2026-10-25T00:00:00.000Z");
    expect(g.calls[0]!.searchParams.get("timeMax")).toBe("2027-05-01T00:00:00.000Z");
    expect(g.calls[1]!.searchParams.get("pageToken")).toBe("CigKGjRrZml4dHVyZXBhZ2Vfb25lGAEggICA");
  });

  it("reads only changes with a sync token: cancelled ones and ones outside the window as removed (recorded page)", async () => {
    const g = fakeGoogle([() => ({ body: fixture("google-incremental.json") })]);
    const out = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "c", sourceId: "s", syncToken: "t1", window, fetch: g.fetch });
    expect(out.full).toBe(false);
    expect(out.events.map((e) => [e.externalRef, e.title])).toEqual([["7qfixtureoneoff", "Dentist (moved)"]]);
    expect(out.removed).toEqual(["4kfixtureweekly_20261109T230000Z", "2bfixturefarfuture", "5cfixtureoldpast", "8dfixturedeleted"]);
    // A cancelled instance names its series; a cancelled item with none may be a whole series.
    expect(out.removedSeries).toEqual(["8dfixturedeleted"]);
    expect(out.syncToken).toBe("CKCbr5iEx70CEKCbr5iEx70CGAUggICAgICAgA==");
    // A sync token can't go with timeMin/timeMax (Google answers 400): the window is applied here.
    expect(g.calls[0]!.searchParams.get("syncToken")).toBe("t1");
    expect(g.calls[0]!.searchParams.has("timeMin")).toBe(false);
    expect(g.calls[0]!.searchParams.has("timeMax")).toBe(false);
  });

  it("keeps what it read when it stops at maxPages, and resumes from there", async () => {
    const g = fakeGoogle([
      () => ({ body: fixture("google-full-page-1.json") }),
      () => ({ body: fixture("google-full-page-2.json") }),
    ]);
    const first = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "c", sourceId: "s", window, fetch: g.fetch, maxPages: 1 });
    expect(first).toMatchObject({ full: true, complete: false, syncToken: null, resume: { pageToken: "CigKGjRrZml4dHVyZXBhZ2Vfb25lGAEggICA", syncToken: null } });
    expect(first.events).toHaveLength(2);
    const rest = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "c", sourceId: "s", syncToken: "ignored", window, fetch: g.fetch, maxPages: 1, resume: first.resume });
    expect(rest).toMatchObject({ full: true, complete: true, resume: null, syncToken: "CPDAlvWDx70CEPDAlvWDx70CGAUggICAgICAgA==" });
    expect(rest.events.map((e) => e.externalRef)).toEqual(["9zfixtureallday"]);
    expect(g.calls[1]!.searchParams.get("pageToken")).toBe("CigKGjRrZml4dHVyZXBhZ2Vfb25lGAEggICA");
    expect(g.calls[1]!.searchParams.has("syncToken")).toBe(false);
  });

  it("stops at its signal: the pages read come back to resume, and none read throws aborted", async () => {
    const controller = new AbortController();
    const g = fakeGoogle([
      () => {
        controller.abort();
        return { body: fixture("google-full-page-1.json") };
      },
    ]);
    const first = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "c", sourceId: "s", window, fetch: g.fetch, signal: controller.signal });
    expect(first).toMatchObject({ complete: false, syncToken: null, resume: { pageToken: "CigKGjRrZml4dHVyZXBhZ2Vfb25lGAEggICA" } });
    expect(g.calls).toHaveLength(1);

    const none = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "c", sourceId: "s", window, fetch: fakeGoogle([]).fetch, signal: controller.signal }).catch((e: unknown) => e);
    expect(none).toBeInstanceOf(GoogleCalendarError);
    expect((none as GoogleCalendarError).code).toBe("aborted");
  });

  it("reads an event left at the calendar's default visibility as the caller says", () => {
    const e = event("v", { visibility: "default" });
    expect(fromGoogleEvent("s", e)!.visibility).toBe("public");
    expect(fromGoogleEvent("s", e, { defaultVisibility: "private" })!.visibility).toBe("private");
    expect(fromGoogleEvent("s", event("w"), { defaultVisibility: "private" })!.visibility).toBe("private");
    expect(fromGoogleEvent("s", event("p", { visibility: "public" }), { defaultVisibility: "private" })!.visibility).toBe("public");
  });

  it("starts over with a full read when the token is gone (recorded 410)", async () => {
    const g = fakeGoogle([() => ({ status: 410, body: fixture("google-410.json") }), () => ({ body: { items: [event("a")], nextSyncToken: "t9" } })]);
    const out = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "c", sourceId: "s", syncToken: "old", window, fetch: g.fetch });
    expect(out).toMatchObject({ full: true, syncToken: "t9" });
    expect(g.calls[1]!.searchParams.has("syncToken")).toBe(false);
    expect(g.calls[1]!.searchParams.get("timeMin")).toBe("2026-10-25T00:00:00.000Z");
  });

  it("names a refused token, a lost calendar and a busy Google, never the token", async () => {
    for (const [status, code] of [
      [401, "unauthorized"],
      [404, "not_found"],
      [403, "forbidden"],
      [503, "unavailable"],
      [400, "bad_response"],
    ] as const) {
      const g = fakeGoogle([() => ({ status })]);
      const error = await syncGoogleCalendar({ accessToken: TOKEN, calendarId: "c", sourceId: "s", window, fetch: g.fetch }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GoogleCalendarError);
      expect((error as GoogleCalendarError).code).toBe(code);
      expect(String((error as Error).message)).not.toContain(TOKEN);
    }
  });
});
