---
"@marktiderman/genesis-config": minor
---

Settings protocol: the tenant and person layers in the S4 shape. `SettingsWriteLayer` adds `tenant` and `person`; `state`, `setValue` and `clearValue` take an optional `tenant` (the tenant whose layer `state` returns and a tenant write changes), and `SettingsState.layers` may carry `tenant` and `person`. `<GenesisSettings>` is unchanged: it still writes the file and database layers only.
