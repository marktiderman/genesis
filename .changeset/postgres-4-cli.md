---
"@marktiderman/genesis-cli": minor
---

Moves to postgres.js 4 (`postgres` `^4.1.0`, was `^3.4.9`). `genesis introspect` and the doctor's contract checks connect with it.

**Migration note for code that imports the CLI:** `introspectPostgres(sql: Sql, schemas, options)`, exported from the package root, now takes a postgres.js 4 `Sql`. A pool you pass in must be postgres.js 4.1 or later; a v3 pool still runs but no longer typechecks. Running the `genesis` command needs no change.

From postgres.js 4.1.0 (the floor): `PGSSLMODE` is now honoured. `require` actually uses TLS and fails against a server without it, and `verify-full` verifies, where earlier versions connected in plain text. If you run `genesis introspect` or `genesis doctor` with `PGSSLMODE` set, check that the database accepts TLS.
