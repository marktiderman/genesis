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
    practices: {
      noun: "practice", // "You can't change this practice."
      prepare: (values, { action, id }) => ({ name: String(values.name ?? "").trim() }),
      create: async (row) => {
        const { data, error } = await supabase.rpc("create_practice", { _name: row.name });
        if (error) throw error; // mapped by its code
        return data; // the new id (read back) or the new row
      },
      invalidates: [["staff"], ["me"]],
    },
    clients: {
      update: async (id, row) => {
        const { data, error } = await supabase.rpc("update_client", { _id: id, ...row });
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

Both hooks also take an `invalidates` option for keys one screen cares about:
`useResource("tasks", { invalidates: [["me"]] })`.

### Handling failures

```ts
try {
  await provider.update("practices", { id, data });
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
