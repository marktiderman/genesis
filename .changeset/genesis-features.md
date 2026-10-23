---
"@marktiderman/genesis-features": patch
---

New package: a typed feature registry. `defineFeatures` and `defineFlags` in one `features.ts` that running code imports, with statuses through `deprecated` and `retired`, a dateless roadmap (`horizon`), `visibility` and `access`, `acceptance` sentences, permanent ids with `aliases`, `reviewedAt` and `claimedBy`, and optional marketing fields (`tagline`, `category`, `media`, `highlight`). Flags carry `kind`, `default`, `scopes`, `expires` and `runbook`. Generators: a short AGENTS.md pointer, `features.json`, an OpenFeature `flags.json`, the agent skill and a marketing block. `/node` builds and checks them with errors and warnings in tiers, scans code for flag reads and tests for `@feat:<id>` tags. `/react` has `FeatureList` (admin and marketing variants). The first version (0.1.0) is published by hand, so this patch is its first CI publish.

Features: feature-registry
