---
"@marktiderman/genesis-cli": patch
---

The packages pack's follow-ups: a nested app's change gate sees a local package at the repository root; an `export type` without a semicolon no longer hides the import after it; `.js` export targets are left alone (they may be unbuilt output); a `localPackages` entry that leaves the repository is refused, not skipped; a version bump without a changeset asks for one with a `Features:` line; and `links.code` paths count from the repository root.
