---
"@marktiderman/genesis-design-system": patch
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-supabase": patch
---

The native `GenesisThemeProvider` passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens ("system" hands it back to the OS). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

Features: design-tokens, native-layouts, supabase-kit
