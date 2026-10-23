# @marktiderman/genesis-core

Genesis's platform-agnostic data layer: the `DataProvider` contract, providers
(`createSupabaseProvider`, `createMockProvider`), the React roots that put a
provider in context, and the hooks that read and write through it
(`useResource`, `useOne`, `useResourceForm`).

```bash
pnpm add @marktiderman/genesis-core @tanstack/react-query react-hook-form zod @hookform/resolvers
```

## Mounting: share your app's query cache

| Root | Query cache | Use when |
| --- | --- | --- |
| `DataProviderRoot` | **Your app's**: mount it inside your `QueryClientProvider` | The app already uses TanStack Query (most apps) |
| `GenesisProvider` | **Its own new `QueryClient`**, unless you pass `queryClient` | Prototypes, mock data, apps with no query client yet |

`GenesisProvider` without `queryClient` starts a second cache, so invalidating
a key in app code doesn't refresh Genesis lists and vice versa. In an app that
has a `QueryClientProvider`, do this:

```tsx
function DataRoot({ children }: { children: ReactNode }) {
  const provider = useMemo(() => createSupabaseProvider(supabase, options), []);
  return <DataProviderRoot provider={provider}>{children}</DataProviderRoot>;
}
// …inside <QueryClientProvider client={queryClient}>
```

Or `<GenesisProvider provider={provider} queryClient={queryClient}>`.

Genesis query keys start with the resource name: `[resource, "list", params]` and
`[resource, "detail", id, select]`. Invalidating `[resource]` refreshes all of them.

## Supabase under RLS

`createSupabaseProvider(client, options?)` reads and writes through the client
you pass, under its session and row-level security. Writes never report a save
that didn't happen:

- **Zero rows is a failure.** `update` and `deleteOne` ask for the affected
  rows. When RLS skips the row, the provider reads it back: still visible
  throws `DataWriteError("forbidden")`; no longer visible throws
  `DataWriteError("gone")`. (Under RLS, "deleted" and "hidden from you" look
  the same, so both are `gone`.)
- **Database errors are typed.** Every write error is a `DataWriteError` whose
  `outcome` comes from its code (`writeOutcomeFromCode`), with the code on
  `error.code` and the raw error as `cause`:

  | Code | Outcome |
  | --- | --- |
  | `42501` (incl. "new row violates row-level security policy") | `forbidden` |
  | `23***` (`23505` unique, `23503` foreign key, `23502` not null, `23514` check), `22***` | `invalid` |
  | `PGRST301`–`PGRST303`, `28000`, `28P01` | `unauthenticated` |
  | `PGRST116` | `gone` |
  | anything else (`P0001` from a function, network failures) | `error`, with the database's message |

- Reads are unchanged: a read error is still a plain `Error` with `code`.

### Options

```ts
const provider = createSupabaseProvider(supabase, {
  // Tables whose delete trigger moves the row to a recycle bin.
  binTables: ["notes", "commitments"], // or (resource) => boolean
  onWrite: async (event) => { /* { resource, kind, id, record? } after every committed write */ },
  resources: {
    projects: {
      noun: "project", // "You can't change this project."
      prepare: (values, { action, id }) => ({ name: String(values.name ?? "").trim() }),
      create: async (row) => {
        const { data, error } = await supabase.rpc("create_project", { _name: row.name });
        if (error) throw error; // mapped by its code
        return data; // the new id (read back) or the new row
      },
      invalidates: [["staff"], ["me"]],
    },
    customers: {
      update: async (id, row) => {
        const { data, error } = await supabase.rpc("update_customer", { _id: id, ...row });
        if (error) throw error;
        return data; // the row, its id, or nothing when no row changed
      },
    },
    tasks: {
      deleteMode: "bin",
      toFormValues: (row) => ({ ...row, done: row.status === "done" }),
      prepare: ({ done, ...rest }) => ({ ...rest, status: done ? "done" : "open" }),
    },
  },
});
```

