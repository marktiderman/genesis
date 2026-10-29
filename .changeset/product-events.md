---
"@marktiderman/genesis-supabase": minor
---

Product events, owned by the app (ADR 0010): migration 0018 adds `public.genesis_events` with `genesis_track_events` (a signed-in person, only in tenants they have a record in), `genesis_track_server_events` (service role), `genesis_feature_usage` and `genesis_prune_events`, with a pgTAP test, as the `events` block (`genesis add events`). `@marktiderman/genesis-supabase/events` adds `createEventTracker` (batched, retried with backoff, `reset()` on sign-out, never throws) and `eventsSink`, which plugs the tracker into genesis-native's observability sinks.
