---
"@marktiderman/genesis-cli": minor
---

Doctor's supabase pack flags a view in an exposed schema that runs as its owner (no `security_invoker = true` once every migration has run): such a view reads past row level security. New rule `migration-view-rls`.
