---
"@marktiderman/genesis-features": patch
---

`build` and `check` no longer skip the permanent-id check when `features.json` can't be parsed. A file left mid-merge is read on each side of its conflict markers (and the diff3 base), so an id removed on either side is still caught, and `build` then resolves the conflict by regenerating the file. Any other unreadable `features.json`, an empty one included, is now an error that names the file (and the side of the conflict), where before the check passed silently. A leading byte-order mark is accepted.
