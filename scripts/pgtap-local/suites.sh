#!/bin/bash
# The pgTAP beside every package's migrations (packages/*/migrations/tests) and genesis-supabase's
# testing helpers (packages/supabase/sql/testing/tests), each suite on a fresh
# database with its migrations in the order an app applies them. Exits non-zero when a suite can't
# be set up, a test fails, a suite name is unknown, or a package's test or migration is in no suite
# (a new one has to be added here, so it can't go unrun without anyone noticing).
#   PGHOST=… scripts/pgtap-local/suites.sh [suite …]     (no names: all of them)
# In CI, and on a machine without Postgres: scripts/pgtap-local/docker.sh
set -u
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
cd "$root" || exit 1

sb=packages/supabase/migrations
su=packages/support/migrations
ch=packages/chat/migrations

# name | migrations, in order | tests
SUITES=(
  "supabase|$sb/0001_genesis_account_deletion.sql $sb/0002_genesis_app_release_policy.sql $sb/0003_genesis_apple_token_revocation.sql $sb/0004_genesis_tenant_features.sql $sb/0005_genesis_push.sql $sb/0006_genesis_support.sql $sb/0007_genesis_jobs.sql $sb/0008_genesis_feature_registry.sql $sb/0014_genesis_feature_registry_hardening.sql $sb/0015_genesis_web_handoff.sql $sb/0016_genesis_viewer_people.sql $sb/0017_genesis_person_entitlements.sql $sb/0018_genesis_events.sql $sb/0019_genesis_version_bump.sql|$sb/tests/*.test.sql"
  "helpdesk-upgrade|$sb/0004_genesis_tenant_features.sql $sb/0016_genesis_viewer_people.sql $sb/0006_genesis_support.sql $su/0003_genesis_support_findings.sql $ch/0001_genesis_chat.sql $ch/0002_genesis_chat_coaching.sql $ch/0003_genesis_chat_search_threads.sql $su/0001_genesis_support_chat.sql $su/0002_genesis_support_email.sql scripts/pgtap-local/upgrade-seed.sql $su/0004_genesis_support_tickets.sql $su/0005_genesis_support_chat_on_tickets.sql $su/0006_genesis_support_chat_tenants.sql $ch/0004_genesis_chat_tenants.sql $ch/0005_genesis_chat_attachment_paths.sql $su/0007_genesis_support_email_on_tickets.sql $su/0008_genesis_support_email_tenants.sql $su/0009_genesis_support_inbox.sql $su/0010_genesis_support_help_center.sql $su/0011_genesis_support_ticket_fixes.sql $su/0012_genesis_support_help_answers.sql $su/0013_genesis_support_agent_queue.sql|scripts/pgtap-local/upgrade-check.test.sql $su/tests/0006_genesis_support_chat_tenants.test.sql $su/tests/0008_genesis_support_email_tenants.test.sql $su/tests/0009_genesis_support_inbox.test.sql $su/tests/0010_genesis_support_help_center.test.sql $su/tests/0011_genesis_support_ticket_fixes.test.sql $su/tests/0012_genesis_support_help_answers.test.sql $su/tests/0013_genesis_support_agent_queue.test.sql"
  "testing|packages/supabase/sql/testing/genesis_testing.sql|packages/supabase/sql/testing/tests/*.test.sql"
  "support-findings|$sb/0004_genesis_tenant_features.sql $sb/0016_genesis_viewer_people.sql $sb/0006_genesis_support.sql $su/0003_genesis_support_findings.sql|$su/tests/0003_genesis_support_findings.test.sql"
  "helpdesk|$sb/0004_genesis_tenant_features.sql $sb/0016_genesis_viewer_people.sql $sb/0006_genesis_support.sql $su/0003_genesis_support_findings.sql $su/0004_genesis_support_tickets.sql $ch/0001_genesis_chat.sql $ch/0002_genesis_chat_coaching.sql $ch/0003_genesis_chat_search_threads.sql $su/0005_genesis_support_chat_on_tickets.sql $su/0006_genesis_support_chat_tenants.sql $ch/0004_genesis_chat_tenants.sql $ch/0005_genesis_chat_attachment_paths.sql $su/0007_genesis_support_email_on_tickets.sql $su/0008_genesis_support_email_tenants.sql $su/0009_genesis_support_inbox.sql $su/0010_genesis_support_help_center.sql $su/0011_genesis_support_ticket_fixes.sql $su/0012_genesis_support_help_answers.sql $su/0013_genesis_support_agent_queue.sql|$su/tests/0001_genesis_support_chat.test.sql $su/tests/0002_genesis_support_email.test.sql $su/tests/0004_genesis_support_tickets.test.sql $su/tests/0006_genesis_support_chat_tenants.test.sql $su/tests/0008_genesis_support_email_tenants.test.sql $su/tests/0009_genesis_support_inbox.test.sql $su/tests/0010_genesis_support_help_center.test.sql $su/tests/0011_genesis_support_ticket_fixes.test.sql $su/tests/0012_genesis_support_help_answers.test.sql $su/tests/0013_genesis_support_agent_queue.test.sql"
  "chat|$sb/0016_genesis_viewer_people.sql $ch/0001_genesis_chat.sql $ch/0002_genesis_chat_coaching.sql $ch/0003_genesis_chat_search_threads.sql $ch/0004_genesis_chat_tenants.sql $ch/0005_genesis_chat_attachment_paths.sql|$ch/tests/*.test.sql"
  "ai|packages/ai/migrations/0001_genesis_ai.sql|packages/ai/migrations/tests/*.test.sql"
  "collab|packages/collab/migrations/0001_genesis_collab.sql|packages/collab/migrations/tests/*.test.sql"
  "media|packages/media/migrations/0001_genesis_media.sql packages/media/migrations/0002_genesis_media_targets_key_grants.sql|packages/media/migrations/tests/*.test.sql"
  "notifications|packages/notifications/migrations/0001_genesis_notifications.sql|packages/notifications/migrations/tests/*.test.sql"
  "sites|packages/sites/migrations/0001_genesis_sites.sql packages/sites/migrations/0002_genesis_sites_posts.sql|packages/sites/migrations/tests/*.test.sql"
)

