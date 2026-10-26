---
"@marktiderman/genesis-cli": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-notifications": patch
"@marktiderman/genesis-native": patch
---

- `native-screen-layout` counts a route as a screen through `NativeLoadingState` only when a full-screen loading state is all it renders (header options and fragments aside). A route that also renders other content, imports it, or uses `fullScreen={false}` still needs a Genesis layout.
- Docs: `ScreenContainer`'s `loading` is for first loads (the body is unmounted while it's on); `loadingLabel` is visible and read aloud, so pass translated text; spread `notificationsPushPreferences` after your own keys.