| Option | What it does |
| --- | --- |
| `binTables` / `resources[r].deleteMode: "bin"` | Recycle-bin delete: check the row is visible, delete it (asking for no rows, since a binning trigger reports none), read it back. Gone from view is success; still visible is `forbidden`; not visible to begin with is `gone`. Requires binned rows to drop out of the caller's view. `deleteMode: "hard"` opts a table back out. List every soft-delete table: one that isn't listed reports a successful bin as `gone`. |
| `prepare(values, context)` | Runs before every create and update, overrides included. Gets a copy of the values; may be async. Throw `DataWriteError("invalid", message)` to refuse; nothing is sent. |
| `create(row)` | Replaces the insert, e.g. a security-definer RPC. Return the row, or its id to have it read back. If the read-back fails, the create is still reported saved (with just the id), so nobody retries into a duplicate. |
| `update(id, row)` | Replaces the update. Return the row, or its id (or `true`) to have it read back. Returning nothing (or `false`) means no row changed: the provider reads the row back and throws `forbidden` or `gone`, so a function that silently skips a row never reports a save. |
| `toFormValues(row)` | Row → edit-form values, for a form shaped differently from its table. Served as `DataProvider.toFormValues`, which `useResourceForm` applies in edit mode. The reverse is `prepare`. |
| `invalidates` | Other query keys a write makes stale, as a list or `(event) => keys`. Served as `DataProvider.invalidates`, which `useResource` and `useResourceForm` (and so `ResourcePage` and `ResourceForm`) invalidate after their writes, on top of `[resource]`. |
| `onWrite(event)` | Called after every committed create, update and delete, including writes made straight through the provider. Awaited; if it throws, the error is logged and the write is still reported saved. |
| `realtime` / `resources[r].realtime` | Serve `subscribe` through Supabase Realtime, for `live` lists and records. Off by default: `true`, a list of resources, or `(resource) => boolean`; a resource's own `realtime` wins. See [Live updates](#live-updates-realtime). |

Both hooks also take an `invalidates` option for keys one screen cares about:
`useResource("tasks", { invalidates: [["me"]] })`.

### Handling failures

```ts
try {
  await provider.update("projects", { id, data });
} catch (error) {
  if (isDataWriteError(error)) {
    switch (error.outcome) {
      case "forbidden": /* hide the control, say why */ break;
      case "gone": /* close the record, refresh the list */ break;
      case "invalid": /* show error.message by the form */ break;
      case "unauthenticated": /* send to sign-in */ break;
      default: /* show error.message */
    }
  }
}
```

### Races, and what the read-back can't tell you

- A read-back runs after the write, so it reports what is true then. If
  another session deletes the row in between, a refused update reads as
  `gone`. Neither case ever reports success.
- A bin delete of a row someone else deletes first reports success: the row
  is gone from view, which is what was asked.
- An update whose new row would fail the table's SELECT policy is refused by
  Postgres (`42501`) and rolled back, so it surfaces as `forbidden`.
- The provider addresses rows by an `id` column.

## Write outcomes

`DataWriteError`, `isDataWriteError` and `WriteOutcome` are exported from both
the root and `@marktiderman/genesis-core/schema`. Check with
`isDataWriteError(error)` rather than `instanceof`, which fails when two copies
of the package are installed.

### Field-level errors

A `DataWriteError` may carry `fields`: field (column) name → a message safe to
show by that input. `useResourceForm` puts each one on its field
(`setError(field, { type: "server" })`), focuses the first, and sets
`errors.root` to the error's message as the summary; a field the form does not
show appears only in the summary.

`createSupabaseProvider` fills `fields` where Postgres says which column it
means (`fieldErrorsFromPostgrest`), and replaces the error's message with a
plain sentence (the raw text stays on `cause`):

| Code | Read from | Field message | Error message |
| --- | --- | --- | --- |
| `23505` unique | `details`: `Key (email)=(…) already exists.` | "This value is already in use." (several columns: "This combination is already in use.") | "Email is already in use." |
| `23502` not null | `message`: `null value in column "title" …` | "This field is required." | "Title is required." |
| `23503` foreign key (insert/update) | `details`: `Key (owner_id)=(…) is not present in table …` | "The selected item doesn't exist." | "Owner Id: the selected item doesn't exist." |

Only plain column names are taken from the store's text; the values it echoes
and constraint names never reach a message. A unique index on one column in a
simple expression (`lower(email::text)`) maps to that column; a unique
violation whose columns cannot be read still gets the safe sentence "This value
is already in use." with no field. Anything else (check constraints) is left
unmapped. Your own provider or `prepare` rule can
throw `new DataWriteError("invalid", "…", { fields: { slug: "Pick another slug." } })`.

## Mutation modes

`useResource` (its `create`, `update`, `remove`) and `useResourceForm` take
`mutationMode`:

