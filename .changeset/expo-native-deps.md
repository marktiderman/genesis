---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-native": patch
"@marktiderman/genesis-forms-native": patch
---

**New doctor rule `expo-native-deps` (native pack), and the Expo starter on its SDK's versions.**

- `genesis doctor` now makes the comparison `npx expo install --check` makes, offline: every installed package the installed `expo`'s `bundledNativeModules.json` names (the app's dependencies and devDependencies, plus `expo-modules-core` resolved from expo's real folder, pnpm's isolated store included) must be in the range that SDK expects, prereleases in range allowed and a React Native TV install compared by major.minor, as Expo does. `react-native` and `expo-modules-core` are errors: native code built for another React Native can crash the app at launch, in dyld, before any JavaScript runs. The others are warnings. The finding names an override or resolution that pins the installed version, in the app or at its install root (`expo install --fix` can't move one). `package.json` `expo.install.exclude` keeps a package off the check with Expo's meaning: a name always, `name@version` or `name@range` while the SDK's suggestion matches it. `genesis fix` points to `npx expo install --fix`, the reinstall and a new native build.
- The starter `genesis init --template native` copies is on Expo SDK 58.0.26's versions: `react-native` 0.88.1 (it was 0.88.0, which `expo` ~58.0.19 resolving to 58.0.26 and its `expo-modules-core` 58.1.0 don't support), with `react-native-safe-area-context`, `expo-web-browser`, `@sentry/react-native`, `@shopify/flash-list`, `@react-native-community/datetimepicker` and the other Expo modules at the versions `expo install --fix` writes. The pnpm settings a new app gets override `react-native` to 0.88.1.
- An app made from an earlier starter: run `genesis doctor`; on an `expo-native-deps` error, run `npx expo install --fix`, change `react-native` in `pnpm-workspace.yaml` `overrides` to the version it names, reinstall and make a new native build.
- genesis-native and genesis-forms-native: development dependencies only (`expo` ~58.0.26, `react-native` 0.88.1), so the repository installs one expo and one expo-modules-core. Nothing they ship changes.
