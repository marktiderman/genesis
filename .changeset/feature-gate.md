---
"@marktiderman/genesis-features": minor
---

The feature gate: `featureOn(registry, context, id)` checks status, platform, the tenant's switch, release flags (on only when exactly true) and last entitlement and returns `{ on, reason, unlock }`. `gateSnapshot` answers every shipped feature as plain JSON with `at` and `version` (no flag names), `isSnapshotStale` says when to refresh, `requireFeature` throws `FeatureOff` (402 for entitlement, 403 otherwise), and `/gate/react` adds `FeatureGateProvider`, `useFeature` and `FeatureGate`. `/gate` has no zod, for browsers, phones and edge functions.
