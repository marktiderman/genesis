# @marktiderman/genesis-calendar

## 0.1.2

### Patch Changes

- 859efaa: `syncGoogleCalendar` takes a `signal`, for a job with a deadline. Once the signal aborts, no new page starts and a page still loading is dropped. The pages already read come back as `complete: false` with a `resume`, as at `maxPages`. If it aborts before any page is read, the call throws `GoogleCalendarError` with the new code `aborted`.

## 0.1.1

### Patch Changes

- f0643a9: New package, `@marktiderman/genesis-calendar`: the calendar read layer (ADR 0014). `syncGoogleCalendar` (full, then incremental with the sync token, filtered to the window), `readIcs` and `writeIcs`, `mergeEvents` with per-viewer privacy, marks, `toCalendarEvent` for EventCalendar, and `fetchFeed` on `/fetch` through genesis-media's guarded fetch. Its first version, 0.1.0, is published by hand (docs/RELEASING.md, "A brand-new package"); this patch is the first CI release.
