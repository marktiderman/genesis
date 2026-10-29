---
"@marktiderman/genesis-features": minor
"@marktiderman/genesis-sites": minor
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-product": minor
"@marktiderman/genesis-cli": patch
"@marktiderman/genesis-ai": patch
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-collab": patch
"@marktiderman/genesis-connect": patch
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-switchboard": patch
"@marktiderman/genesis-design-system": patch
"@marktiderman/genesis-extension": patch
"@marktiderman/genesis-forms": patch
"@marktiderman/genesis-forms-builder": patch
"@marktiderman/genesis-forms-devtools": patch
"@marktiderman/genesis-forms-native": patch
"@marktiderman/genesis-forms-react": patch
"@marktiderman/genesis-forms-studio": patch
"@marktiderman/genesis-forms-web": patch
"@marktiderman/genesis": patch
"@marktiderman/genesis-native": patch
"@marktiderman/genesis-notifications": patch
"@marktiderman/genesis-studio": patch
"@marktiderman/genesis-studio-server": patch
"@marktiderman/genesis-supabase": patch
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

Package layers. Every package's package.json now says where it sits: `genesis.layer`
(`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
`forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
"Layers").

- genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
  `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
  meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
  and `findFeatures(…, { layer: "element" })` finds both, until the next major.
- genesis-sites, genesis-support and genesis-product are modules: each declares a
  `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
  `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
  marks `/node` and its `genesis-product` bin as tooling.
- genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).
