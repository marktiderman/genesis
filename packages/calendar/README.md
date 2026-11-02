# @marktiderman/genesis-calendar

The calendar read layer: what is on these people's calendars, merged. Google Calendar's
incremental sync, an iCal feed reader and writer, one event across people's copies with
per-viewer privacy, marks, and the mapping to genesis-ui's `EventCalendar`.

Pure TypeScript: no storage, no OAuth, no React. The app keeps the rows and runs the sync; tokens
come from [genesis-connect](../connect); recurrence is [core/dates](../core)'
`expandRecurrence`. Decision record: [ADR 0014](../../docs/adr/0014-calendar-read-layer.md).

```bash
pnpm add @marktiderman/genesis-calendar @marktiderman/genesis-core
# for fetchFeed only:
pnpm add @marktiderman/genesis-media
```

## The event

`CalendarEvent` is core/dates' `EventOccurrence` (title, location, `allDay`, `start`/`end` as a
`Day` or a `Date`, the end exclusive, `timeZone`, `recurring`, `visibility`, `status`) plus where
it came from: `sourceId`, `externalRef` (the source's id for the occurrence), `icalUid` (the same
on every attendee's copy) and `seriesRef`. A recurring event is one per occurrence; a cancelled
one is removed, never kept.

## Google Calendar

```ts
import { syncGoogleCalendar, syncWindow } from "@marktiderman/genesis-calendar";

const result = await syncGoogleCalendar({
  accessToken, // genesis-connect's accessToken, read-only calendar scope
  calendarId: "primary",
  sourceId: source.id,
  syncToken: source.sync_token, // null the first time
  window: syncWindow(),
});
// result.full: replace the source's stored events with result.events.
// otherwise: upsert result.events, delete result.removed, keep result.syncToken.
```

The first read asks Google for the window with series expanded (`singleEvents=true`); later
reads send the sync token and get only changes. Google won't take a window beside a sync token,
so those changes can be anywhere on the calendar: they are filtered to the window, and a
cancellation or a change that left the window is in `removed`. A token Google has dropped (410)
reads the window in full again. A cancelled item that isn't a series instance may be a whole
series deleted: it is also in `removedSeries`, so delete the occurrences whose `seriesRef` it is.
A read past `maxPages` (100) returns `complete: false` and a `resume` to pass back: apply what it
read (for a full read, upsert only), keep no token, and call again. Events at the calendar's
default visibility read as `defaultVisibility` (default `"public"`; pass `"private"` for a
calendar shared as free/busy only). Failures are `GoogleCalendarError` with a `code`
(`unauthorized`, `forbidden`, `not_found`, `unavailable`, `bad_response`).

## iCal feeds

```ts
import { readIcs } from "@marktiderman/genesis-calendar";
import { fetchFeed } from "@marktiderman/genesis-calendar/fetch";

const text = await fetchFeed(openSecret(source.sealed_url)); // server only
const { events, truncated, unexpanded } = readIcs(text, { sourceId: source.id, window: syncWindow() });
```

`readIcs` expands RRULE through core/dates, honours EXDATE, RDATE and RECURRENCE-ID (moved and
cancelled occurrences), and reads TZID as IANA, Windows (`Pacific Standard Time`) or
vendor-prefixed names; floating times use `X-WR-TIMEZONE`, else `defaultZone`, else UTC.

- **`truncated`**: a cap cut the list (`maxEvents`, default 10,000 VEVENTs;
  `maxOccurrencesPerSeries`, 1,000; `maxOccurrences`, 50,000).
- **`unexpanded`**: UIDs of series whose rule core/dates doesn't expand (BYSETPOS, BYHOUR,
  sub-daily…). Each shows its first occurrence, its RDATEs and its overrides, never a guess.
- A feed over `maxBytes` (5 MiB) throws a `RangeError`; anything else malformed is skipped.

`fetchFeed(link, { maxBytes, timeoutMs })` reads `webcal://` as https, refuses anything else
and credentials in the URL, and goes through genesis-media's guarded fetch (public addresses
only, checked at connect time; redirects checked and never down to http; a size cap and a
timeout). A secret iCal link is a credential: seal it with genesis-connect's `createSecrets`;
this package never logs it and no `CalendarFeedError` names it. Passing a custom `transport`
turns off the connect-time address guard: it must check every address it connects to itself.

### Publishing a feed

```ts
import { writeIcs } from "@marktiderman/genesis-calendar";

const body = writeIcs(events, { prodId: "-//Acme//Schedule//EN", calendarName: "Acme schedule" });
return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8" } });
```

Every text value is escaped and every line folded at 75 octets, so nothing in an event can add a
line of its own. Times are written in UTC (or as days); occurrences of a series share their UID
with a RECURRENCE-ID each. `readIcs(writeIcs(events))` gives the events back.

## Merging people's calendars

```ts
import { applyMarks, mergeEvents, toCalendarEvent } from "@marktiderman/genesis-calendar";

const rows = stored.map((r) => ({ ...toEvent(r), personId: r.person_id }));
const merged = mergeEvents(rows, { viewer: me.personId });
const marked = applyMarks(merged, marks).filter((e) => !e.hidden);
<EventCalendar events={marked.map((e) => toCalendarEvent(e))} lanes={people} />;
```

- One event per `icalUid` and start: a timed start as its UTC instant (copies written in
  different zones merge), an all-day start as its day. An all-day and a timed copy of one UID
  stay two events.
- **Per viewer**: the details shown come only from a copy the viewer may see (default: a public
  copy, or their own; pass `canSee` for your own rule). With none, `busy` is true and `event` is
  null, so a private title never reaches them. `toCalendarEvent` titles it "Busy". Its `key` and
  `seriesKey` are `toBusyKey` hashes, not the UID (not a secret: a known UID can be hashed and
  compared); marks stored under the real keys still apply. Who has a copy (`people`) is shown
  for busy blocks too.
- `occurrenceKey` and `seriesKey` are the keys marks store; build the same strings in SQL if
  your database keys rows by them.
- Marks: `star`, `hide`, `hide_series`, each with `forPersonIds` (empty: everyone).
- `toCalendarEvent` gives EventCalendar's shape (`key`, `title`, `start`, `end`, `allDay`,
  `lanes`), with the all-day end made inclusive as EventCalendar expects.

## Your own rows as a source

```ts
import type { CalendarSourceAdapter } from "@marktiderman/genesis-calendar";

export const sessionsSource: CalendarSourceAdapter<SessionRow> = (rows, window) =>
  rows.map((s) => ({ sourceId: "sessions", externalRef: s.id, icalUid: `session-${s.id}@acme.example`, /* … */ }));
```

The adapter lives with the rows' package. Expand a series with core/dates' `expandRecurrence`,
and publish it with `writeIcs` over the adapter's events, so the view and the feed agree.

## Doctor rule

`calendar/calendar-reads-use-genesis-calendar` (warn) flags Google's events endpoint, a
hand-written `BEGIN:VCALENDAR`/`BEGIN:VEVENT`, and iCal libraries (`node-ical`, `ical.js`,
`ical`, `ical-expander`, `ical-generator`, `ics`) in app code, tests and fixtures aside.
