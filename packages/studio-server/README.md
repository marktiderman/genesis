# @marktiderman/genesis-studio-server

The server half of **Genesis Data Studio**: a web-standard `Request → Response` handler that lets a
signed-in user browse and fix their app's Postgres or Supabase data **as themselves**.

> A signed-in user sees and edits exactly what they already can. The database or the app's own API
> decides that, never Genesis. — [docs/DATA-STUDIO.md](../../docs/DATA-STUDIO.md)

It is the only Genesis package that touches a database credential. The browser half is
[`@marktiderman/genesis-studio`](../studio/README.md); the client it talks to ships here at
`@marktiderman/genesis-studio-server/client`.

**Status: 0.2, milestone P1.**
- **Reads:** lists, server search and filters, multi-field sort, relations and audit history.
- **Writes:** edits, creates and deletes, all version-checked and audited.
- **Rule-bearing writes:** routed through the app's own database functions.
- **Outbox delivery:** audit entries can also go to an external log.

- **P2:**
  - exact bulk updates and deletes (all or none);
  - CSV import with a dry run, checked by the database itself;
  - undo of your own changes, from the audit.

## Turn it on (Supabase, one command)

```bash
npx @marktiderman/genesis-cli studio init
```

It writes three things into your app and tells you the rest:

- **One migration to review:** the studio's own `NOINHERIT` database login and the audit trail.
- **The server:** a Next.js route, or, for a Vite or Lovable app with no server of its own, a
  Supabase Edge Function.
- **A page:** `<DataStudio provider={createSupabaseStudioProvider(supabase)} />`, which your app's
  own Supabase sign-in drives.

Then set the login's password, add one secret, and open the page. Every table in `public` is
there, with everything the signed-in user's grants and row-level security allow, and nothing more.
No table needs listing, and no table needs a version trigger.

By hand, the server is one call:

```ts
import { supabaseStudio } from "@marktiderman/genesis-studio-server";

export const POST = supabaseStudio({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  database: process.env.STUDIO_DATABASE_URL!,
  who: (claims) => (claims.app_metadata as { role?: string } | undefined)?.role === "admin", // optional: keep the UI to staff
});
```

- `supabaseStudio` is `createStudioHandler` with `supabaseAuth`, `databaseDecides()` and the table
  audit sink.
- Pass `except: ["public.secrets"]` to leave tables out, and `rules` to narrow some tables in
  `byResource` form.
- Off its own origin (an Edge Function), list the app's origins in `allowedOrigins`. The handler
  then answers the browser's CORS preflight for them.

## What every request does

1. Refuses a cross-site browser request and anything but `application/json`.
2. Verifies the bearer token (`supabaseAuth` or `jwtAuth`). No token, an expired token, a token for
   another audience, an anonymous Supabase session, or a token whose `role` isn't `authenticated`
   (a service-role key, say) gets nothing.
3. Opens **one transaction** and switches to the user: `set local role authenticated`, plus their
   verified claims as `request.jwt.claims` (and Supabase's per-claim settings, so `auth.uid()` is
   always this user, even on a pooled connection). It asserts `current_user` before going on.
4. Reads the catalog **as that user**, so `has_column_privilege` and RLS answer for them, and asks
   your `authorize()`. Only the columns both allow are ever selected.
5. For an edit: locks the row, compares its version with the one the edit was based on, updates,
   checks that the database advanced the version, and writes the audit entry — all in that
   transaction. Any failure rolls all of it back.

## Attach a project (under 15 minutes)

**1. Install the audit trail.** One migration, idempotent:

```bash
npx genesis-studio-server sql --login-role genesis_studio_login > supabase/migrations/20261019000000_genesis_studio.sql
```

It creates schema `genesis_studio` (not exposed by the Data API), the `audit_log` table nobody can
write directly, and `genesis_studio.record_audit`, a `security definer` function with an empty
`search_path` that takes the actor from the session, never from an argument.

**2. Create the handler's login role.** Run this once per environment (not in a migration, because it
holds a password). The role is `NOINHERIT`, so until it switches to a user it can't read or write any
table:

```sql
create role genesis_studio_login login noinherit password '<generate one>';
grant authenticated to genesis_studio_login;
```

Its connection string (direct, or the transaction pooler on port 6543) is the handler's
`database`. The handler refuses a superuser or `BYPASSRLS` login unless you set
`allowPrivilegedLogin` for local development.

**3. (Optional) A version trigger.** Every edit is version-checked. A table with an `updated_at`
(microsecond timestamp) or integer `version` that a trigger advances on every update is checked
against that column:

```sql
create extension if not exists moddatetime schema extensions;
create trigger customers_updated_at before update on public.customers
  for each row execute function extensions.moddatetime(updated_at);
```

