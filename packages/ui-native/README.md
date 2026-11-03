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

## Loading screens: `NativeLoadingState` and `ScreenContainer loading`

For a screen that is waiting (a redirect while the session loads, a first fetch), don't hand-roll
`<View><ActivityIndicator /></View>`. `NativeLoadingState` is a centred spinner in the theme tint,
read by screen readers as one "Loading" progress bar (or your `label`, which also shows under the
spinner). By default it fills the screen on the background, inside the safe area; `fullScreen={false}`
makes it a centred block for a screen body, a section or a list footer.

```tsx
import { NativeLoadingState, ScreenContainer } from "@marktiderman/genesis-ui-native";

if (!session) return <NativeLoadingState label="Signing you in" />;

<ScreenContainer scroll loading={isLoading} loadingLabel="Loading your plan">{body}</ScreenContainer>;
```

`ScreenContainer`'s `loading` puts the inline form in place of the body, keeping its safe area,
background and status bar. `InboxPage` uses it for its first load and "Loading more" footer. Use
`NativeSkeleton` for a placeholder shaped like the content, and `NativeProgress` for known progress.
`loading` is for a screen's first load: the body is unmounted while it's on, so don't use it to
cover a form the person is filling in (its state would be lost); show `NativeLoadingState
fullScreen={false}` or a button's busy state instead. `loadingLabel` is shown and read by
VoiceOver, so pass translated text; without it the screen reader hears `accessibilityLabel`
("Loading" by default) and nothing is shown.

`genesis doctor` (native pack) flags a raw `ActivityIndicator` from `react-native` and points here.
A route whose only screen is a full-screen `NativeLoadingState` (a redirect or loading bridge,
optionally with `Stack.Screen` options) counts as a screen for `native-screen-layout`; one that
also renders other content, imports it, or uses `fullScreen={false}` still needs a layout.

## Pull to refresh: `ScreenContainer onRefresh`

A screen that isn't a list (a dashboard, a profile) gets pull to refresh from its container, as
`InboxPage` and `NotificationsPage` have it. `onRefresh` puts a theme-tinted `NativeRefreshControl`
on the body; `refreshing` shows the spinner. Pulling needs a scroll view, so `onRefresh` makes the
body scroll (as `scroll` does). Without `onRefresh` nothing changes.

```tsx
import { ScreenContainer } from "@marktiderman/genesis-ui-native";

<ScreenContainer onRefresh={() => refetch()} refreshing={isRefetching}>{body}</ScreenContainer>;
```

Never use it around a list (`FlatList`, `SectionList`, `NativeResourceView`, `InboxPage`): a list
inside a ScrollView stops virtualizing and React Native warns. Those lists have their own pull to
refresh (`refreshControl`, or built in).

## Lists as cards: `NativeResourceView mode="grid"` and `renderCard`

`NativeResourceView` draws a view as cards with `mode="grid"` (`numColumns`, default 2), and an
app's own row or card with `renderCard(row, index, card)`; spread `card.pressableProps` on its
Pressable for the built-in press, long press and accessibility. Sections, paging, refresh, the
empty state and swipe actions stay. See docs/RESOURCE-VIEW.md, "Cards and custom rows".

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
- **`googleProvider({ onPress, label?, icon?, disabled?, enabled? })`**: a provider with id
  `"google"` ("Continue with Google"), drawn as the row's outline button, or `null` when `enabled`
  is false. Pass Google's "G" mark as `icon` (Genesis ships no Google artwork). `onPress` is
  usually `signInWithGoogle` from `@marktiderman/genesis-supabase/native`.
- **`SocialAuthProvider.render`**: any provider can draw its own button this way.
- `onPress` is usually `signInWithApple` from `@marktiderman/genesis-supabase/native`, which
  returns the full name Apple shares on the first sign-in only; save it with
  `supabase.auth.updateUser({ data: { full_name } })`. See that package's README.

## Deleting the account

`SettingsPage`'s `dangerousActions` is where "Delete account" goes: pass an action whose `onPress`
asks with `Alert.alert` (a destructive button) and then calls `deleteMyAccount(supabase)` from
`@marktiderman/genesis-supabase`. The example and the SQL it needs are in that package's README.

## Motion

