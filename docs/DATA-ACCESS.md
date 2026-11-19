# Data access: declared reads, named writes

How a Genesis app reaches its Supabase database. The short version: **a resource declares how it
is read and how it is written, and the provider uses only that.** Reads go through a view or a
database function; writes go through named database functions, which hold the access rule (who
may do this). Going to a table itself is possible, but only as a declared opt-in with a reason.
The doctor reports anything else, and every declared function has an access-rule test.

Why: a provider that writes raw tables by default spreads the access rule over RLS policies,
column grants and client code, so two screens writing the same table can disagree, and a write
can be refused for a reason nobody declared (an insert that reads back `*` when the client may
read only some columns). A named function puts the rule in one place a reviewer can read and a
test can prove.

## Declare a resource

```ts
import { createSupabaseProvider } from "@marktiderman/genesis-core";

declare const supabase: Parameters<typeof createSupabaseProvider>[0];

const provider = createSupabaseProvider(supabase, {
  access: "declared",
  resources: {
    tasks: {
      noun: "task",
      source: "tasks_with_people",
      writes: { create: "create_task", update: "save_task", delete: "delete_task" },
      actions: { archive: "archive_task" },
    },
    // The opt-in: this resource reads its table and edits it there, and says why.
    task_labels: {
      table: { read: true, write: ["update"], why: "A lookup table every member may rename; RLS holds the rule." },
    },
  },
});
```

<!-- api: SupabaseProviderOptions, SupabaseResourceConfig, ResourceWrites, TableAccess -->

- **`access: "declared"`** makes the declarations binding. A read of a resource with no `source`
  (and no `table.read`), a write with no `writes` entry (nor a `create`/`update` rule, nor
  `table.write`), and any resource missing from `resources` are refused with a message that names
  what to declare. Without it (`"open"`, the default) undeclared resources read and write their
  tables as before, and the doctor reports the provider.
- **`source`**: a view (`with (security_invoker = true)`) or a function that returns rows
  (`security invoker`, or filtering by `auth.uid()` itself). See `SupabaseResourceConfig.source`.
- **`writes`**: each a function name, or `{ fn, args }` to name the arguments yourself.
- **`actions`**: named row actions, served by `runAction`.
- **`table`**: the opt-in. `why` is required; it is what a reviewer reads to accept it.

After a create or update the provider reads the record back through the resource's read, never
`select *` on the table, and a write on the table (an opt-in) asks the insert or update for its
`id` (and the version) only. So a write never asks for a column the client may not read. A
resource that declares no read (a write-only one) is never read: a write reports what it sent,
a null answer can't be told apart (refused, gone or changed first) and says so, and it gets no
realtime channel. An update on a declared provider reads the table's row for its columns only
when `table.read` is declared; a table update over a view `source` without `table.read` needs
`writeColumns`, or it is refused (the view's own columns would go to the table).

## Write functions

The provider calls a write function with these arguments unless `args` says otherwise:

| Write | Arguments | Returns |
|---|---|---|
| create | `p_values jsonb` | the new `id` (or the new row) |
| update | `p_id`, `p_values jsonb`, plus `p_expected_version` when the caller sent a version for a resource with a `version` rule | the `id` (or `true`, or the row) when a row changed; `null` when none did |
| delete | `p_id`, plus `p_expected_version` as for update | the `id` (or `true`) when a row went; `null` when none did |
| action | `p_id`, plus `p_expected_version` as for update | the changed row, its `id` or `true`; `null` when no row matched |

The function gets the values as the form sent them (after the resource's `prepare`): it decides
what to write, so `writeColumns` doesn't trim them. On `null` the provider reads the row to say why: `conflict` (someone changed it), `forbidden`
(still visible, so the change was refused) or `gone`.

A write function:

- holds the access rule itself: `security definer`, `set search_path = ''`, and an explicit check
  of who may do this. Match the rule it replaces exactly, no wider and no narrower;
- refuses with `raise exception '…' using errcode = '42501'`, or returns `null` for a row the
  caller may not touch (the provider then tells `forbidden` from `gone`);
- returns the `id`, not the row: the read gives the record back;
- is callable by signed-in users only: `revoke all on function … from public, anon;`
  `grant execute on function … to authenticated;`.

```sql
create function public.save_task(p_id uuid, p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tasks t
    join public.memberships m on m.project_id = t.project_id
    where t.id = p_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')
  ) then
    return null;
  end if;
  update public.tasks set title = coalesce(p_values->>'title', title) where id = p_id;
  return p_id;
end;
$$;
revoke all on function public.save_task(uuid, jsonb) from public, anon;
grant execute on function public.save_task(uuid, jsonb) to authenticated;
```

## Test every function's access rule

Each function a resource declares (`writes`, `actions`, a `source: { rpc }`) gets an access-rule
test: who may call it, and who is refused. `accessRules` turns the rule into one test case per
person; register them with your runner and run them with your app's test command against a local
database.

```ts
import { accessRules, type AccessRuleClient } from "@marktiderman/genesis-core/testing";

declare function signedIn(who: "owner" | "editor" | "viewer" | "stranger"): Promise<AccessRuleClient>;
declare function newTask(): Promise<string>;
declare function test(name: string, run: () => Promise<void>): void;

for (const c of accessRules({
  fn: "save_task",
  as: (who) => signedIn(who),
  args: async () => ({ p_id: await newTask(), p_values: { title: "Renamed" } }),
  allowed: ["owner", "editor"],
  refused: ["viewer", "stranger"],
})) {
  test(c.name, c.run);
}
```

<!-- api: AccessRuleSpec<string>, AccessRuleCase, AccessRuleClient -->

An allowed person's call must succeed and act (answer anything but `null`, `false` or an empty
list; `acted` overrides that). A refused person's call must fail with a refusal (42501 or P0001)
or act on nothing. A failed sign-in (an expired or malformed token) is not a refusal: it never
reached the rule. Any other error fails the case, so a misspelt function or wrong arguments
can't pass as a refusal, and the allowed cases prove the same arguments work. A spec needs at
least one allowed and one refused person.

## What the doctor checks

| Rule | Reports |
|---|---|
| `data/declared-access` | a `createSupabaseProvider(…)` call without `access: "declared"` (in its options, or in a `const` in the same file that it names); a table write in app code (`.from("t").insert/update/upsert/delete(…)`) outside tests and `supabase/`. A direct write that must stay is an `allow` entry for this rule, with its reason. |
| `data/access-rule-tests` | a declared function no `accessRules` call in a test file is given as `fn: "…"` (written in the call, or in a spec it names: directly, spread, or through a `for (… of specs)` loop over a list set in the same file). Resources are read from files that configure the provider (they name `createSupabaseProvider`, `SupabaseResourceConfig` or `SupabaseProviderOptions`). |

Both warn; `--strict` fails on them, and `doctor.ratchet` holds new code to them while old code
moves.

## Moving an app over

1. Turn on `access: "declared"` in a branch and run the app's flows: every refusal names the
   resource and what it lacks.
2. For each write, add a named function that keeps today's access rule exactly (read the RLS
   policies and grants it replaces), and declare it in `writes`. Keep a table write only as a
   `table` opt-in with its reason.
3. Give each function an access-rule test with the people today's rule allows and refuses.
4. Run `genesis doctor`: no `data/*` findings, or each remaining one an `allow` entry with a
   reason.
