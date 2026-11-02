# @marktiderman/genesis-calendar

## 0.1.1

### Patch Changes

- f0643a9: New package, `@marktiderman/genesis-calendar`: the calendar read layer (ADR 0014). `syncGoogleCalendar` (full, then incremental with the sync token, filtered to the window), `readIcs` and `writeIcs`, `mergeEvents` with per-viewer privacy, marks, `toCalendarEvent` for EventCalendar, and `fetchFeed` on `/fetch` through genesis-media's guarded fetch. Its first version, 0.1.0, is published by hand (docs/RELEASING.md, "A brand-new package"); this patch is the first CI release.
