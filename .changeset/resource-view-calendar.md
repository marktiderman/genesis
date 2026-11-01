---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-studio": patch
---

ResourceView gains a calendar mode: `<ResourceView view={v} mode="calendar" calendar={{ field: "starts_at" }} />` places a view's rows by a date or timestamp field in a month grid, 1 to 4 weeks, a printable day-by-day agenda, or one lane per person. It asks the provider for the visible window only, inside the viewer's scope; shows an event that spans days on each day, all-day events first; draws a dot per person (named for screen readers); moves between days with the arrow keys; and opens the list's peek on click (or `calendar.onSelect`). `EventCalendar` and its placement helpers (`calendarWindow`, `placeEvents`, `readEventTime`, `windowBounds`…) are exported from `/data` for events that aren't one view's rows. Studio's month calendar is now drawn by `EventCalendar`.
