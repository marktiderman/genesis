---
"@marktiderman/genesis-studio-server": minor
---

Moves to postgres.js 4 (`postgres` `^4.1.0`, was `^3.4.9`) for the pools Studio opens from a connection string.

**A pool you pass in can be postgres.js 3.4 or 4.** `createPostgresDatabase(connection)` and the outbox worker's `database` now take a `PostgresPool`, typed by the methods Studio calls on it (`begin`, `unsafe`, `end`, and a transaction's `unsafe` and `savepoint`), instead of the dependency's own `postgres.Sql`. A v3 or a v4 pool typechecks without a cast; passing a connection string needs no change. `PostgresPool` and `PostgresTransaction` are exported. `PostgresOptions.ssl`, which applies only to the pool Studio opens, still names postgres.js 4's `ssl` option.

A pool you pass in keeps its own version's behaviour. What postgres.js 4 changes for an app on it:

- Parameters are sent untyped (`infer: false` by default), so the server types them. Studio's own queries cast every parameter through text (`$1::text::uuid`) and run each transaction in UTC, so they behave as before; check your own queries that pass a `Date`, boolean, Buffer or bigint, and a `Date` for a `timestamp` or `date` column in a session that isn't in UTC.
- A transaction the server rolled back now rejects, and an unsafe `BEGIN` outside `sql.begin` is rejected.
- A query that can't be built or serialized now aborts its transaction, where v3 skipped it. Inside a savepoint (Studio's bulk writes and imports run each row in one) it fails only that savepoint.
- postgres.js 4 is ESM only (Node 20.19+ or 22.12+, which this package's engines already require).

Fixed: Studio's own pool now sends a JS `Date` parameter as its UTC instant. It sent `String(date)` (`… GMT-0500 (Eastern Standard Time)`), which Postgres refused wherever the parameter reached it untyped. A `Date` written to a `date` column stores the UTC calendar day of its instant, so a local midnight east of UTC (in Tokyo, say) is stored as the day before; pass a `YYYY-MM-DD` string to store a local day.

From postgres.js 4.1.0 (the floor): `PGSSLMODE` is now honoured. `require` actually uses TLS and fails against a server without it, and `verify-full` verifies, where 4.0 and earlier connected in plain text. Check `PGSSLMODE` in any environment that sets it before you upgrade. 4.1.0 also fixes a prepared-statement cache that kept every query's values and rows (about 1.1 GB with 10 connections); Studio's own pool sets `prepare: false`, but a v4 pool you pass in should be 4.1 or later.
