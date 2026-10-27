---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui-native": patch
---

- **Fix:** relation labels send each linked id with the type the cell holds (1 and "1" are both sent as given) and match returned rows either way.
- **Fix:** a native message catalogue written before `common.hiddenLink` still fits; the English is used when it's missing.
