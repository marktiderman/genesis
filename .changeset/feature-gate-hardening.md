---
"@marktiderman/genesis-features": patch
---

The gate's plain types (`FeatureStatus`, `FeatureAccess`, `FlagKind`, `FlagValue`) move to a zod-free file, so `/gate`'s type declarations no longer reach zod. `isSnapshotStale` treats a future-dated snapshot as stale, and `fromSnapshot` reads a damaged or older stored snapshot as off instead of throwing.