Motion is defined once, in `@marktiderman/genesis-design-system`'s motion tokens (`resolveMotion`):
durations (`press`, `fast`, `base`, `ui`, `pulse`, …), easings (`out`, `swift`, `inOut`, `decelerate`)
and springs (`snappy`, `smooth`, `bouncy`). Web reads them as the design system's `--ds-dur-*` and
`--ds-ease-*` variables; on the phone, `useMotion()` gives the same tokens with the OS's Reduce
Motion applied, and `animateMotion` turns them into a Reanimated animation on the JS thread. Under
Reduce Motion it returns the final value, so nothing moves. Inside a worklet (a gesture's `onEnd`),
or when you need a completion callback (a worklet), build the config with `motionSpring` or
`motionTiming(motion, duration, Easing)` and call Reanimated yourself. Under Reduce Motion the
springs are stiff and critically damped, so they settle in a few frames. Pass the
brand's level (`useMotion({ level })`) until a provider carries it; without it, `calm`. A repeating
animation checks `motion.reduced` first. Drawer, Toast and Skeleton read their durations from the
tokens.

```tsx
import { animateMotion, useGenesisModules, useMotion } from "@marktiderman/genesis-ui-native";

function useSnapBack(offset: { value: number }) {
  const { reanimated } = useGenesisModules();
  const motion = useMotion();
  return (velocity: number) => {
    if (!reanimated) return;
    offset.value = animateMotion(reanimated, motion, 0, { spring: "snappy", velocity });
  };
}
```

The doctor's `motion-uses-tokens` rule warns on new code that writes a non-zero duration or spring as
a number literal in the config of `withTiming`, `withSpring`, `Animated.timing` or `Animated.spring`,
or in a Reanimated layout animation's `.duration()` / `.damping()` / `.stiffness()`. A named
constant, a config held in a variable, and a first argument containing parentheses aren't caught.

## Inbox and thread: `InboxPage` and `ThreadPage`

Two generic layouts for conversations (support tickets, direct messages, comment threads), in
`SettingsPage`'s iOS inset grouped style.

- **`InboxPage`**: rows with an unread dot or count, a short time (`9:41`, `Yesterday`, a
  weekday, a date), a two-line preview and a status line; pull to refresh, `onEndReached` paging
  and an empty state with an optional action. Each row's `swipeActions` are always reachable as
  VoiceOver / TalkBack custom actions and on long press (a menu); for the swipe gesture itself,
  fill the `swipeable` slot with react-native-gesture-handler's `ReanimatedSwipeable`. Slots:
  `row`, `swipeable`, `header`, `footer`, `empty`.
- **`ThreadPage`**: one conversation, built from the two atoms below.
  - **The list:**
    - messages oldest first (mine trailing in the tint, theirs leading on `surface`), and
      `kind: "event"` rows as centred, muted lines;
    - attachments, and a read receipt under my newest message the other side has read (`readAt`);
    - holds its place while earlier messages load (by themselves near the top, and with the
      "Load earlier" button, which VoiceOver needs);
    - follows the newest only when you're at the bottom, with a "Jump to latest" pill when you
      aren't;
    - `firstUnreadId` (a "New messages" divider), and `jumpTo` with `onLoadUntil` (go to a
      message, announced to VoiceOver);
    - `refreshing` (a quiet "Updating…" line while fresher rows load).
  - **Send states** are data: `sending`, `pending` (queued offline), `paused` (sign in to send),
    `failed` and `conflict`, with `onRetry` and `onDiscard` (also VoiceOver actions). Keep each
    message's `id` the same across refreshes (a cache, then the server), or the list jumps.
  - **The composer** grows as you type, has a 44pt send button, and takes `modes` with a tone: an
    `internal` mode ("Internal note") tints the bar and the note it sends.
  - **Keyboard:** with `GenesisModules.keyboardAvoidingView` (react-native-keyboard-controller's)
    the composer follows the keyboard frame by frame; without it, React Native's
    `KeyboardAvoidingView`. Dragging the list dismisses the keyboard.
  - **Read-only:** `composer={null}`, with a `closedNotice`.
  - **Slots:** `message`, `event`, `attachment`, `readReceipt`, `unreadDivider`, `composer`,
    `composerAccessory`, `headerRegion` (pinned above the list: a ticket's status and assignee),
    `header` (scrolls with the messages), `earlier`, `empty`.
- **`NativeThreadList`**: the list on its own, for a thread of your own. It renders the rows it's
  given and never fetches. FlashList v2's chat mode when the app passed `list`, else FlatList.
- **`NativeComposerBar`**: the composer on its own. It takes `leading`, `trailing` and `above`
  slots, and `modes`.

`getInboxPageStackOptions()` and `getThreadPageStackOptions()` compose the header.
`@marktiderman/genesis-support/native` feeds both for a person's support reports.

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
