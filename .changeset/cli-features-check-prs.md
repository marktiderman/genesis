---
"@marktiderman/genesis-cli": patch
---

`genesis features check --prs` also reads merged PRs labelled `feature:<id>` (with `gh pr list`) for each planned feature, and warns when one already shipped. When `gh` is missing or fails, it says so in one warning and checks changesets only. `--summary` counts planned features with shipped work.

Features: feature-evidence
