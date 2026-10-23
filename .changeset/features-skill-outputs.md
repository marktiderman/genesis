---
"@marktiderman/genesis-features": patch
---

The generated skill names only what `build` writes in this repo (for example, no `flags.json` when `openfeature` is off), instead of a fixed list. The flag scan also ignores text inside strings ("…behind the release flag (off)" isn't a call), and an apostrophe after a letter (JSX "Don't") no longer starts a string.

Features: feature-registry
