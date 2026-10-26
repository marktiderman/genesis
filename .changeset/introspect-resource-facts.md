---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-core": minor
---

Resource facts from `@genesis` comments: tables take `noun` and `nounPlural`, columns `readonly` and `sensitive` (booleans). `genesis introspect` emits each resource as `as const satisfies ResourceContract<Row>` with a field-name union, so a bad setting fails to compile; row types are now type aliases. Core's `ResourceContract` gains `label`, `labelField`, `noun` and `nounPlural`, and `FieldSchema` gains `readOnly` and `sensitive`.
