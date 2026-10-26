---
"@marktiderman/genesis-supabase": minor
---

Migration `0014_genesis_feature_registry_hardening` (feature-mirror block) changes behaviour 0.6.0 shipped in 0008: server code is told apart from a person by the request's role (`current_setting('role')`), not by `request.jwt.claims`, so a session that switches to `authenticated` without claims is no longer treated as server code; `feature_shipped` answers a signed-in person only for customer-facing features; a flag that leaves the registry loses its `platform_value`; and `feature_entitlements` gets an index on `feature_id` for active rows. The docs now say to sync with the build time, not the time a deployment started.
