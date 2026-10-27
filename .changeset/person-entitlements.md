---
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-features": patch
---

Per-person entitlements. Migration 0016 adds `private.genesis_viewer_person_ids()`, a fail-closed wrapper over the app's `private.genesis_viewer_people(viewer)` hook. It gives the person records a login is, so every block resolves a viewer's people the same way. It is in the owner-access and feature-mirror blocks. Migration 0017 adds `feature_person_entitlements` (grants to the app's person record, written with the service-role `grant_person_entitlement` and `revoke_person_entitlement`). `feature_on`, `feature_entitled_tenants` and `feature_gate_state(tenant)` now count the signed-in person's own grants, and server code can call `feature_gate_state(tenant, person)`. `featureGateState(client, tenant, { personId })` passes the person. In genesis-features, the gate's `entitlements` doc now says it holds the person's grants too.

Features: feature-mirror, owner-access, feature-gate