A table without one is checked against a fingerprint of the row's values (every column the user
can read), so it's editable straight away. Either way, an edit to a row someone else changed since
it was read is refused, never saved over theirs. RLS must be on.

**4. Mount the handler** on one POST route. In Next.js, `app/api/studio/route.ts`:

```ts
import { byResource, createStudioHandler, supabaseAuth } from "@marktiderman/genesis-studio-server";

const studio = createStudioHandler({
  database: process.env.STUDIO_DATABASE_URL!,
  auth: supabaseAuth({ url: process.env.NEXT_PUBLIC_SUPABASE_URL! }),
  authorize: byResource(
    {
      "public.customers": { read: true, update: ["notes", "status"] },
      "public.orders": { read: true },
    },
    { who: (claims) => (claims.app_metadata as { role?: string } | undefined)?.role === "editor" },
  ),
  audit: { sink: "table" },
});

export const POST = studio;
```

Hono: `app.post("/api/studio", (c) => studio(c.req.raw))`. Cloudflare: `fetch: studio`.

**5. Render the studio** — see [`@marktiderman/genesis-studio`](../studio/README.md).

## Which tables appear, and who may edit what

Pass `authorize: databaseDecides()` (what `supabaseStudio` uses) to turn every table on and let the
database decide. Pass `byResource` for an allow-list. With your own function, everything is denied
by default. A table appears when **all** of these allow it:

| Layer | Decides |
| --- | --- |
| `authorize()` | Which tables, which actions, which columns, for which users. `byResource` covers the common case; write your own for rules that depend on the claims. |
| Postgres grants | Column-level `SELECT` and `UPDATE` for the acting role. |
| RLS | Which rows. |

Then a table is editable only when it also has all of these:
- a primary key the user can see;
- RLS on (or `resources[name].allowWithoutRls`);
- a row-level security policy that allows the action at all;
- a working audit sink.

When it isn't, `describe()` says why, in a sentence the studio shows. A configured `versionField`
that can't be trusted (no trigger, or a timestamp too coarse) makes the table read-only, and says
so.

**Hiding a column in `authorize()` hides it in the studio, not from the database.** If the same user
can reach the table through PostgREST, revoke the column there too:
`revoke select (answer_key) on public.quiz from authenticated`.

## Write safety

- **No silent overwrites.** Every update names the version it was read at. A different current
  version is a `conflict`, returned with the row as it is now.
- **What actually happened.** When an update changes nothing, the row is re-read: `conflict`
  (someone else changed it), `forbidden` (visible and unchanged, but the row rules refuse this
  user), or `gone` (deleted, or no longer visible). "Deleted" and "no longer visible" are one answer
  on purpose: telling them apart needs a privileged look at a row the user can't see.
- **Create and delete, too.** A new row is inserted as the user, under RLS `WITH CHECK`, with only
  the fields both the database and `authorize` let them set. A delete is version-checked like an
  edit, so a row someone just changed isn't thrown away unseen.
- **Audit before editing.** No sink, no writes. The entry records the actor, the resource and key,
  and the before and after values of every field the user can see that changed (the version bump
  and trigger side effects included). Sinks:
  - `{ sink: "table" }` — the handler calls `genesis_studio.record_audit` in the edit's transaction,
    after checking it is still tamper-proof (security definer, pinned `search_path`, the log not
    writable by the acting role).
  - `{ sink: "database" }` — your own triggers audit. Name the trigger per table
    (`resources[name].auditTrigger`); it must fire on every update, or the table stays read-only.
  - `{ sink: "outbox" }` — as `table`, and the entry is also queued in `genesis_studio.outbox`
    in the same transaction, for `createOutboxWorker` to deliver (below).

## Bulk writes, imports and undo

- **`updateMany` and `deleteMany`** take explicit ids and run in **one transaction**. Each row is
  version-checked in its own savepoint, so every failure is collected. Then either every row is
  kept or none is, so access rules can't quietly skip rows. Up to 500 rows.
- **`import`** inserts each row for real, in its own savepoint, so the database itself checks
  every value, constraint and row rule. With `dryRun` (the default) everything rolls back and the
  response lists every row that would fail, with the database's reason. Without it, all rows
  commit together or none do. Nothing is coerced: a value that won't convert is a failure, never
  a null. Up to 5000 rows.
- **`undo`** makes a compensating write from an audit entry, and audits it too:
  - an edit's fields are put back;
  - an added row is removed;
  - a deleted row is restored with its own key, or refused.

  It works after the tab is closed, but only for the user's own changes, and only while the row
  still looks the way that change left it. Undoing over a later edit would silently lose that edit.

