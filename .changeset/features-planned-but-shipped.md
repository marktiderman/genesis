---
"@marktiderman/genesis-features": patch
---

`checkFeatureOutputs` warns, without failing, when a feature still marked `planned` already has shipped work tagged with it: a changeset with a `Features: <id>` line, or a merged PR passed in as `evidence: { prs: { <id>: [{ number, title }] } }`. The warning names each item ("billing is still planned, but .changeset/x.md and PR #123 shipped work for it"), the result lists them as `plannedButShipped`, and `summarizeCheck` counts them.

Features: feature-evidence
