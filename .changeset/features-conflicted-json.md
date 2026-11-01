---
"@marktiderman/genesis-features": patch
---

`build` and `check` no longer skip the permanent-id check when `features.json` can't be parsed. A file left mid-merge is read on each side of its conflict markers, so an id removed on either side is still caught, and `build` then resolves the conflict by regenerating the file. Only git's seven-character markers count, so the nested conflict a `diff3` criss-cross merge writes inside the base section is skipped with the rest of the base. Any other unreadable `features.json`, an empty one included, is now an error that names the file (and the side of the conflict), where before the check passed silently. A leading byte-order mark is accepted.
