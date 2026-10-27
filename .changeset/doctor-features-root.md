---
"@marktiderman/genesis-cli": patch
---

`genesis doctor` compares features.ts from the repository root, so a nested app whose registry is the root's src/features.ts no longer warns when a package's exports change alongside it.
