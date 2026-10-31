---
"@marktiderman/genesis-cli": minor
---

`genesis agents --rules` checks a repo against the agent rules of engagement a script can check from the repository alone (docs/agents/RULES.md): **first-version** (a public package never released is at 0.1.0 and its changesets are patches) and **batch-ci** (a workflow on pull requests into main also runs on pull requests into the staging batches; `--batch` sets the pattern, default `staging/**`). Exits 1 on a break. The private `packages/agents`, which held only RULES.md, is retired: the rules now live in `docs/agents/RULES.md`.
