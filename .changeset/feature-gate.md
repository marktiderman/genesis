---
"@marktiderman/genesis-features": minor
---

The feature gate: `featureOn(registry, context, id)` checks status, platform, entitlement, the tenant's switch and release flags in that order and returns `{ on, reason, unlock }`. `gateSnapshot` answers every feature for a session, `requireFeature` throws `FeatureOff` (402 for entitlement, 403 otherwise), and `/gate/react` adds `FeatureGateProvider`, `useFeature` and `FeatureGate`. `/gate` has no zod, for browsers, phones and edge functions.
