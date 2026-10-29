---
"@marktiderman/genesis-features": minor
"@marktiderman/genesis-cli": minor
---

A feature's `kind` replaces its `layer` field. `kind` takes the same values (token, element, pattern, layout, hook, provider, block, service, tool); `layer` is still read as a kind until the next major (`"primitive"` as `"element"`), `features check` warns on it, and a feature that sets both to different kinds fails. A feature's layer is now its owning package's (foundation, primitive, module, tooling), derived from its `entry` imports or its `links.code` paths: `featurePackageLayer(def, packages)`, and `findFeatures(…, { packageLayer, packages })`. New exports: `FEATURE_KINDS`, `FeatureKind`, `featureKind`, `featurePackageLayer`, `FeaturePackage`; `FEATURE_LAYERS` and `FeatureLayer` are deprecated aliases.

`genesis features find` gains `--kind`; `--layer` now filters by the owning package's layer (foundation, module or tooling), and a kind passed to `--layer` still works with a warning until the next major (so `--layer primitive` still means the element kind until then). `genesis add` writes `kind:` into features.ts, and a block manifest's `feature.kind` (or its deprecated `feature.layer`) sets it.
