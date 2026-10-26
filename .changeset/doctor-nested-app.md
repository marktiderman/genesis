---
"@marktiderman/genesis-cli": patch
---

`genesis doctor`: in an app with its own install inside another app's folder (growth90's `apps/mobile`), `duplicate-genesis-package` and `peer-range-mismatch` count only copies the app's own dependency graph resolves to. An undeclared, uninstalled peer dependency is unmet rather than met by the parent's `node_modules`, and the Genesis CLI's tree is followed only when the app declares the CLI. A regular dependency that resolves up to the parent still counts. Workspace members (no lockfile of their own) are unchanged.
