---
"@marktiderman/genesis-features": patch
---

New package: a typed feature registry. `defineFeatures` and `defineFlags` in one `features.ts` that running code imports; `toJson` and `toAgentsMarkdown` generate everything else; `/node` builds and checks the generated files; `/react` has `FeatureList`, a ResourcePage with a status board and app and audience filters. The first version (0.1.0) is published by hand, so this patch is its first CI publish.
