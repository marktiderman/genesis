# Local pgTAP for package migrations

Genesis CI doesn't run the packages' pgTAP suites. These scripts run them on a plain local Postgres
(16 tested) with pgTAP installed, over `supabase-stubs.sql`: just enough of Supabase's `auth` and
`storage` schemas and roles. It isn't a Supabase stack. For an app's full suite, use
`supabase test db` or the `supabase/postgres` image.

```sh
export PGHOST=/path/to/socket PGPORT=5432          # any Postgres with pgtap
scripts/pgtap-local/apply.sh <migration files, in order>   # builds database genesis_pgtap
scripts/pgtap-local/test.sh <test files>
```

`apply.sh` defines a default-tenant hook right before support 0004, as an app must.

`support-upgrade-scenario.sh` upgrades an app on the released support and chat migrations, with
existing support conversations, to support 0004–0008 and chat 0004:
- `lock`: the old copy order (chat 0004 first);
- `support-first`: the order `runsBefore` gives.

Add `solo` to also seed a reporter in no tenant. Set `OLD` to a folder holding the released
migrations (`git show origin/main:<path>`). It prints whether conversations are misplaced and
whether app staff observe old and new tickets.

## An app's whole migration folder

`supabase-stubs-app.sql` adds more stand-ins (pg_cron, vault, pg_net, realtime, more auth tables
and roles), applied after `supabase-stubs.sql`. That's enough to apply an app's migrations and run
most of its pgTAP. Apply each migration in one transaction (`psql --single-transaction`), as
Supabase does, after removing its `create extension` lines for pg_cron, pg_net and vault:

```sh
for f in supabase/migrations/*.sql; do
  sed -E 's/create extension( if not exists)? "?(pg_cron|pg_net|vault|supabase_vault|pgsodium)"?[^;]*;/select 1;/I' "$f" \
    | psql -v ON_ERROR_STOP=1 -q --single-transaction -d app_pgtap -f - || break
done
```

A suite that fails here should be compared against a run without your change: some suites need
pieces these stubs don't have.
