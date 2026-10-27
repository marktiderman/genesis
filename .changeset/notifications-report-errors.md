---
"@marktiderman/genesis-notifications": patch
---

`NotificationsProvider` reports a realtime subscription that throws through `reportError` from `@marktiderman/genesis-core/errors` (`notifications:realtime-subscribe`) instead of `console.warn`; the feed keeps working without live updates. `@marktiderman/genesis-core` is an optional peer, needed by `/react`.
