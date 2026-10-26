---
"@marktiderman/genesis-cli": patch
---

`genesis doctor` native pack: `native-raw-primitive` points a raw `ActivityIndicator` to `NativeLoadingState` first (then `NativeSkeleton`, `NativeProgress`), and `native-screen-layout` counts a route that renders `NativeLoadingState` as a screen.
