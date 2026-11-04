#!/bin/bash
# Apply package migrations, in the order given, to a fresh database on a local Postgres with pgTAP,
# over Supabase-shaped stubs (auth, storage). Not a Supabase stack: good for package pgTAP, which
# Genesis CI doesn't run. Defines a default-tenant hook right before support 0004.
#   PGHOST=/path/to/socket PGPORT=54329 scripts/pgtap-local/apply.sh packages/supabase/migrations/0004_… …
set -u
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
P="psql -v ON_ERROR_STOP=1 -q -U ${PGUSER:-postgres}"
DB=${PGDATABASE_TEST:-genesis_pgtap}
$P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; $P -d postgres -c "create database $DB" >/dev/null || exit 1
$P -d $DB -f "$here/supabase-stubs.sql" >/dev/null || exit 1
for f in "$@"; do
  case $f in *0004_genesis_support_tickets*)
    $P -d $DB -c "create or replace function private.genesis_support_default_tenant() returns uuid language sql stable set search_path = '' as \$\$ select '00000000-0000-4000-8000-00000000000f'::uuid \$\$;" >/dev/null ;;
  esac
  $P -d $DB -f "$root/$f" >/dev/null 2>/tmp/pgtap-local-err.txt || { echo "FAIL $f"; head -5 /tmp/pgtap-local-err.txt; exit 1; }
done
echo "applied $# file(s) to $DB"
