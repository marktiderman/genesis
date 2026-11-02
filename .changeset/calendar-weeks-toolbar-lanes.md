---
"@marktiderman/genesis-ui": minor
---

ResourceView's calendar mode: a weeks switch, a toolbar slot, all-day rows stored as UTC midnight, and a colour per lane.

- `calendar.weeksOptions` (`[1, 2, 4]`) adds a weeks switch beside `layouts`' switch, for every layout but `month`. Its pick is kept as the layout's is: with `onWeeksChange` the screen owns it (`weeks`), else the calendar does. Opt-in.
- `calendar.toolbar` puts the screen's own controls (a Print button, a mode switch) beside the switches: a node, or a function given `{ layout, weeks, anchor }` (`ResourceCalendarToolbarState`). Opt-in.
- Bug fix: an all-day row (`allDayField` true) stored as instants at UTC midnight, as Google's API and most sources write one, showed on the day before for a viewer behind UTC. Such a row is now read on UTC, so it stays on its day on every clock, and the window asks for a day more each side so one on its edge loads. Rows stored as days were already right and are drawn with no zone arithmetic; other all-day instants (midnights on the viewer's clock) still read on the viewer's clock.
- `laneColor(i)` (`/data`): a distinct, theme-aware colour for any lane index. The five chart tokens first, then colours made from them in OKLCH and deepened toward `--foreground`, so lane six no longer repeats lane one and contrast against the background rises rather than falls. EventCalendar's `colorLanes` (and the calendar's `colorLanes`) gives each lane with no colour of its own `laneColor(i)`; off by default, so nothing changes until a screen turns it on.