## Rule-bearing writes

Map a resource's writes to the app's own database functions, so its rules (grading, locks,
purchases) always run (decision 29):

```ts
resources: {
  "public.questions": {
    functions: { update: "public.save_question", create: "public.add_question", delete: "public.remove_question" },
  },
},
```

Each function is called **as the signed-in user**, inside the edit's transaction. It runs after
the studio's version check and before its audit entry:

| Action | Signature | Returns |
| --- | --- | --- |
| `update` | `fn(record_key jsonb, changes jsonb)` | Anything (ignored) |
| `create` | `fn(values jsonb)` | The new row, or an object with its key fields |
| `delete` | `fn(record_key jsonb)` | Anything (ignored) |

A function that raises refuses the change, and its message is shown. The user needs no direct
grant on the table: the version check and the write happen in one `REPEATABLE READ` transaction,
so a change committed by anyone in between fails the function's write instead of being
overwritten.

## Row actions

A named operation on one row ("Approve", "Send reminder"), carried out by the app's own function
`fn(record_key jsonb)`:

```ts
resources: {
  "public.orders": {
    actions: [
      { name: "approve", label: "Approve", function: "public.approve_order", confirm: "Approve this order?" },
    ],
  },
},
authorize: byResource({ "public.orders": { read: true, actions: ["approve"] } }, { who }),
```

The function runs **as the signed-in user**, at the version they saw, inside one `REPEATABLE READ`
transaction, so a row changed in between is a conflict, not an overwrite. Its effect on the row is
audited as `run:approve` (before and after, or no after when it removed the row). The studio never
undoes an action, because the function may have changed more than the row shows.

An action is offered only when `authorize` allows `{ action: "run", rowAction: name }`, the
table's write preconditions hold (audit sink, key, RLS, version field), and the function exists
with that signature. A misconfigured one is reported to `onError`, not shown to the user. A name is
a letter or `_`, then letters, digits or `_`.

## Comments

`authorize` allows `{ action: "comment" }` per table (`byResource`: `comment: true`). Comments
live in `genesis_studio.comments`, written and read only through the setup SQL's security definer
functions. A comment can only be read or added for a row the user can see right now, and its
author is always the token's `sub`.

## Checked-in contracts

`genesis introspect` (in `@marktiderman/genesis-cli`) writes `resources.genesis.ts` from the
Postgres catalog or a Supabase OpenAPI spec. Pass it in, and it wins over discovery for
presentation (decision 10):

```ts
import { contracts } from "./resources.genesis";
createStudioHandler({ …, contracts });
```

It sets a table's label, label field and description, and a field's label, description and
widget. A widget applies only when it can edit the field's type, and never over a link or a
choice list. Types, keys and every permission still come from the live database, so a stale
contract can't reveal, invent or unlock a field. `@genesis {…}` settings in comments are left out
of the descriptions the studio shows.

## Outbox delivery

```ts
import { createOutboxWorker, PermanentDeliveryError } from "@marktiderman/genesis-studio-server";

const worker = createOutboxWorker({
  database: process.env.STUDIO_OUTBOX_DATABASE_URL!, // logs in as the worker role
  deliver: async ({ id, entry }) => {
    const res = await fetch(LOG_URL, { method: "POST", headers: { "idempotency-key": id }, body: JSON.stringify(entry) });
    if (res.status === 422) throw new PermanentDeliveryError(await res.text()); // retrying won't help
    if (!res.ok) throw new Error(`log service answered ${res.status}`); // retried with backoff
  },
  onDeadLetter: (letter) => console.error(`audit delivery dead-lettered: ${letter.id}`), // or your alerting
  // A run that fails before any delivery: a refused login, a missing grant, a lost connection.
  onError: (error) => console.error(`audit outbox worker can't run: ${String(error)}`),
});
worker.start();
```

- **At least once.** Each entry carries its audit id, so a receiver drops duplicates.
- **In order per record.** An entry waits while an earlier one for the same record is still
  undelivered or dead-lettered. Other records keep flowing.
- **Never sent twice at once.** Workers claim entries with `FOR UPDATE SKIP LOCKED`.
- **Retries back off.** They use exponential backoff with jitter: by default 10 attempts over
  about a day.
- **Dead letters.** `PermanentDeliveryError` skips the remaining attempts. Either way, a failed
  entry moves to `genesis_studio.outbox_dead_letter` and stays there until
  `worker.replay(id)` puts it back in line.
- **Pruning.** `worker.prune()` clears delivered rows; the audit log keeps every entry.
- **Its own role.** Create the worker's login role and pass `--worker-role` (`workerRole`) when
  generating the setup SQL. Only that role may read or settle the outbox.

## Run your own API as the user

The studio's identity switch is exported on its own, for an app's API that should run user-scoped
queries under row-level security the way PostgREST does: in one transaction per unit of work (an
HTTP request or a socket event), first switch to the user, then query.

```ts
import { supabaseVerifier, switchToUser } from "@marktiderman/genesis-studio-server";

