---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-native": minor
---

A health-check registry: `healthChecks` (genesis-support) takes named checks that answer ok, warn or fail with a message; `supabaseHealthChecks` adds Supabase reachable and auth session present; `healthChecksSection()` puts the latest results in the dump's `checks` (now with a `status`). genesis-native's devtools overlay runs and shows them with `createDevtools({ checks })`.
