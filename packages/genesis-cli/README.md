# @marktiderman/genesis-cli

```bash
npx @marktiderman/genesis-cli init <consumer>
```

Scaffolds a Genesis consumer: a brand package, Tailwind and tokens.

```bash
npx @marktiderman/genesis-cli studio init
```

Turns the Data Studio on in an existing Supabase app. It writes three things:

- **One migration to review:** the studio's `NOINHERIT` login and the audit trail. It holds no
  password.
- **The server:** a Next.js route when the app has an `app/` router; otherwise a Supabase Edge
  Function, `supabase/functions/genesis-studio`, with `verify_jwt = false` added to
  `supabase/config.toml` because the function checks tokens itself.
- **A page:** for Lovable apps, it imports `@/integrations/supabase/client`.

It then prints the steps left: install, route the page, set the login's password, set the
function's secrets, apply the migration. Options: `--host next|supabase-function`, `--route`
(default `/admin/data`), `--login-role`, `--force`.

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
| `--apikey-env <name>` | | The variable holding the API key for an `--openapi` URL, sent as `apikey` and as a Bearer token. Like the database URL, it stays off the command line. |
| `--header "<Name>: <value>"` | | Other headers for an `--openapi` URL, for values that aren't secret. Repeatable. |
| `-s, --schema <list>` | `public` | Comma-separated schemas. `--openapi` reads one. |
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
