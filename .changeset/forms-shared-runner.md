---
"@marktiderman/genesis-forms": patch
---

`createDeliveryRunner` now runs on genesis-notifications' shared outbox runner (`createRunner` from `@marktiderman/genesis-notifications/runner`), bundled into this build, so forms still has no dependencies. Its options, outcomes, report and log lines are unchanged; `deliveryOutcome` and `defaultBackoff` are the shared ones.

Features: forms-destinations