const verify = supabaseVerifier({ url: process.env.SUPABASE_URL! }); // a raw token: a bearer, or a socket handshake's

const claims = await verify(token);
if (!claims) throw new Unauthorized();

// Drizzle
await db.transaction(async (tx) => {
  await switchToUser((s, ...v) => tx.execute(sql(s, ...v)), { role: "authenticated", claims }, { headers: { "x-app": app } });
  return tx.select().from(rooms);
});

// postgres.js
await pool.begin(async (tx) => {
  await switchToUser(tx, { role: "authenticated", claims });
  return tx`select * from rooms`;
});
```

- **What it sets:** `role`, `request.jwt.claims`, and Supabase's older per-claim settings
  (`request.jwt.claim.sub`, `.role`, `.email`), so `auth.uid()` and `auth.jwt()` work. Each one is a
  `set_config(..., true)` (`SET LOCAL`) with the value as a parameter, never interpolated. Every
  setting is written each time, so a value left on a pooled connection never applies.
- **Headers:** `headers` becomes `request.headers`, as PostgREST exposes it, for a policy or
  function that reads one. Pass only what they read. `authorization`, `cookie`, `apikey` and other
  credential headers are refused.
- **The role:** `authenticated` or `anon` unless `allowRoles` lists others, and `claims.role`, when
  set, must be the same role.
- **The check:** after the switch, a check in SQL makes sure `current_user` is the role and can't
  bypass RLS, and that the login is neither a superuser nor BYPASSRLS. A failure raises inside the
  transaction, so Postgres aborts it and it throws `IdentitySwitchError`. Catching that error
  doesn't let anything go on as the login.
- **The login:** use a dedicated `NOINHERIT` login that is neither a superuser nor BYPASSRLS, set up
  the same way as the studio's (see [Attach a project](#attach-a-project-under-15-minutes)). On a
  privileged login, code inside the transaction could undo the switch with `reset role`, so such a
  login is refused (`allowPrivilegedLogin` is for local development only). Keep server-owned writes
  on a separate privileged pool that never runs user work.
- **Role checks in SQL:** read `current_setting('role')` or `current_user`, never a claim, since a
  claim is only what the token said.

## Operational notes

- Lists are capped: 200 rows a page, offsets to 100 000, counts to 10 000 (`totalIsLowerBound`
  past that), 20 filters. Each request has a 10 s statement timeout and a 3 s lock timeout.
- `authorize()` runs inside the request's transaction: keep it fast and free of network calls.
- Rate limiting and read-access logging belong to your host (middleware, gateway).
- `onError` receives errors that may carry query parameters, including claims and cell values.
  Scrub before shipping them to a log service.
- The audit log is append-only by design. Decide its retention, and how a deletion request is
  handled, before it holds production data.
- On Cloudflare Workers (where Lovable deploys TanStack Start apps), a database connection
  belongs to the request that opened it. There the studio opens one per transaction and closes
  it after, instead of keeping a pool, so one handler can still serve every request. Set
  `createPostgresDatabase(url, { perRequest })` to choose either way yourself.
- Cloudflare recommends [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) for a remote
  Postgres on Workers: without it each request pays a fresh TCP, TLS and login handshake. Pass its
  connection string as `createPostgresDatabase(env.HYPERDRIVE.connectionString, { prepare: true })`
  (Hyperdrive's transaction pooling needs prepared statements on). Create the Hyperdrive config with
  query caching off (`--caching-disabled`): a cached result would skip the row rules of the user
  who asks next.

## Wire protocol

One endpoint, `POST`, JSON, bearer token. `op` is one of `resources`, `describe`, `list`, `read`,
`update`, `create`, `delete`, `history`; types in `src/protocol.ts` (`StudioRequest` and the `*Response` types). Errors are
`{ error: { outcome, message, current?, currentVersion? } }` with status 400, 401, 403, 404, 409,
410, 415, 422 or 500.

## Tests

```bash
pnpm --filter @marktiderman/genesis-studio-server test      # unit tests; integration tests skip
pnpm --filter @marktiderman/genesis-studio-server test:db   # starts Postgres in Docker on 59432 and runs everything
```

The integration suite builds a Supabase-shaped database (roles, `auth.uid()`, RLS on every table)
in plain Postgres. CI runs it against a Postgres service container.
