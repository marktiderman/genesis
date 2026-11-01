---
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-core": patch
---

Calendar follow-ups. A `layout` or `anchor` that isn't valid (a hand-edited URL) shows the month and today, with a warning in development (once per value), instead of crashing; configuration mistakes still throw. ResourceCalendar loads rows starting in the window and rows running into it as one query that neither overlaps nor misses anything, so a zero-length event at the window's first midnight is fetched and two windows' rows never mix. `expandRecurrence` checks `until` on a rule object and carries an `at` start's milliseconds to every occurrence. `genesis-core/errors` exports `isDevelopment()` for development-only hints. Its production check now works in Vite and webpack builds: it reads the literal `process.env.NODE_ENV` they replace, so a production browser build no longer counts as development (this also quiets the default error reporter there).
