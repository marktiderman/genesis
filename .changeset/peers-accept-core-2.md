---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-switchboard": patch
"@marktiderman/genesis-forms-native": patch
"@marktiderman/genesis-forms-studio": patch
"@marktiderman/genesis-notifications": patch
"@marktiderman/genesis-studio": patch
"@marktiderman/genesis-product": patch
"@marktiderman/genesis-support": patch
---

Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.
