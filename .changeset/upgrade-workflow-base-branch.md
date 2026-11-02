---
"@marktiderman/genesis-cli": patch
---

The `genesis-upgrade` caller template the CLI ships shows the reusable workflow's new `base-branch`
input (the branch the upgrade starts from and its pull request targets; default: the repository's
default branch). The workflow also names its doctor artifact per `working-directory`, so a caller
can run it for two folders in one run.