| Mode | Cache | Provider | Returned promise / `onSuccess` |
| --- | --- | --- | --- |
| `"pessimistic"` (default) | refetched after the write | at once | after the write |
| `"optimistic"` | patched at once; put back if the write fails | at once | at once |
| `"undoable"` | patched at once; put back on undo or failure | after `undoDelayMs` (default 5000) unless undone | at once |

- **Failures** in `optimistic` / `undoable` mode go to `onError` (the caller
  was already told it worked, and the cache has been put back). Show them
  there. `useResourceForm` also puts them on the form, if it is still open.
- **The undo control is yours.** Core has no UI: `onUndoable(write)` is called
  with `{ resource, kind, id, strategy, delayMs, undo(), commit() }`.
  genesis-ui's `ResourceForm` and `ResourcePage` show a sonner toast with an
  Undo button.
- **A provider that serves `undo`** (`capabilities().undo === true` and an
  `undo` method) gets an `undoable` write at once; `undo()` then calls
  `provider.undo(resource, { auditId })` with the audit id the write returned
  (`strategy: "provider"`). Without an audit id no undo is offered.
- **Undo outlives the form.** Pending writes belong to the `QueryClient`, not
  to the hook: a form or page that unmounts during the delay (a dialog that
  closes on success, a route change) leaves its writes waiting, and the undo
  toast still works. They are sent when the delay ends.
- **Closing the tab sends.** On `beforeunload` and `pagehide`, waiting writes
  are sent at once with `keepalive: true` in their params (`CreateParams`,
  `UpdateParams`, `DeleteParams`). A fetch-based provider should pass it to
  `fetch` and report `keepaliveWrites: true` in its capabilities. The
  "Leave site?" prompt shows only while a write is being sent without that
  guarantee (the built-in Supabase provider cannot pass keepalive through
  supabase-js, so it prompts while a write is in flight).
- **Writes on one record compose.** They are sent in the order they were
  made, one after another; sending a later one (its delay ended, `commit()`)
  first sends the earlier ones still waiting, which can then no longer be
  undone. Undoing (or a failure of) an earlier edit takes only its own fields
  out of the cache, keeping later pending edits shown. A later pending edit
  that kept the earlier edit's values unchanged (a form opened from the
  patched cache) has them put back before it is sent, so it never sends the
  undone values; one whose values are not row-shaped (`toFormValues`) cannot
  be fixed, so it is dropped and reported through `onError`.
- **What is patched:** an update merges the values into the row in every
  cached list (`[resource, "list", …]`) and detail (`[resource, "detail", id,
  …]`); a delete removes the row and lowers `total`. A create patches nothing
  (its id and place in a sorted list are the server's), so `optimistic` /
  `undoable` only change when it is sent and when the caller moves on. A
  rollback restores only the row it patched, so concurrent writes on other
  rows survive.
- **Refetches keep the patch.** While a write is pending, its patch is
  re-applied to any `[resource, "list", …]` or `[resource, "detail", …]` data
  that lands in the cache: a refetch, a window-focus refetch, a new page,
  filter or search. A deleted row stays gone and an edit stays shown until the
  write settles; then the server's rows win. A fetch already in flight is not
  cancelled. Each write refetches `[resource]` when it settles.

```ts
const tasks = useResource("tasks", {
  mutationMode: "undoable",
  onUndoable: (write) => toast("Deleted.", { action: { label: "Undo", onClick: () => void write.undo() } }),
  onError: (error) => toast.error(error.message),
});
await tasks.remove(id); // resolves at once; sent in 5 s unless undone
```

## Cursor paging

For long lists that grow with "Load more", page by cursor (keyset) instead of
offset: pages stay right while rows are added or removed, and a deep page
costs no more than the first.

```ts
const tasks = useInfiniteResource("tasks", {
  perPage: 50,
  defaultSort: { field: "due_at", order: "asc" },
});
tasks.rows;           // every loaded row
tasks.total;          // from the first page's count
tasks.hasNextPage && tasks.fetchNextPage();
```

- **The contract.** `getList` with `pagination: { page, perPage, cursor }`,
  where `cursor` is `null` for the first page and the previous page's
  `nextCursor` after that. A provider that serves it
  (`capabilities().cursorPagination`) returns `nextCursor` (`null` on the
  last page) and may return `total: -1` after the first page (not counted).
  A provider that doesn't ignores `cursor` and pages by `page`;
  `useInfiniteResource` then pages by offset until `total` rows are loaded.
- **Supabase.**
  - It orders by the sort column and then the `orderKey` (default `id`) and
    fetches `perPage + 1` rows to tell whether there is a next page.
  - The cursor (opaque, base64 JSON) holds the last row's sort and key
    values and the sort it was made for. A cursor from another sort is
    refused.
  - The keyset filter handles ascending and descending sorts, ties (broken
    by the key) and null sort values, matching Postgres's default null
    placement (last when ascending, first when descending, pinned in the
    query).
  - It refuses, with an `invalid` `DataReadError` whose `cause` says why:
    `orderKey: false`, a sort on an embedded field (`author.name`), a sort
    column with non-scalar values, and a `select` that leaves out the sort
    or key column.
  - Only the first page is counted.
- **Writes and pending patches.** Pages live under
  `[resource, "infinite", params]`, so writes (which invalidate `[resource]`)
  refetch them. Optimistic and undoable patches are applied to every loaded
  page and survive refetches, like lists.

## Live updates (realtime)

`useResource(resource, { live: true })`, `useOne(resource, id, { live: true })`
and genesis-ui's `<ResourcePage live />` keep what is on screen current while
they are mounted. They subscribe through the provider's optional
`subscribe(resource, params, callback)` and, when it reports a change,
refetch the resource's cached reads (`useResource`: every `[resource, …]`
query; `useOne`: that record, and only for its own id).

