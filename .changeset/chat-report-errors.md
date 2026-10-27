---
"@marktiderman/genesis-chat": patch
---

Errors chat survives are reported through `reportError` from `@marktiderman/genesis-core/errors` instead of the console: `ChatErrorBoundary` without `onError` (`chat:render`, before: `console.error`), and on native a card's action that failed (`chat:attachment-action`) and an `attachmentKinds` entry that threw (`chat:attachment-kind`), which were written to the console in development only. With the native observability block they reach Sentry; with no reporter they still go to the console in development.