# Every test file is in a suite.
listed=" $(for s in "${SUITES[@]}"; do IFS='|' read -r _ _ tests <<<"$s"; eval "echo $tests"; done | tr '\n' ' ') "
applied=" $(for s in "${SUITES[@]}"; do IFS='|' read -r _ migrations _ <<<"$s"; echo "$migrations"; done | tr '\n' ' ') "
failed=0
for t in packages/*/migrations/tests/*.test.sql packages/supabase/sql/testing/tests/*.test.sql; do
  case "$listed" in *" $t "*) ;; *) echo "NOT IN A SUITE: $t (add it to scripts/pgtap-local/suites.sh)"; failed=1 ;; esac
done
for m in packages/*/migrations/*.sql; do
  case "$applied" in *" $m "*) ;; *) echo "NOT IN A SUITE: $m (add it to scripts/pgtap-local/suites.sh)"; failed=1 ;; esac
done
for want in "$@"; do
  case " ${SUITES[*]%%|*} " in *" $want "*) ;; *) echo "NO SUCH SUITE: $want"; failed=1 ;; esac
done

for s in "${SUITES[@]}"; do
  IFS='|' read -r name migrations tests <<<"$s"
  if [ $# -gt 0 ]; then case " $* " in *" $name "*) ;; *) continue ;; esac; fi
  echo "== $name"
  db="genesis_pgtap_${name//-/_}"
  # shellcheck disable=SC2086
  if ! PGTAP_APP_STUBS=1 PGDATABASE_TEST="$db" "$here/apply.sh" $migrations; then failed=1; continue; fi
  # shellcheck disable=SC2086
  pg_prove -U "${PGUSER:-postgres}" -d "$db" $tests || failed=1
done
exit $failed
