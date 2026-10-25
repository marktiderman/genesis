---
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-cli": patch
---

**`NativeSheet` no longer crashes on open when `@gorhom/bottom-sheet` is installed somewhere in the workspace.** It used the library whenever `require("@gorhom/bottom-sheet")` resolved, but the library throws on open without its `BottomSheetModalProvider` (and needs gesture-handler's `GestureHandlerRootView` and Reanimated), which nothing mounted. Now the sheet is React Native's own `Modal` by default, which needs no provider: the system page sheet on iOS (`presentationStyle="pageSheet"`, swipe down to close) and a bottom panel over a scrim on Android (scrim tap or back closes it, drawn under the system bars, padded by the bottom inset). `disableBackdropDismiss` keeps it up against all of those. The library is used only when the app opts in: `GenesisNativeApp`'s new `bottomSheet` prop (`import * as BottomSheet from "@gorhom/bottom-sheet"`, then `bottomSheet={BottomSheet}`) or the new `NativeSheetProvider`, which mounts `BottomSheetModalProvider`. A module missing an export is reported with `console.error` and sheets fall back to the modal. The what's-new sheet's notes now scroll.

**Classes inside `@marktiderman/genesis-native` now style its screens.** Its exports only pointed at `dist/`, whose JSX tsup compiles to `react/jsx-runtime` calls, which NativeWind's JSX transform never sees, so the update screens' (force upgrade, maintenance, banner, what's new) and the push prompt's `className`s did nothing. Like ui-native, it now ships `src` and has `react-native` export conditions pointing at it, so Metro compiles it with the app's NativeWind transform.

**`genesisNativewindContent()`** in `presets/nativewind` gives Tailwind the `src` and `dist` globs of every Genesis React Native package the app uses, found the way Node finds them (the app's node_modules, a hoisted workspace root or a workspace link), following their dependencies. `genesis init --native` and the starter use it in place of hand-written `node_modules` globs, which find nothing when a package is hoisted above the app.
