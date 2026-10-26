---
"@marktiderman/genesis-cli": minor
---

`genesis doctor` adds the `iso-date-slice` rule, a warning. It flags a day cut from an ISO timestamp (`toISOString().slice(0, 10)`, `.substring(0, 10)`, `.split("T")[0]` and the like). That is the day in UTC, not the person's. Use `personDay` or `dayIn` from `@marktiderman/genesis-core/dates` instead. Test files are skipped. Where UTC is what you mean, allow it with a reason.
