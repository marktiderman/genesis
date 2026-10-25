---
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-native": minor
---

Optional native modules, passed in rather than required: `GenesisModulesProvider` (and
`GenesisNativeApp`'s `modules`) hands components FlashList v2 (`NativeResourcePage`,
`NotificationsPage`), expo-image (`NativeAvatar`, new `NativeImage`), Reanimated 4 (toast, drawer,
skeleton; Reduce Motion respected), expo-glass-effect (new `NativeGlassSurface`: default toasts,
the update banner, popovers and menus as iOS 26 Liquid Glass when both availability checks pass
and Reduce Transparency is off), expo-symbols and a lucide icon set (new `NativeIcon` with
semantic names, `lucideIcons` from `/icons/lucide`), and @expo/ui's drop-in date picker.
`KeyboardScrollProvider` takes a `toolbar` (`KeyboardToolbar`), shown on `AuthScreen` and
`SettingsSubPage`; `GenesisNativeApp` takes it as `keyboardToolbar`. Every module left out falls
back to what the component drew before. `lucide-react-native` is now an optional peer, only the
`/icons/lucide` subpath imports it.
