---
"@marktiderman/genesis-support": patch
---

`createSupport` hears sign-out from its creation, not only while its root is mounted, so a sign-out during boot or behind the fatal screen still clears the diagnostics queue and a waiting report. `dispose()` stops listening, for a block that is thrown away.
