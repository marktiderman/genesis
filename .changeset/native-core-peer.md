---
"@marktiderman/genesis-native": minor
---

`@marktiderman/genesis-core` is a peer dependency (`>=2.1.0 <3.0.0`) instead of a dependency, so a fresh app installs one copy of core. A second copy kept the shell's data provider out of the screens' hooks. The app lists `@marktiderman/genesis-core` itself, as the native starter already does.
