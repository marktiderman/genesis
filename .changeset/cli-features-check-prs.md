---
"@marktiderman/genesis-cli": patch
---

`genesis features check --prs` also reads merged PRs labelled `feature:<id>` for the planned features (one `gh pr list --search` per ten labels, with a 15-second timeout), and warns when one already shipped. When `gh` is missing, times out or fails, one warning gives the reason from `gh`'s stderr, `--summary` repeats it, and only changesets are checked. `--summary` counts planned features with shipped work.

Features: feature-evidence
