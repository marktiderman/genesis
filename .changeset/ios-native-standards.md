---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui-native": minor
---

iOS standards for every native screen (ADR 0028).

- **Row actions:** a view action can say where it swipes (`swipe: "leading" | "trailing" | { side, full } | false`), with an `icon` and a `tone`; `InboxSwipeAction` (also `RowSwipeAction`) takes the same `icon`, `tone`, `full` and `swipe`. `NativeSwipeRow` draws icons and iOS system colors, iOS 26's round style (`appearance="round"`), runs a side's `full` action on a full swipe, and puts the actions on the row for VoiceOver. New `NativeRowActions` and `NativeListItem` `actions`: swipe, long-press menu (the system context menu with `GenesisModules.menu`, `@expo/ui`'s `MenuView`) and accessibility actions from one list.
- **Round rows and peeks:** `appearance="round"` draws 50pt circles and turns the open row into a pill (systemGray5), as iOS 26 Messages does. `NativeRowActions` `preview` and `NativeContextMenu` `preview` show a peek above the menu; `InboxPage` takes `swipeAppearance` and `menuPreview`.
- **Tab bar per screen:** `TabBarVisibilityProvider`, `useHideTabBar`, `useTabBarHidden`, `ScreenContainer tabBar="hidden"` and `NativeTabBar hidden`, as UIKit's `hidesBottomBarWhenPushed`; `createPlaceExit` remembers where a place that hides the bar for its whole stack (Messages) goes back to.
- **Native header:** `ScreenContainer header` sets the stack's native header through `GenesisModules.router.StackScreen`; `composeHeaderOptions` takes `search` (`headerSearchBarOptions`) and `headerRightItems` / `headerLeftItems`. `NavBarSearchBar` is deprecated.
- Doctor rules `screens-use-native-header` and `tab-bar-hidden-per-screen`; icons `archive`, `bell-off`, `flag`, `mail-open`, `message-unread`, `pin-off`.
- `NativeResourceView` swipes by default (`NativeSwipeRow`; `swipeable={null}` turns it off) and, with `GenesisModules.menu`, opens the system context menu on long press instead of the alert.
- Swipes track the finger 1:1 and a full swipe runs past 0.6 of the row and at least 40pt past the side's open actions, as iOS; the actions stay unseen at rest (an inset row's margins never show them).
- `defineView` refuses a destructive action on a full swipe without a `confirm`. `useHideTabBar` needs `GenesisModules.router.useFocusEffect`; without it the bar stays shown, with a development warning.
- A row's swipe buttons show whenever it is off its resting place: driven by the row's translation with `GenesisModules.reanimated`, else by the swipe's open and close events, so a row opened from code (a ref's `openLeft()`) shows them too.
- A `tint` action is the brand's primary under a `GenesisThemeProvider` (its `accent`), else the theme's tint role. Text and icons on a `tint` or `red` action read on that color: the brand's declared `accent.foreground`, else black or white by contrast on a hex color, else the theme's `primaryForeground` / `destructiveForeground`. iOS system tones keep white (black on yellow), as iOS draws them; not every such pair reaches WCAG AA, while the Android fallbacks do.
- `InboxSwipeAction` takes `confirms` (its `onPress` asks first or can be undone); a destructive `full` action without it warns once in development. `NativeResourceView` sets it for a view action with a `confirm`. A swipe action now runs before the row closes.
- `NativeRowActions` keeps the child's own `onLongPress`, then opens the menu; `InboxPage` tells its `swipeable` slot the row already has the screen reader actions (`accessibilityActions: false`). `ScreenContainer` resets the options it set when a screen drops `header` altogether.

### Behaviour changes

Each is visible on upgrade and has a way out, so no code fails to compile and no codemod is needed:

- **List rows swipe by default.** With `GenesisModules.swipeable` set, `NativeResourceView` list rows now swipe by default: Edit and Delete trailing, plus view actions that set `swipe`, at most three a side. View actions without `swipe` stay in the long-press menu and VoiceOver's actions (a screen's own `swipeable` still gets them trailing, as before). Grid cards and `renderCard` rows don't swipe unless the screen passes `swipeable`; `swipeable={null}` turns it off.
- **`headerLargeTitle: false` is written.** `composeHeaderOptions` now writes `headerLargeTitle: false` when `large` is `false`, where it used to leave the key out, so a navigator's large-title default no longer carries into those screens. That covers ThreadPage and chat's thread, SettingsSubPage (whose default is `large: false`), and any InboxPage, SettingsPage, NotificationsPage or NativeRecordView given `large={false}`. A screen that wants the large title there passes `headerOptions: { headerLargeTitle: true }`, which wins over `large`.
- **The optional `react-native-gesture-handler` peer floor rises from `>=2.0.0` to `>=2.21.0`.** 2.20 and earlier name the swipe's open direction the other way, so a `full` swipe action would never run there (the swipe itself and its buttons still work). Upgrade gesture-handler to 2.21 or later (`npx expo install react-native-gesture-handler`; Expo SDK 53 and later already ship it), or leave `full` off your row actions.
