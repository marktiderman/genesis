---
"@marktiderman/genesis-cli": minor
---

Moves to postgres.js 4 (`postgres` `^4.1.0`, was `^3.4.9`). `genesis introspect` and the doctor's contract checks connect with it. Running the `genesis` command needs no change.

**For code that imports the CLI:** `introspectPostgres(sql, schemas, options)`, exported from the package root, now takes an `IntrospectSql`: any object with postgres.js's `unsafe(query, parameters)`, so a postgres.js 3.4 or 4 pool fits without a cast. `IntrospectSql` is exported. Introspection now sends its catalog queries through `unsafe` with one text parameter each, so it reads the same under either version.

From postgres.js 4.1.0 (the floor): `PGSSLMODE` is now honoured. `require` actually uses TLS and fails against a server without it, and `verify-full` verifies, where earlier versions connected in plain text. If you run `genesis introspect` or `genesis doctor` with `PGSSLMODE` set, check that the database accepts TLS.
