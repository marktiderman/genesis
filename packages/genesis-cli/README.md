# @marktiderman/genesis-cli

```bash
npx @marktiderman/genesis-cli init <consumer>
```

Scaffolds a Genesis consumer: a brand package, Tailwind and tokens.

```bash
DATABASE_URL=postgres://… npx @marktiderman/genesis-cli introspect
```

Writes `resources.genesis.ts`, a checked-in contract for the Data Studio: every table in the
schemas, with its key, fields (type, database type, nullability, defaults, enum values, links)
and a row type per table. Review it like code, and pass `contracts` to `createStudioHandler`. It
wins over discovery for labels, widgets and descriptions; types, keys and permissions still come
from the live database.

| Option | Default | |
| --- | --- | --- |
| `--database-env <name>` | `DATABASE_URL` | The variable holding the Postgres URL. It's never read from the command line, so it stays out of shell history. Any role that can read `pg_catalog` works; no table data is read. |
| `--openapi <file-or-url>` | | Read a PostgREST OpenAPI document instead, e.g. a Supabase project's `https://<ref>.supabase.co/rest/v1/`. |
| `--header "<Name>: <value>"` | | Headers for an `--openapi` URL, e.g. `apikey`. Repeatable. |
| `-s, --schema <list>` | `public` | Comma-separated schemas. |
| `-o, --out <file>` | `resources.genesis.ts` | Where to write. |
| `--check` | | Write nothing; exit 1 when the file is out of date. Run it in CI to catch drift. |

The output is deterministic: a re-run with no schema change writes the same bytes.

## Settings in comments

Put labels and widgets next to the schema, in table and column comments:

```sql
comment on table public.clients is
  'People in a program. @genesis {"label": "Clients", "labelField": "name"}';
comment on column public.clients.notes is
  'Private to the coach. @genesis {"label": "Coach notes", "widget": "textarea"}';
```

The text before `@genesis` stays the description. Tables take `label`, `labelField` and
`description`; columns take `label`, `description` and `widget`. Anything else is an error that
names the table or column. These settings are generator input only: the checked-in file is what
ships.
