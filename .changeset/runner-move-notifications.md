---
"@marktiderman/genesis-notifications": minor
---

The outbox engine moved to `@marktiderman/genesis-supabase/runner`. `@marktiderman/genesis-notifications/runner` still works: it re-exports the same values and types, marked `@deprecated`, and stays for at least one more minor release. Change `from "@marktiderman/genesis-notifications/runner"` to `from "@marktiderman/genesis-supabase/runner"`; nothing else changes.

The notifier's own runner uses the moved engine, with the same behaviour. genesis-notifications now has a peer dependency on `@marktiderman/genesis-supabase` `>=0.7.0 <1.0.0`, so an app has one copy of the engine. Apps on the notifications block almost always have genesis-supabase already; if yours doesn't, add it.