- **Events are hints, never data.** The callback gets `{ type: "created" |
  "updated" | "deleted", id? }`, or `{ type: "changed" }` when changes may have
  been missed (after a reconnect). Nothing from an event is written to the
  cache: rows always come from the provider's normal read, under its RLS.
- **One refetch per burst.** Events within `debounceMs` (default 250) of each
  other cause one refetch: `live: { debounceMs: 1000 }`. A steady stream
  still refetches at least every `4 × debounceMs`.
- **Pending writes stay applied.** A refetch while an optimistic or undoable
  write is pending gets that write's patch re-applied (see
  [Mutation modes](#mutation-modes)), so a row deleted with Undo stays hidden
  and an edit stays shown. Your own committed writes come back as events too;
  the extra refetch is harmless and is not filtered out.
- **A hidden tab waits.** While the page is hidden, reads are only marked
  stale; they refetch when it is shown again (with TanStack Query's default
  `refetchOnWindowFocus`) or when next used.
- **Without `subscribe`**, or for a resource the provider doesn't watch,
  `live` does nothing. `capabilities(resource).realtime` says whether it
  will work.

### Supabase setup

```ts
const provider = createSupabaseProvider(supabase, {
  resources: { tasks: { realtime: true } }, // or realtime: true | ["tasks"] for several
});
```

```sql
-- 1. Publish the table's changes to Realtime.
alter publication supabase_realtime add table public.tasks;
-- 2. Keep RLS on: Realtime only sends an insert or update to a subscriber
--    whose SELECT policies allow the new row.
alter table public.tasks enable row level security;
```

- The provider opens one `postgres_changes` channel per subscription
  (`useOne` filters it to `id=eq.<id>`) and removes it on unsubscribe. A
  resource named `schema.table` listens in that schema; otherwise `public`.
- **What leaks, and what doesn't.** Insert and update events are checked
  against RLS by Realtime. **Delete events are not:** every subscriber to the
  table receives the deleted row's primary key (with RLS on, Supabase sends
  only the key, even under `REPLICA IDENTITY FULL`). The provider passes on only the id, and the hooks only refetch,
  so a user never sees a row their read doesn't return. Don't enable
  realtime on a table whose ids are themselves sensitive.
- **Cost.** Each mounted live list or record is one Realtime channel, and
  each change refetches every live list of that table for every subscriber
  (debounced per client). Realtime checks RLS once per subscriber per
  change, so busy tables with many viewers multiply database load. Enable it
  where people watch shared data change, not on every table.
- `capabilities(resource).realtime` is true only for resources with realtime
  on and a client with `channel()` (any `@supabase/supabase-js` client).

## Unsaved changes

`useResourceForm({ warnWhenUnsaved: true })` (default off) warns while the
form is dirty: the browser's prompt on closing or reloading the tab, and
`confirmLeave()` for in-app navigation. It returns `isDirty` (false again once
a save succeeds or is handed off) and `confirmLeave()` (true when it is fine to
leave; asks with `window.confirm` otherwise). For other state,
`useUnsavedChangesGuard({ when, message, confirm })` gives the same
`confirmLeave` and `beforeunload` handling. Neither depends on a router; see
genesis-ui's SKILL.md "Unsaved changes" for React Router and TanStack Router.
