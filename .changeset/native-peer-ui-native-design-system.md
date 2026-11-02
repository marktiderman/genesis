---
"@marktiderman/genesis-native": minor
---

`@marktiderman/genesis-ui-native` (`>=3.3.0 <4.0.0`) and `@marktiderman/genesis-design-system` (`>=1.6.1 <2.0.0`) are peer dependencies instead of dependencies, as `@marktiderman/genesis-core` already is. As dependencies, a package manager could keep an older copy of each nested under genesis-native after an upgrade (Bun did), so the app loaded two copies and `genesis doctor` failed on the duplicates. The app lists both itself, as the native starter already does; npm, pnpm and Bun install a missing peer on their own.
