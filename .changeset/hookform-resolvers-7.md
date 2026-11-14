---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-studio": patch
"@marktiderman/genesis-cli": patch
---

The `@hookform/resolvers` peer now accepts v7 (core and ui-native: `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`; studio: `^5.1.0 || ^6.0.0 || ^7.0.0`), and `genesis studio init` installs `>=5.1.0 <8`, so an app already on 7 isn't asked to go back to 6. v7 changes two resolvers: the TypeBox resolver moves to `typebox` 1.x (the legacy `@sinclair/typebox` is no longer supported), and the `fluentvalidation-ts` resolver changes how it reports errors on array items. Genesis uses only the zod resolver, which ships byte-identical in 6.0.2 and 7.0.1, so Genesis's forms are unaffected, and the packages' tests now run on 7.0. `genesis init --template native` starts apps on `@hookform/resolvers` ^7.
