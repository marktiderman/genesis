---
"@marktiderman/genesis-forms-native": minor
---

`FormFocus` reports what it survives through `reportError` from `@marktiderman/genesis-core/errors` instead of `console.warn`: an `onQueued` that throws (`forms-native:on-queued`), a draft that can't be saved or cleared (`forms-native:draft-save`, `forms-native:draft-clear`) and a retry that can't start (`forms-native:retry`). With the native observability block they reach Sentry. `@marktiderman/genesis-core` is now a peer dependency (genesis-ui-native already depends on it).
