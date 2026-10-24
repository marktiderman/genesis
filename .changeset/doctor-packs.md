---
"@marktiderman/genesis-cli": minor
---

`genesis doctor` gains two opt-in rule packs, turned on with `doctor.packs` in genesis.config.json; apps without `packs` see no change. `native` (Expo apps on genesis-ui-native): `native-raw-primitive` (React Native primitives Genesis wraps, from the list the repo's forbidden-imports gate uses), `native-literal-color` (hex and rgb literals in native code, in place of `raw-color`), `native-custom-header` (a hidden navigator header with a hand-drawn one, or a hand-built tab bar), `native-screen-layout` (a route screen that renders none of the screen layouts the installed package exports) and `store-readiness` (export-compliance flag, Sign in with Apple beside third-party sign-in, iOS usage strings for installed modules, privacy manifest). With the pack on, the core rules read `@marktiderman/genesis-ui-native` and scan `app`, `src` and `components` by default. `supabase` (`supabase/migrations`): `migration-grants`, `migration-rls`, `migration-definer-search-path` and `migration-edited` (a migration that exists on `origin/main` was changed). New exports: `readPackageExports`, `nativeLayouts`, `sqlStatements`.

Features: doctor-native
