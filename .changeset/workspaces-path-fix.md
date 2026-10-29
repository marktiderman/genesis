---
"@marktiderman/genesis-core": patch
---

Workspaces: trailing slashes are trimmed with a loop instead of a regular expression, which was slow on a path with very many slashes (CodeQL js/polynomial-redos).
