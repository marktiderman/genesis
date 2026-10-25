---
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-cli": patch
---

**`NativeSheet` no longer crashes on open when `@gorhom/bottom-sheet` is installed somewhere in the workspace.** It used the library whenever `require("@gorhom/bottom-sheet")` resolved, but the library throws on open without its `BottomSheetModalProvider` (and needs gesture-handler's `GestureHandlerRootView` and Reanimated), which nothing mounted.

- By default the sheet is now React Native's own `Modal`, which needs no provider.
  - iOS: the system page sheet (`presentationStyle="pageSheet"`), which follows the finger when swiped down (`allowSwipeDismissal`).
  - Android: a bottom panel over a scrim, drawn under the system bars. A tap on the scrim or back closes it.
  - Content gets the sheet's own safe area, and the bottom inset is padded.
  - `disableBackdropDismiss` keeps it up against every way of dismissing it.
  - A sheet mounted open waits for the Reduce Motion setting before presenting.
- The library is used only when the app opts in, in either of two ways:
  - `GenesisNativeApp`'s new `bottomSheet` prop (`import * as BottomSheet from "@gorhom/bottom-sheet"`, then `bottomSheet={BottomSheet}`). It mounts the provider inside the data, session and blocks providers, since sheet content renders in the library's portal.
  - The new `NativeSheetProvider`.
  - A module missing an export is reported with `console.error`, and sheets fall back to the modal.
- On that path:
  - `enableDynamicSizing` is off, so `snapPoints` and `initialSnapIndex` mean what they say.
  - A dismiss that finishes after the app reopened the sheet isn't reported as the user closing it.
- New `NativeSheetScrollView`: the library's `BottomSheetScrollView` under the provider, React Native's `ScrollView` otherwise. The what's-new notes scroll in it.
- What may change for existing sheets:
  - The modal adds no padding of its own. The old fallback padded its content with `p-4`.
  - On iPhone the page sheet is nearly full height.
  - Sheets don't move above the keyboard.

**Classes inside `@marktiderman/genesis-native` now style its screens.** Its exports only pointed at `dist/`, whose JSX tsup compiles to `react/jsx-runtime` calls, which NativeWind's JSX transform never sees, so the update screens' (force upgrade, maintenance, banner, what's new) and the push prompt's `className`s did nothing. Like ui-native, it now ships `src` and has `react-native` export conditions pointing at it, so Metro compiles it with the app's NativeWind transform.

**`genesisNativewindContent()`** in `presets/nativewind` gives Tailwind the `src` and `dist` globs of every Genesis React Native package the app uses, found the way Node finds them (the app's node_modules, a hoisted workspace root or a workspace link), following their dependencies. `packages` adds starting points (your own wrapper package), and a listed package that isn't installed is warned about. `genesis init --native` and the starter use it in place of hand-written `node_modules` globs, which find nothing when a package is hoisted above the app.
