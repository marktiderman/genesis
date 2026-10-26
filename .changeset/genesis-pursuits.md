---
"@marktiderman/genesis-supabase": minor
---

New migration `0009_genesis_pursuits.sql` and the `pursuits` block. Goals and projects share one table, `pursuits`: a pursuit is a goal, a project or both. Pursuits nest and carry a period, health and criteria. Tasks, issues and milestones live in `work_items`, either on their own or under a pursuit. Issues add a term, a priority, a manual rank, who decides and the solution.

Every row has a tenant and exactly one owner: a person, a team or the tenant. Neither ever changes. Who reads and writes is decided by the app's hooks `private.genesis_readable_owners` and `private.genesis_owner_can`, and without them nobody signed in can. A pgTAP test sits beside the migration.

Features: pursuits
