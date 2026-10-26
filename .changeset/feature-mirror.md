---
"@marktiderman/genesis-supabase": minor
---

Migration `0008_genesis_feature_registry` (block `feature-mirror`, needs `tenant-features`): the feature registry mirrored into the database on deploy (`features`, `feature_flags`, `sync_feature_registry`, never backwards), `feature_entitlements`, per-tenant `tenant_flag_values`, SQL `feature_on(tenant, feature)` for row security (shipped and, when paid, entitled), and `feature_gate_state(tenant)` for members. Client helpers `syncFeatureRegistry` and `featureGateState`. Platform-wide flag values (`feature_flags.platform_value`) act as a kill switch over tenant values. Requests are judged by their role: an authenticated request without a person is refused, never treated as server code.
