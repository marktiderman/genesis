---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-studio": patch
---

The optional `@hookform/resolvers` peer now accepts v6 (core and ui-native: `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0`; studio: `^5.1.0 || ^6.0.0`). v6's listed breaking change is the Effect resolver moving to Effect v4. The zod resolver Genesis uses keeps its API, but builds its errors differently: for a union field it reports the branch with the fewest issues, so an app's messages on union fields can change when it upgrades. Genesis's own forms are unaffected, and the packages' tests now run on 6.0.
