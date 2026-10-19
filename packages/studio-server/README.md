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

Bulk edits, imports and undo come in P2.

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

**3. Make the tables you want editable checkable.** Edits are version-checked, so a table is
read-only until something advances a version field on every update:

```sql
create extension if not exists moddatetime schema extensions;
create trigger clients_updated_at before update on public.clients
  for each row execute function extensions.moddatetime(updated_at);
```

An integer `version` column bumped by a `BEFORE UPDATE` trigger works too. RLS must be on.

**4. Mount the handler** on one POST route. In Next.js, `app/api/studio/route.ts`:

```ts
import { byResource, createStudioHandler, supabaseAuth } from "@marktiderman/genesis-studio-server";

const studio = createStudioHandler({
  database: process.env.STUDIO_DATABASE_URL!,
  auth: supabaseAuth({ url: process.env.NEXT_PUBLIC_SUPABASE_URL! }),
  authorize: byResource(
    {
      "public.clients": { read: true, update: ["goals", "status"] },
      "public.plans": { read: true },
    },
    { who: (claims) => (claims.app_metadata as { role?: string } | undefined)?.role === "coach" },
  ),
  audit: { sink: "table" },
});

export const POST = studio;
```

Hono: `app.post("/api/studio", (c) => studio(c.req.raw))`. Cloudflare: `fetch: studio`.

**5. Render the studio** — see [`@marktiderman/genesis-studio`](../studio/README.md).

## Which tables appear, and who may edit what

Everything is denied by default. A table appears when **all** of these allow it:

| Layer | Decides |
| --- | --- |
| `authorize()` | Which tables, which actions, which columns, for which users. `byResource` covers the common case; write your own for rules that depend on the claims. |
| Postgres grants | Column-level `SELECT` and `UPDATE` for the acting role. |
| RLS | Which rows. |

Then a table is editable only when it also has a primary key the user can see, a trusted version
field (an integer, or a timestamp with microsecond precision, advanced by a trigger on every
update), RLS on (or `resources[name].allowWithoutRls`), and a working audit sink. When it isn't,
`describe()` says why, in a sentence the studio shows.

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
  onDeadLetter: (letter) => alert(`audit delivery dead-lettered: ${letter.id}`),
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

## Operational notes

- Lists are capped: 200 rows a page, offsets to 100 000, counts to 10 000 (`totalIsLowerBound`
  past that), 20 filters. Each request has a 10 s statement timeout and a 3 s lock timeout.
- `authorize()` runs inside the request's transaction: keep it fast and free of network calls.
- Rate limiting and read-access logging belong to your host (middleware, gateway).
- `onError` receives errors that may carry query parameters, including claims and cell values.
  Scrub before shipping them to a log service.
- The audit log is append-only by design. Decide its retention, and how a deletion request is
  handled, before it holds production data.

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
