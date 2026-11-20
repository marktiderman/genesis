---
"@marktiderman/genesis-support": patch
---

`createSupport` hears sign-out from its creation, not only while its root is mounted, so a sign-out during boot or behind the fatal screen still clears the diagnostics queue and a waiting report. `dispose()` stops listening, for a block that is thrown away.

`block.diagnostics` and `block.reportProblem` are defined on the block after it is made, so they stay live under Babel's object-spread transform (it copied a getter written beside a spread once). `createSupport({ onFeedbackSent })` hears a report sent from `SupportRoute`'s feedback screen, for a one-line route file.
