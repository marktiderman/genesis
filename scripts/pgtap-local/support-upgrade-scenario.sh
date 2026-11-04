#!/bin/bash
# Upgrade scenario: an app on the released support (0006 base, 0001-0003) and chat (0001-0003)
# with existing support conversations, upgraded to support 0004-0008 and chat 0004.
# usage: upgrade.sh lock|support-first [solo]
#   lock          : the order genesis upgrade copies today (block by block: chat 0004 first)
#   support-first : support 0004-0006 before chat 0004 (the runsBefore order)
#   solo          : also seed a reporter who belongs to no tenant
set -u
P="psql -v ON_ERROR_STOP=1 -q -U ${PGUSER:-postgres}"
OLD=${OLD:?set OLD to a folder holding the released migrations (git show origin/main:<path>)}
NEW=$(cd "$(dirname "$0")/../.." && pwd)/packages
run() { $P -d t -f "$1" >/dev/null 2>/tmp/pgtap-local-err.txt || { echo "FAIL applying $(basename $1):"; head -3 /tmp/pgtap-local-err.txt; exit 1; }; }
sql() { $P -d t -c "$1" >/dev/null 2>/tmp/pgtap-local-err.txt || { echo "FAIL: $1"; head -3 /tmp/pgtap-local-err.txt; exit 1; }; }
$P -c "drop database if exists t" 2>/dev/null; $P -c "create database t" || exit 1
run "$(dirname "$0")/supabase-stubs.sql"

# The app as it is today.
for f in 0004_genesis_tenant_features 0016_genesis_viewer_people 0006_genesis_support 0003_genesis_support_findings \
         0001_genesis_chat 0002_genesis_chat_coaching 0003_genesis_chat_search_threads 0001_genesis_support_chat 0002_genesis_support_email; do
  run $OLD/$f.sql
done
# Its hooks: platform staff f6 (in no tenant), a1 a client of business ta, s9 (solo) in no tenant.
$P -d t >/dev/null <<'EOF'
create or replace function private.genesis_support_staff(person uuid) returns boolean language sql stable set search_path = ''
  as $$ select person = '00000000-0000-4000-8000-0000000004f6'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid) returns table (tenant_id uuid, person_id uuid)
  language sql stable set search_path = ''
  as $$ select '00000000-0000-4000-8000-0000000000a0'::uuid, viewer where viewer = '00000000-0000-4000-8000-0000000004a1'::uuid $$;
insert into auth.users (id, aud, role, email, instance_id) values
  ('00000000-0000-4000-8000-0000000004a1','authenticated','authenticated','u-a1@example.test','00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000004c9','authenticated','authenticated','u-s9@example.test','00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000004f6','authenticated','authenticated','u-f6@example.test','00000000-0000-0000-0000-000000000000');
EOF
[ $? -eq 0 ] || { echo "seed users failed"; exit 1; }
# Existing reports, each with its conversation (support 0001 makes them).
seed() { $P -d t >/dev/null <<EOF
select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, false);
select set_config('request.jwt.claim.sub','$1', false);
set role authenticated;
insert into public.support_reports (type, title, message) values ('bug', '$2', 'Broken');
reset role;
EOF
}
seed 00000000-0000-4000-8000-0000000004a1 "Old report from a1" || { echo "seed a1 failed"; exit 1; }
if [ "${2:-}" = solo ]; then seed 00000000-0000-4000-8000-0000000004c9 "Old report from solo" || exit 1; fi
echo "before: $($P -d t -tA -c "select count(*) from genesis_chat.conversations where kind='support'") support conversation(s)"

# The upgrade. The app adds its default-tenant hook first, as the 0004 header asks.
$P -d t -c "create or replace function private.genesis_support_default_tenant() returns uuid language sql stable set search_path = '' as \$\$ select '00000000-0000-4000-8000-00000000000f'::uuid \$\$;" >/dev/null
C=$NEW/chat/migrations/0004_genesis_chat_tenants.sql
S4=$NEW/support/migrations/0004_genesis_support_tickets.sql
S5=$NEW/support/migrations/0005_genesis_support_chat_on_tickets.sql
S6=$NEW/support/migrations/0006_genesis_support_chat_tenants.sql
S7=$NEW/support/migrations/0007_genesis_support_email_on_tickets.sql
S8=$NEW/support/migrations/0008_genesis_support_email_tenants.sql
case $1 in
  lock) ORDER="$C $S4 $S5 $S6 $S7 $S8" ;;
  support-first) ORDER="$S4 $S5 $S6 $C $S7 $S8" ;;
esac
for f in $ORDER; do run $f; done
echo "applied: $1"

# After: every support conversation sits in its ticket's tenant, staff observe it, and new tickets work.
$P -d t -tA <<'EOF'
select 'misplaced: ' || count(*) from genesis_chat.conversations c join public.tickets t on c.subject_id = t.id::text
 where c.kind = 'support' and c.tenant_id is distinct from t.tenant_id;
select 'staff observe old ticket: ' || genesis_chat.observes(c.id, '00000000-0000-4000-8000-0000000004f6')
  from genesis_chat.conversations c join public.tickets t on c.subject_id = t.id::text where t.title = 'Old report from a1';
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-0000000004a1','role','authenticated')::text, false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000004a1', false);
set role authenticated;
insert into public.tickets (type, title, message) values ('bug', 'New after upgrade', 'Hello');
reset role;
select 'new ticket conversation tenant ok: ' || (c.tenant_id = t.tenant_id)
  from genesis_chat.conversations c join public.tickets t on c.subject_id = t.id::text where t.title = 'New after upgrade';
select 'staff observe new ticket: ' || genesis_chat.observes(c.id, '00000000-0000-4000-8000-0000000004f6')
  from genesis_chat.conversations c join public.tickets t on c.subject_id = t.id::text where t.title = 'New after upgrade';
EOF
