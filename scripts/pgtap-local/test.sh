#!/bin/bash
# Run pgTAP files against the database apply.sh built: scripts/pgtap-local/test.sh packages/support/migrations/tests/*.sql
root=$(cd "$(dirname "$0")/../.." && pwd)
for t in "$@"; do echo "$(pg_prove -U ${PGUSER:-postgres} -d ${PGDATABASE_TEST:-genesis_pgtap} "$root/$t" 2>&1 | tail -1)  $t"; done
