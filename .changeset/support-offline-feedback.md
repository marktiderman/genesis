---
"@marktiderman/genesis-support": minor
---

Feedback written offline is kept in the diagnostics offline queue (with `offline`, `diagnostics.enabled` and `diagnostics.offlineQueue` on) and sent later through the transport with its dump, without its screenshots; `submitFeedback` answers `{ queued: true }` and the native and web forms say it goes when the person is back online.
