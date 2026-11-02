---
"@marktiderman/genesis-core": patch
---

`genesis-core/dates` fixes from the 2.5.0 review:
- **Recurrence:** a series that began more than 400 years before the window is found, and a sparse rule whose INTERVAL doesn't divide 400 years (`FREQ=YEARLY;INTERVAL=300` on 29 February) keeps going: the no-match guard now counts empty periods over the calendar's full cycle. A weekly series in late 9999 stops at the year's end instead of throwing.
- **Rules:** a UTC UNTIL with an out-of-range time is refused. A BYMONTH and BYMONTHDAY that never meet (`BYMONTH=2;BYMONTHDAY=30`) are refused when parsed, and sparse daily rules run fast. Rule objects whose BYDAY, BYMONTHDAY or BYMONTH isn't a list, or is empty, are refused. So are an invalid EXDATE and an invalid `start.at`. Instant EXDATEs match to the second.
- **Years 1 to 99** are real days everywhere: `Date.UTC` had read them as 1900 to 1999.
- **`readEventTime`:** throws for an unknown `timeZone`, gives a `Date`'s day with `dateOnly`, reads `z` and offsets with seconds, and truncates fractions the same way in every branch.
- **`defineView`:** checks the calendar block at run time (an object, with `field`, and only calendar keys). Its doc comment and `RecurrenceStart`'s are restored.

Also notes exports earlier changesets left out: `isDevelopment` (genesis-core/errors, added in a patch), and `calendarProblems`, `ViewCalendar` and `ViewCalendarLayout` (genesis-core/resource-view, with the calendar mode).
