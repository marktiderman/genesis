---
"@marktiderman/genesis-core": minor
---

`/errors` (also exported from the root): one way for every package to report a caught error, and one way to say what kind of error it is.

- `reportError(error, context)` sends an error a package caught and handled to the host's reporter (`setErrorReporter`, which returns the undo). With none registered it is written with `console.warn` in development and dropped in production. It never throws; the reporter is shared through `globalThis`, so two copies of the package still agree.
- `classifyError(error)` returns `{ kind, message, report }`: `offline`, `unauthenticated`, `forbidden`, `not-found`, `conflict`, `invalid` or `unexpected`, built on the read and write outcomes (`DataWriteError`, `DataReadError`, Postgres and PostgREST codes), HTTP statuses, Supabase's auth and fetch errors and each runtime's "network request failed". `message` is a safe sentence from `errorMessages` (reword with `{ messages }`), never the error's own text; `report` is true only for what is worth a crash report.
