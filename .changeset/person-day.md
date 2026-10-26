---
"@marktiderman/genesis-core": minor
---

`@marktiderman/genesis-core/dates`: calendar days on the right clock.

- `personDay(person)` is today in the person's saved zone, else the device's, else UTC.
- `dayIn`, `wallClock`, `startOfDayIn` and `dayRangeIn` give a day's instants. They handle 23- and 25-hour days, and a midnight that doesn't exist.
- `addDays`, `daysBetween`, `weekdayOf`, `startOfWeek` and `isDay` do `YYYY-MM-DD` arithmetic.

No dependencies.
