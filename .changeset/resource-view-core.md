---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-studio": patch
---

`genesis-core/resource-view`: `defineView(contract, {...})` describes what a resource means to people (labels, display hints, column presets, tabs, form sections, guards, summary) with no React, checked once and frozen. A name the contract doesn't have throws `ViewDefinitionError` at start-up.

`isSafeUrl` and `normalizeLinkUrl` move to core (`genesis-core/urls`, also the root), so native and the extension use the same link check; genesis-ui re-exports them. The CSV helpers move to `genesis-core/csv`, and a cell that starts with spaces and then a formula character is now neutralised too.
