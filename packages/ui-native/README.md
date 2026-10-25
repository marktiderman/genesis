# @marktiderman/genesis-ui-native

Genesis React Native components and screen layouts for Expo apps (NativeWind). Every component
is listed in the [component reference](https://github.com/marktiderman/genesis/blob/main/docs/component-reference.md).

## Optional native modules

Some components draw better with a native module your app may or may not have. This package never
`require()`s one itself: you import what you installed and pass it once, near the root, and every
component falls back to plain React Native for whatever you leave out. (`GenesisNativeApp` from
`@marktiderman/genesis-native` takes the same object as its `modules` prop.)

```tsx
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { FlashList } from "@shopify/flash-list";
import * as GlassEffect from "expo-glass-effect";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import * as Reanimated from "react-native-reanimated";
import { GenesisModulesProvider } from "@marktiderman/genesis-ui-native";
import { lucideIcons } from "@marktiderman/genesis-ui-native/icons/lucide";

<GenesisModulesProvider
  modules={{ list: FlashList, image: Image, reanimated: Reanimated, glass: GlassEffect,
             symbol: SymbolView, icons: lucideIcons, datePicker: DateTimePicker }}
>
  {app}
</GenesisModulesProvider>;
```

| `modules.` | Package (`npx expo install …`) | Used by | Without it |
| --- | --- | --- | --- |
| `list` | `@shopify/flash-list` v2 (New Architecture only) | `NativeResourcePage`, `NotificationsPage` (sections become one list with sticky headers) | `FlatList` / `SectionList` |
| `image` | `expo-image` | `NativeAvatar`, `NativeImage`: memory and disk cache, `placeholder` (blurhash / thumbhash), `recyclingKey` (the URL by default) so recycled rows never flash the last picture, no cross-fade under Reduce Motion | React Native `Image` |
| `reanimated` | `react-native-reanimated` 4 (`import * as`) | `NativeToastProvider`, `NativeDrawer`, `NativeSkeleton`; all of them stay still under Reduce Motion | React Native `Animated` |
| `glass` | `expo-glass-effect` (`import * as`) | `NativeGlassSurface`: default toasts, the update banner, popovers and dropdown menus, as iOS 26 Liquid Glass | the solid surface |
| `symbol` | `expo-symbols` | `NativeIcon` on iOS (SF Symbols), and the drill-in chevron of `NativeListItem` | `icons` |
| `icons` | `lucide-react-native` 0.475+, through `lucideIcons` from `/icons/lucide` | `NativeIcon` on Android and web, and as the SF Symbol's fallback | an empty space of the icon's size, and a development warning |
| `datePicker` | `@expo/ui` (`@expo/ui/community/datetime-picker`) | `NativeDatePicker`, `NativeTimePicker`: SwiftUI on iOS, a Jetpack Compose dialog on Android | `@react-native-community/datetimepicker`, else a read-only label |

Glass is drawn only on iOS when both `isLiquidGlassAvailable()` (built with the iOS 26 SDK, running
iOS 26) and `isGlassEffectAPIAvailable()` (the API exists at run time) are true, and Reduce
Transparency is off. Success and destructive toasts keep their solid color, which carries their
meaning.

`NativeIcon` takes a semantic name (`"settings"`, `"bell"`, `"trash"`: `NATIVE_ICON_NAMES`), never a
library's own. It is decorative (hidden from screen readers) unless you give it a `label`.

**Gesture handler.** No component here needs `react-native-gesture-handler` except `NativeSheet`
when it draws with `@gorhom/bottom-sheet`. If you use that, install `react-native-gesture-handler`
as a direct dependency of your app (`npx expo install react-native-gesture-handler`) and wrap the
root in its `GestureHandlerRootView`; don't rely on another package bringing it in. The drawer's
swipe uses React Native's `PanResponder`.

## Keyboard toolbar

`KeyboardScrollProvider` (from `/layouts`) takes an optional `toolbar`: react-native-keyboard-controller's
`KeyboardToolbar`. With it, `AuthScreen` and `SettingsSubPage` show the previous / next / done bar
above the keyboard and keep the focused field clear of it. It needs the scroll view (`component`)
and the library's `KeyboardProvider`; `GenesisNativeApp` takes it as `keyboardToolbar`.

## Sign-in: `AuthScreen` and Sign in with Apple

`AuthScreen` (from `@marktiderman/genesis-ui-native/layouts`) is a whole sign-in screen: branding,
provider buttons, the email form and a footer, each a slot. In development on iOS it warns when it
offers a third-party provider without Sign in with Apple, which App Store Review Guideline 4.8
requires.

`appleProvider` adds Apple in one line, drawn with Apple's own `AppleAuthenticationButton` (Apple
requires its button; a look-alike is rejected). Pass `expo-apple-authentication` in; this package
doesn't import it.

```tsx
import * as AppleAuthentication from "expo-apple-authentication";
import { AuthScreen, appleProvider } from "@marktiderman/genesis-ui-native/layouts";

<AuthScreen
  branding={{ headline: "Welcome back" }}
  providers={[
    appleProvider({ apple: AppleAuthentication, onPress: onApple }),
    { id: "google", label: "Continue with Google", onPress: onGoogle },
  ]}
  form={{ onSubmit: signInWithEmail }}
/>;
```

- **`appleProvider({ apple, onPress, type?, appearance?, cornerRadius?, height?, label? })`**: a
  provider with id `"apple"`, or `null` off iOS or when `apple` is undefined. `AuthScreen` skips
  `null` entries, so the same list works on every platform. `type` is Apple's wording
  (`"continue"` by default, `"sign-in"`, `"sign-up"`); `appearance` `"auto"` is black in light mode
  and white in dark. `label` follows `type` and is used only by the dev warning and a custom
  `social` slot: Apple's button draws and announces its own localized text. `height` defaults to
  44, the recommended touch target (the HIG minimum for this button is 30pt).
- **`AppleSignInButton`**: the same button on its own, for a screen you compose yourself. While an
  `onPress` promise is pending it ignores further taps (so a double tap can't open a second sheet)
  and reports itself busy and disabled to accessibility; `disabled` does the same and dims it.
- **`SocialAuthProvider.render`**: any provider can draw its own button this way.
- `onPress` is usually `signInWithApple` from `@marktiderman/genesis-supabase/native`, which
  returns the full name Apple shares on the first sign-in only; save it with
  `supabase.auth.updateUser({ data: { full_name } })`. See that package's README.

## Deleting the account

`SettingsPage`'s `dangerousActions` is where "Delete account" goes: pass an action whose `onPress`
asks with `Alert.alert` (a destructive button) and then calls `deleteMyAccount(supabase)` from
`@marktiderman/genesis-supabase`. The example and the SQL it needs are in that package's README.

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
