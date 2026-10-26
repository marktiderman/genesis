---
"@marktiderman/genesis-forms": patch
---

Forms' destinations now bundle the outbox engine from `@marktiderman/genesis-supabase/runner`, where it moved, instead of from genesis-notifications. The bundled code is the same, so delivery behaves exactly as before, and forms still installs no dependencies. A new test pins forms' outcomes on the engine: filtered and skipped deliveries are never retried, a Retry-After defers without using an attempt up to `maxDeferrals`, a 410 fails with `disable`, and the defaults stay at 8 attempts, 24 deferrals and batches of 25.
