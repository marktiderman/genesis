---
"@marktiderman/genesis-cli": patch
---

`deprecated-import` ratchets by default: under `--base`, a deprecated import in a file that didn't change is reported as `info`, so upgrading Genesis never fails an app's strict CI on files nobody touched. Changed files still get the warning.
