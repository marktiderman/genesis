# ADR 0014: genesis-calendar, the calendar read layer

- Status: proposed
- Date: 2026-11-01
- Features: `calendar-read-layer`, `person-day`, `resource-view-calendar`, `connect`
- Related: ADR 0005 (layers), ADR 0012 (genesis-media), ADR 0013 (upgrades plug in through
  ports); core/dates (`expandRecurrence`), genesis-ui `EventCalendar`, genesis-connect

## Context

A person's week lives in several places: a provider calendar (Google), secret iCal links (a
school, a league, a club) and whatever an app schedules itself. An app that shows several
people's weeks together needs all of it in one view: each person's calendars, an event once
however many of them are on it, a private event as a busy block, and the group's own notes on
events (star this, hide that series), on screen and printed.

A consumer app built this as a local, app-agnostic package and asked for it in Genesis, to use
in several apps. Genesis already has the pieces around it: core/dates (calendar ranges and
`expandRecurrence`, RFC 5545's RRULE subset, returning `{ occurrences, truncated }`);
genesis-ui's `EventCalendar` (month, 1 to 4 weeks, agenda, lanes) and `ResourceView
mode="calendar"`; genesis-connect (Google OAuth with read-only scopes, `accessToken`,
`createSecrets`); genesis-media's server `fetchGuarded`.

`pnpm features find calendar` finds `resource-view-calendar` (draws a view's own rows, reads no
outside calendar), `person-day` (core/dates: expands one rule, reads no feed) and `connect` (gets a token,
reads no events). None reads Google's events or an iCal feed, merges people's copies, or keeps
marks: reuse and extension don't reach it (G1, G2); it is an invention promoted from an app (G4).

## Decision

1. **A new package, `@marktiderman/genesis-calendar`**, layer `primitive`, group `data`, starting
   at 0.1.0. It is the read layer: "what is on these people's calendars, merged". Pure
   TypeScript, no storage, no React. Entries: `.` (runs anywhere) and `/fetch` (server only).
2. **One occurrence type, in core/dates.** `EventOccurrence` (title, location, `allDay`, `start`
   and `end` as a `Day` or a `Date` with an exclusive end, `timeZone`, `recurring`,
   `visibility`, `status`) is added to `@marktiderman/genesis-core/dates`, beside
   `expandRecurrence`, additive and type only. genesis-calendar's `CalendarEvent` extends it with
   source fields only: `sourceId`, `externalRef`, `icalUid`, `seriesRef`. Public names are
   camelCase; snake_case belongs to apps' rows.
3. **What it owns:**
   - **Sources**, each turning its input into `CalendarEvent`s for a window:
     - `syncGoogleCalendar({ accessToken, calendarId, sourceId, syncToken, window, fetch })`: a
       full read of the window with Google expanding series (`singleEvents=true`), then
       incremental with the sync token. Google refuses `timeMin`/`timeMax` beside a sync token,
       so incremental pages carry changes anywhere on the calendar: they are filtered to the
       window here, and a cancellation or a change that left the window comes back in `removed`.
       410 reads in full again; paging is bounded; errors are typed (`unauthorized`,
       `forbidden`, `not_found`, `unavailable`, `bad_response`).
     - `readIcs(text, { sourceId, window, defaultZone })`: parses a feed's text, expands RRULE
       through `expandRecurrence`, honours EXDATE, RDATE and RECURRENCE-ID (moved and
       cancelled), reads TZID as IANA, Windows and vendor-prefixed names. It returns
       `{ events, truncated, unexpanded }`: one result, so a caller can't miss that a cap cut the
       list. A rule core/dates refuses (BYSETPOS, BYHOUR…) never throws: the series shows its
       first occurrence and its UID is in `unexpanded`. Input is bounded: a byte cap (throws), an
       event cap, a per-series and a total occurrence cap (reported as `truncated`), and a
       nesting depth past which components are skipped.
     - **`CalendarSourceAdapter<Row>`** (`(rows, window) => CalendarEvent[]`) for anything else,
       such as an app's own sessions. The adapter lives with the rows' package, which depends on
       genesis-calendar, never the reverse.
   - **`writeIcs(events, { prodId, calendarName })`**: the other direction, so an app can publish
     what it schedules as a link people subscribe to. RFC 5545 text escaping and folding at 75
     octets, so no value can add a line, a property or a component. It writes occurrences (a
     shared UID gets a RECURRENCE-ID), not rules.
   - **`mergeEvents(rows, { viewer, canSee })`**: one event per (`icalUid`, normalised start)
     across people's copies, a timed start as its UTC instant so copies written in different
     zones merge, an all-day start as its day. An all-day copy and a timed copy of one UID stay
     two events. **Visibility is per viewer:** the details shown come only from a copy that
     viewer may see (by default, a public copy or their own); with none, the event is busy and
     carries no title or place. `occurrenceKey` and `seriesKey` are the keys an app's database
     builds the same way.
   - **Marks**: `star`, `hide`, `hide_series` keyed by those keys, each with who it is for;
     `applyMarks`.
   - **`syncWindow`**: a week back and six months ahead.
   - **`toCalendarEvent`**: a merged event as EventCalendar takes it (`key`, `title`, `start`,
     `end`, `allDay`, `lanes` as the people), without importing genesis-ui. EventCalendar's
     all-day end is inclusive and `EventOccurrence`'s exclusive, so this mapping stays until
     EventCalendar takes `EventOccurrence` itself, a later change in genesis-ui.
   - **`fetchFeed(link, options)`** on `/fetch`: `webcal://` read as https, https only, no
     credentials in the URL, a 5 MiB cap and a timeout, through genesis-media's `fetchGuarded`
     (public addresses only, checked when the socket connects; redirects checked, never down to
     http). genesis-media is an **optional peer**, loaded with `import()` on first use (ADR 0012,
     ADR 0013): an app that never fetches never installs it. The link is a credential: never
     logged, and no error names it.
4. **What it doesn't own:** storage (each app keeps its rows and row security); OAuth and tokens
   (genesis-connect: the app seals a feed link with `createSecrets` and passes Google's access
   token in); the job that runs syncs and when; bookings, attendance and running an event
   (a scheduling package's).
5. **Recurrence is core/dates'.** No second RRULE expander: readIcs and any sessions adapter
   expand through `expandRecurrence`, and an app's feed out is `writeIcs` over the adapter's
   events, so the two never disagree about an occurrence.
6. **Doctor rule** `calendar-reads-use-genesis-calendar` (warn): Google's events endpoint
   (`googleapis.com/calendar/v3/calendars/…`, `calendar.events.list(`), hand-written iCal
   (`BEGIN:VCALENDAR`, `BEGIN:VEVENT`) and iCal libraries (`node-ical`, `ical.js`, `ical`,
   `ical-expander`, `ical-generator`, `ics`) point at this package. Tests and fixtures are left
   out, and a plain link to a calendar page or a `webcal://` URL doesn't fire.

## Glossary

- **occurrence**: one dated instance of an event; a repeating series has many. Not "instance"
  in APIs.
- **calendar source**: one calendar an event comes from (a provider's calendar, an iCal feed, an
  app's own rows through an adapter). A **feed** is only the iCal kind.
- **mark**: a note people put on an occurrence or a series (star, hide, hide the series). Not
  "tag" or "flag".

## Alternatives

- **Keep it in the app.** Lost: other apps want the same reading and merging.
- **Put it in genesis-connect.** Lost: connect is OAuth and secrets for any provider; iCal feeds
  and merging aren't connections, and a scheduling package would then depend on connect to show
  a calendar.
- **Fold it into a scheduling (sessions) package.** Lost: that is a write model with bookings
  and row security; this read layer is pure functions an app without sessions also wants. The
  adapter seam keeps a later merge possible without a rename for apps.
- **Its own event type, apart from core/dates.** Lost: readers, writers and EventCalendar would
  each keep a shape; one type in core/dates is what they converge on.
- **`readIcs` returning only the events, with a second function for the report.** Lost: two ways
  to do one thing, and the easy one hides truncation.

## Consequences

- The consumer app replaces its local package with this one once 0.1.0 is published; its tables,
  sync job and pages stay, its imports change (snake_case rows map to camelCase events).
- The first publish of a new package is by hand (docs/RELEASING.md); its patch changeset lets CI
  publish the next version, and the version PR merges within 48 hours of the hand publish.
- genesis-core gets a minor release for `EventOccurrence`; genesis-calendar's peer range on core
  rises to that release once it is out.
- Later: EventCalendar takes `EventOccurrence` (then `toCalendarEvent` shrinks to adding lanes);
  `writeIcs` may write RRULE when a source hands it a series; a reference migration for an app's
  rows may ship as a block.
