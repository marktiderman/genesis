---
"@marktiderman/genesis-cli": minor
---

`genesis features build|check|find`. `build` writes everything generated from the repo's `features.ts`: the AGENTS.md pointer, `features.json`, the OpenFeature `flags.json`, the agent skill and an optional marketing block, and adds `@AGENTS.md` to CLAUDE.md. `check` fails CI on stale output, missing code paths, the flag rules, removed ids and unknown feature tags (`--labels` checks a PR's `feature:<id>` labels), and warns on the rest; `--summary` is for a SessionStart hook. `find <term>` searches the registry. Settings live in package.json under `genesisFeatures`.

Features: feature-registry
