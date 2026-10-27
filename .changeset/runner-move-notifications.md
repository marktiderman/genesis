---
"@marktiderman/genesis-notifications": minor
---

The outbox engine moved to `@marktiderman/genesis-supabase/runner`. `@marktiderman/genesis-notifications/runner` still works: it re-exports the same values and types, marked `@deprecated`, and stays for at least one more minor release. Change `from "@marktiderman/genesis-notifications/runner"` to `from "@marktiderman/genesis-supabase/runner"`; nothing else changes.

**It now needs `@marktiderman/genesis-supabase` 0.7.0 or later as a peer dependency** (`>=0.7.0 <1.0.0`), the first version with `/runner`; the notifier's own runner imports the engine from there, with the same behaviour. Install it, or upgrade it to 0.7.0 or later, in every app that uses genesis-notifications (`pnpm add @marktiderman/genesis-supabase@^0.7.0`). As a peer, it gives the app one copy of the engine.
