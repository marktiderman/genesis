---
"@marktiderman/genesis-studio-server": minor
---

Moves to postgres.js 4 (`postgres` `^4.1.0`, was `^3.4.9`). The public types now come from postgres.js 4: `createPostgresDatabase(connection: string | postgres.Sql)`, the outbox's `database: string | postgres.Sql` and `PostgresOptions.ssl`. **A pool you pass in must be postgres.js 4.1 or later.** A v3 pool still runs, on v3's behaviour, but no longer typechecks (`TS2345 … missing stats, close`). Passing a connection string needs no change.

What changes for an app that passes its own pool, from postgres.js 4:

- Parameters are sent untyped (`infer: false` by default), so the server types them. Studio's own queries cast every parameter (`$1::text::uuid`) and behave as before; check your own queries that pass a `Date`, boolean, Buffer or bigint, and a `Date` against a `timestamp` or `date` column outside UTC.
- A transaction the server rolled back now rejects, and an unsafe `BEGIN` outside `sql.begin` is rejected.
- A query that can't be built or serialized now aborts its transaction where v3 skipped it.
- postgres.js 4 is ESM only (Node 20.19+ or 22.12+, which this package's engines already require).

From postgres.js 4.1.0 (the floor): `PGSSLMODE` is now honoured. `require` actually uses TLS and fails against a server without it, and `verify-full` verifies, where 4.0 and earlier connected in plain text. Check `PGSSLMODE` in any environment that sets it before you upgrade. 4.1.0 also fixes a prepared-statement cache that kept every query's values and rows (about 1.1 GB with 10 connections); Studio's own pool sets `prepare: false`, but a pool you pass in may not.
