---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-studio": patch
---

The optional `@hookform/resolvers` peer now accepts v6 (core and ui-native: `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0`; studio: `^5.1.0 || ^6.0.0`). v6's only breaking change is the Effect resolver moving to Effect v4; the zod resolver Genesis uses is unchanged, and the packages' tests now run on 6.0.
