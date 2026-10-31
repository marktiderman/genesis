---
"@marktiderman/genesis-cli": minor
---

App overlays: a consumer app's marked local copy of a Genesis package. A local package with a `@marktiderman/genesis-*` name now needs a `genesis.overlay` marker (`upstream`, `since`, `owner`, `reason`), and the doctor adds `overlay-unmarked` and `overlay-invalid` (errors), `overlay-age` (info after 14 days, which never fails a run; a warning after 30, which fails `--strict`) and `overlay-version` (a warning when the version isn't the upstream version, `<upstream>+local.N` (recommended) or `<upstream>-local.N`). A marked overlay is treated as the package it shadows: `shadowed-export`, `raw-tag`, `local-genesis-copy` and `native-raw-primitive` skip that package's names inside it, and `version-skew` and the packages pack's change gate skip it. Two fixes found with overlays: `package-migration-test` looks a block migration's test up in the package its `package` field names, and a component package whose exports point at TypeScript source with no `types` condition is read from that source. The README gains an Overlays section (wiring, Vite and Vitest settings, manual promotion).

Features: app-overlays, local-packages, cli-doctor
