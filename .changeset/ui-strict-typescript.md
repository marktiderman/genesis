---
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-forms-studio": patch
---

genesis-ui type-checks under `exactOptionalPropertyTypes` and `noPropertyAccessFromIndexSignature`; no behaviour change. Optional props an app may pass as `undefined` now say so (`?: T | undefined`), index-signature reads use brackets, and settings handed to hooks drop their `undefined` values first. genesis-forms-studio's `NavItemShape` widens `icon` and `disabled` the same way, so a `SubNavItem` still fits it under `exactOptionalPropertyTypes`.

A consumer with `exactOptionalPropertyTypes` that copies one of these exported types into its own `?: T` fields may need to add `| undefined` there too: `filterProps.statusChips`, `ViewSettings.defaultSort`, the WorkspaceSwitcher slot props `shortcut` and `classNames`, and `SubNavItem.icon` and `children`. `packages/ui/tsconfig.strict.json` now runs in CI so the source stays strict-clean.
