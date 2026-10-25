---
"@marktiderman/genesis-native": minor
---

New entry, `@marktiderman/genesis-native/dev-warnings`: `ignoreKnownDependencyWarnings(LogBox, __DEV__)` keeps the development warnings an app can't act on out of LogBox (today React Native 0.88's `ImageBackground` deprecation, which NativeWind's runtime sets off at start-up). In React Native 0.88 the first warning pins LogBox's "Open debugger to view warnings." pill over the native tab bar, so the first tab tap after a launch, or after a link brought the app forward, landed on the pill and seemed ignored. Call it from the app's entry file before requiring `expo-router/entry`, as the starter's `index.ts` now does; it does nothing in release builds. It removes that trigger only: any other warning (the app's own included) still shows the pill until the debugger is opened.

Features: native-app-shell
