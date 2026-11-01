---
"@marktiderman/genesis-core": minor
---

`genesis-core/dates` gains calendar ranges and recurrence. `startOfMonth`, `addMonths` (clamps to the month's last day), `daysInMonth`, `startOfQuarter`, `addWeeks`, `monthRange`, `quarterRange`, `weeksRange` (1 to 4 weeks from a day, Sunday or Monday first), `monthGridRange` (whole weeks covering a month), `eachDay`, and `rangeIn` (a range of days as instants on a zone's clock). `instantIn` and `wallTimeIn` convert between a wall time and an instant, with RFC 5545's rules for skipped and repeated hours. `parseRRule` and `expandRecurrence` expand a repeating series (FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY with positions, BYMONTHDAY, BYMONTH, WKST, EXDATE) into a required window (at most 1,000 occurrences by default); any other part throws a `RangeError` naming it, keeping the series' wall time across daylight saving. No dependencies.
