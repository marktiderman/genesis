---
"@marktiderman/genesis-cli": minor
---

Features: client-layer, cli-doctor
The app client layer (ADR 0020): `genesis client init [--folder <dir>] [--type <name>]` scaffolds `src/client/` (or `genesis.config.json` `client.dir`): `client-layer.tsx`, `resource-view.tsx`, a type's `view.ts` and `appearance.tsx`, and `cells/`, `components/` and `view-types/`. Two doctor rules, warn level, once the layer exists: `client/layer` (a screen renders Genesis's `ResourceView` or `RecordView` directly) and `client/one-view-per-resource` (a second `defineView` over one contract).
