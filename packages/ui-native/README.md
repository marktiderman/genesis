# @marktiderman/genesis-ui-native

Genesis React Native components and screen layouts for Expo apps (NativeWind). Every component
is listed in the [component reference](https://github.com/marktiderman/genesis/blob/main/docs/component-reference.md).

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

## Inbox and thread: `InboxPage` and `ThreadPage`

Two generic layouts for conversations (support tickets, direct messages, comment threads), in
`SettingsPage`'s iOS inset grouped style.

- **`InboxPage`**: rows with an unread dot or count, a short time (`9:41`, `Yesterday`, a
  weekday, a date), a two-line preview and a status line; pull to refresh, `onEndReached` paging
  and an empty state with an optional action. Each row's `swipeActions` are always reachable as
  VoiceOver / TalkBack custom actions and on long press (a menu); for the swipe gesture itself,
  fill the `swipeable` slot with react-native-gesture-handler's `ReanimatedSwipeable`. Slots:
  `row`, `swipeable`, `header`, `footer`, `empty`.
- **`ThreadPage`**: messages oldest first (mine trailing in the tint, theirs leading on
  `surface`), attachments, a read receipt under my newest message the other side has read
  (`readAt`), "load earlier", optimistic `sending` and `failed` messages with retry, and a
  composer. With `KeyboardScrollProvider` (the native shell's `keyboardScroll`) the messages and
  the composer scroll together above the keyboard; without it a `KeyboardAvoidingView` does.
  `composer={null}` makes it read-only with a `closedNotice`. Slots: `message`, `attachment`,
  `readReceipt`, `composer`, `composerAccessory`, `header`, `earlier`, `empty`.

`getInboxPageStackOptions()` and `getThreadPageStackOptions()` compose the header.
`@marktiderman/genesis-support/native` feeds both for a person's support reports.

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
