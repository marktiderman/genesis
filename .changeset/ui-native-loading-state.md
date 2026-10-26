---
"@marktiderman/genesis-ui-native": minor
---

- `NativeLoadingState`: a centred spinner in the theme tint for a screen that is waiting (a redirect, a first load), announced as one "Loading" progress bar or by its `label`. Full screen inside the safe area by default; `fullScreen={false}` for a screen body, a section or a list footer.
- `ScreenContainer` takes `loading` (and `loadingLabel`): the loading state replaces the body inside the same safe area and background.
- `InboxPage`'s first load and "Loading more" footer use it.
