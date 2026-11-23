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
- Swipes track the finger 1:1 and a full swipe runs past 0.6 of the row, as iOS; the actions stay unseen at rest (an inset row's margins never show them).
- **What changes on upgrade:** with `GenesisModules.swipeable` set, `NativeResourceView` list rows now swipe by default: Edit and Delete trailing, plus view actions that set `swipe`, at most three a side. View actions without `swipe` stay in the long-press menu and VoiceOver's actions (a screen's own `swipeable` still gets them trailing, as before). Grid cards and `renderCard` rows don't swipe unless the screen passes `swipeable`; `swipeable={null}` turns it off.
- `defineView` refuses a destructive action on a full swipe without a `confirm`. `useHideTabBar` needs `GenesisModules.router.useFocusEffect`; without it the bar stays shown, with a development warning.

