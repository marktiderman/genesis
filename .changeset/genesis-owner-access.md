---
"@marktiderman/genesis-supabase": minor
---

New migration `0009_genesis_owner_access.sql` and the `owner-access` block. It defines the owner-access contract that Genesis blocks with owned rows call in their policies.
- `private.genesis_owner_readable()` and `private.genesis_owner_allows(tenant, person_id, team_id, organization_id, action)` wrap the app's hooks, `genesis_readable_owners` and `genesis_owner_can`.
- They fail closed: a missing or broken hook, no signed-in person, a null tenant or an unknown action means no.

A pgTAP test sits beside the migration.

Features: owner-access
