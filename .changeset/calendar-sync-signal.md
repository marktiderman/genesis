---
"@marktiderman/genesis-calendar": minor
---

`syncGoogleCalendar` takes a `signal`, for a job with a deadline. Once the signal aborts, no new page starts and a page still loading is dropped. The pages already read come back as `complete: false` with a `resume`, as at `maxPages`. If it aborts before any page is read, the call throws `GoogleCalendarError` with the new code `aborted`.
