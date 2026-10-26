---
"@marktiderman/genesis-supabase": minor
---

Migration `0007_genesis_feature_registry` (block `feature-mirror`, needs `tenant-features`): the feature registry mirrored into the database on deploy (`features`, `feature_flags`, `sync_feature_registry`, never backwards), `feature_entitlements`, per-tenant `tenant_flag_values`, SQL `feature_on(tenant, feature)` for row security (shipped and, when paid, entitled), and `feature_gate_state(tenant)` for members. Client helpers `syncFeatureRegistry` and `featureGateState`.
